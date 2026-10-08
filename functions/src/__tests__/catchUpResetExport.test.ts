import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildActiveSessionResetValues,
  buildResetScope,
  catchUpRecordsByLearnerMeeting,
  collectResetBackup,
  executeResetDeletion,
  researchCsv,
  withCatchUpRecords,
} from '../exportDriveReport';
import { CATCHUP_COLLECTION, CATCHUP_EXPORT_COLUMNS, CATCHUP_NOTE_MAX_LENGTH, catchUpDocId, catchUpExportCells, sanitizeCatchUpNote, type CatchUpRecord } from '../catchUp';

/**
 * Catch-up time (owner, 2.10.2026): "המורה יקח את אותם ילדים שלא סיימו למפגש
 * נוסף \ זמן נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל
 * הקבוצה למפגש הבא".
 *
 * Register 10 / 20: a meeting reset clears that meeting's finished mark, its
 * saved workspace and its catch-up record (backed up first); a full learner
 * reset deletes all of the learner's records; level 3 deletes everything.
 * reset_audit_log is never in scope. Register gap יג: the meetings file gains
 * four catch-up columns at the end; every earlier column keeps its place.
 */

type Doc = { id: string; data: Record<string, unknown> };

/** A Firestore stand-in for the reset helpers: collection → documents. */
function fakeDb(collections: Record<string, Doc[]>) {
  const deleted: string[] = [];
  const query = (name: string, filter?: { field: string; values: unknown[] }) => {
    const docs = () => (collections[name] ?? [])
      .filter((d) => !deleted.includes(`${name}/${d.id}`))
      .filter((d) => !filter || filter.values.includes(d.data[filter.field]))
      .sort((a, b) => a.id.localeCompare(b.id));
    const snapOf = (list: Doc[]) => ({
      empty: list.length === 0,
      size: list.length,
      docs: list.map((d) => ({ id: d.id, data: () => d.data, ref: { path: `${name}/${d.id}` } })),
    });
    const q: any = {
      where: (field: string, _op: string, values: unknown[]) => query(name, { field, values }),
      orderBy: () => q,
      limit: () => q,
      startAfter: (last: { id: string }) => ({ get: async () => snapOf(docs().filter((d) => d.id > last.id)) }),
      get: async () => snapOf(docs()),
    };
    return q;
  };
  const db: any = {
    collection: (name: string) => query(name),
    batch: () => {
      const pending: string[] = [];
      return { delete: (ref: { path: string }) => pending.push(ref.path), commit: async () => { deleted.push(...pending); } };
    },
  };
  return { db, deleted };
}

const fakeRtdb: any = {
  ref: () => ({
    get: async () => ({ val: () => null, exists: () => false, hasChildren: () => false, numChildren: () => 0 }),
    update: async () => undefined,
    remove: async () => undefined,
  }),
};

const catchUpDoc = (meeting: number, learner: number): Doc => ({
  id: catchUpDocId(meeting, learner),
  data: { student_id: learner, session_number: meeting, class_id: 'class_1', rounds: {} },
});

const allCatchUpDocs = () => [catchUpDoc(3, 4), catchUpDoc(4, 4), catchUpDoc(3, 5), catchUpDoc(4, 5)];

const catchUpEntries = (scope: ReturnType<typeof buildResetScope>) => scope.firestore.filter((e) => e.collection === CATCHUP_COLLECTION);

describe('reset scope — catchup_records handled exactly as sessions', () => {
  const cases: Array<[string, ReturnType<typeof buildResetScope>]> = [
    ['meeting reset of one learner', buildResetScope('single_student', '4', 'active_session', 3, 'student')],
    ['class meeting reset', buildResetScope('single_student', '4', 'active_session', 3, 'class')],
    ['full learner reset', buildResetScope('single_student', '4', 'full_student', null, 'student')],
    ['level 3', buildResetScope('system', 'all', 'full_student', null, 'student')],
  ];

  it.each(cases)('%s: one catchup_records entry, the same as the sessions entry', (_label, base) => {
    const scope = withCatchUpRecords(base);
    const sessions = scope.firestore.filter((e) => e.collection === 'sessions');
    const catchUp = catchUpEntries(scope);
    expect(sessions).toHaveLength(1);
    expect(catchUp).toHaveLength(1);
    // PRD 23א §ב.2: a session reset keeps the meeting's catch-up record (shown
    // under "לפני האיפוס"); it is backed up, never deleted. A full learner reset
    // and level 3 delete it with the session documents.
    const meetingScoped = sessions[0].sessionNumber !== undefined;
    expect(catchUp[0].backupOnly).toBe(meetingScoped ? true : sessions[0].backupOnly);
    expect({ ...catchUp[0], collection: 'sessions', backupOnly: sessions[0].backupOnly }).toEqual(sessions[0]);
    // Every other entry, and the RTDB part, are exactly the base scope's.
    expect(scope.firestore.slice(0, base.firestore.length)).toEqual(base.firestore);
    expect(scope.rtdbPaths).toEqual(base.rtdbPaths);
    expect(scope.fieldResets).toEqual(base.fieldResets);
  });

  it.each(cases)('%s: reset_audit_log is never in scope', (_label, base) => {
    expect(withCatchUpRecords(base).firestore.map((e) => e.collection)).not.toContain('reset_audit_log');
  });

  it('does not change the scope it was given', () => {
    const base = buildResetScope('single_student', '4', 'full_student', null, 'student');
    const before = JSON.stringify(base);
    withCatchUpRecords(base);
    expect(JSON.stringify(base)).toBe(before);
  });

  it('the reset itself is built with it', () => {
    const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
    expect(src).toContain('const scope = withCatchUpRecords(buildResetScope(reset_level, rawNum, singleScope, activeSessionNumber, resetTarget));');
  });
});

describe('reset deletion — which catch-up records go', () => {
  const run = async (scope: ReturnType<typeof buildResetScope>) => {
    const { db, deleted } = fakeDb({ [CATCHUP_COLLECTION]: allCatchUpDocs(), sessions: [] });
    const backup = await collectResetBackup(fakeRtdb, db, scope, {
      reset_id: 'r', reset_level: 'single_student', class_id: 'class_1', affected_student_ids: [4], performed_by_teacher_id: 't',
    });
    const counts = await executeResetDeletion(fakeRtdb, db, scope);
    return {
      backedUp: backup.firestore[CATCHUP_COLLECTION].map((d) => d.id).sort(),
      deleted: deleted.filter((p) => p.startsWith(`${CATCHUP_COLLECTION}/`)).map((p) => p.split('/')[1]).sort(),
      failures: counts.failures,
    };
  };

  it('meeting reset of learner 4 in meeting 3: backed up, and kept (PRD 23א §ב.2)', async () => {
    const r = await run(withCatchUpRecords(buildResetScope('single_student', '4', 'active_session', 3, 'student')));
    expect(r.failures).toEqual([]);
    expect(r.backedUp).toEqual(['session_03_student_4', 'session_04_student_4']);
    expect(r.deleted).toEqual([]);
  });

  it('class meeting reset of meeting 3: every record backed up, none deleted (PRD 23א §ב.2)', async () => {
    const r = await run(withCatchUpRecords(buildResetScope('single_student', '4', 'active_session', 3, 'class')));
    expect(r.backedUp).toHaveLength(4);
    expect(r.deleted).toEqual([]);
  });

  it('full learner reset of learner 4: all of learner 4\'s records', async () => {
    const r = await run(withCatchUpRecords(buildResetScope('single_student', '4', 'full_student', null, 'student')));
    expect(r.backedUp).toEqual(['session_03_student_4', 'session_04_student_4']);
    expect(r.deleted).toEqual(['session_03_student_4', 'session_04_student_4']);
  });

  it('level 3: every record', async () => {
    const r = await run(withCatchUpRecords(buildResetScope('system', 'all', 'full_student', null, 'student')));
    expect(r.backedUp).toHaveLength(4);
    expect(r.deleted).toHaveLength(4);
  });
});

describe('reset values — the meeting\'s finished mark and saved workspace', () => {
  it.each([1, 2, 3, 5, 8])('meeting %i: clears only its own completedMeetings and workspaceByMeeting keys', (m) => {
    const values = buildActiveSessionResetValues(m, { highestCompletedMeeting: 8 });
    expect(values[`completedMeetings/m${m}`]).toBeNull();
    expect(values[`workspaceByMeeting/m${m}`]).toBeNull();
    // Never the whole map: the other meetings' marks and copies stay.
    expect('completedMeetings' in values).toBe(false);
    expect('workspaceByMeeting' in values).toBe(false);
    const perMeeting = Object.keys(values).filter((k) => k.startsWith('completedMeetings/') || k.startsWith('workspaceByMeeting/'));
    expect(perMeeting.sort()).toEqual([`completedMeetings/m${m}`, `workspaceByMeeting/m${m}`]);
  });
});

describe('research export — the meetings file', () => {
  const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
  const fn = src.slice(src.indexOf('export const exportResearchDataset'));

  it('reads catchup_records once, before the rows', () => {
    expect(fn.match(/db\.collection\(CATCHUP_COLLECTION\)/g)).toHaveLength(1);
    const read = fn.indexOf('const catchUpByKey = catchUpRecordsByLearnerMeeting(await readAllDocs(db.collection(CATCHUP_COLLECTION)));');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(fn.indexOf('for (const [k, events] of Array.from(byLearnerMeeting.entries()).sort())'));
  });

  it('the four columns come last, after every existing column', () => {
    const push = fn.slice(fn.indexOf('meetingRows.push({'));
    const end = push.indexOf('\n      });');
    const row = push.slice(0, end);
    expect(row.trimEnd().endsWith('...catchUpExportCells(catchUpByKey.get(k)),')).toBe(true);
    // The earlier columns are unchanged and still in their places.
    expect(row.indexOf('was_reset:')).toBeLessThan(row.indexOf('reset_times_iso:'));
    expect(row.indexOf('...afterValues,')).toBeLessThan(row.indexOf('...catchUpExportCells('));
  });

  it('a row\'s header order: the existing columns, then the four', () => {
    const existing = { student_id: 4, session_number: 3, was_reset: '', reset_count: 0, reset_times_iso: '', chat_help_requests: 0 };
    const rec: Partial<CatchUpRecord> = {
      student_id: 4, session_number: 3, class_id: 'class_1',
      rounds: {
        r_2: { action: 'continue', reason: 'technical_fault', note: 'המחשב נתקע', stopped_at: null, recorded_by: 't', recorded_at: 2, opened_at: null, closed_at: null, closed_by: null, active_minutes: null },
        r_1: { action: 'reopen', reason: 'slow_pace', note: null, stopped_at: null, recorded_by: 't', recorded_at: 1, opened_at: 10, closed_at: 20, closed_by: 'teacher', active_minutes: 7 },
      },
    };
    const csv = researchCsv([{ ...existing, ...catchUpExportCells(rec) }, { ...existing, ...catchUpExportCells(undefined) }]);
    const [header, withRecord, without] = csv.replace('﻿', '').split('\n');
    expect(header).toBe([...Object.keys(existing), ...CATCHUP_EXPORT_COLUMNS].map((c) => `"${c}"`).join(','));
    expect(withRecord.endsWith('"1","7","slow_pace|technical_fault","המחשב נתקע"')).toBe(true);
    expect(without.endsWith('"0","0","",""')).toBe(true);
  });

  it('a note written past the client check is scrubbed before the export prints it', () => {
    const rec: Partial<CatchUpRecord> = {
      student_id: 4, session_number: 3, class_id: 'class_1',
      rounds: {
        r_1: { action: 'continue', reason: 'other', note: '  התקשר לאמא 050-1234567 או a.b@example.com  ', stopped_at: null, recorded_by: 't', recorded_at: 1, opened_at: null, closed_at: null, closed_by: null, active_minutes: null },
      },
    };
    const note = String(catchUpExportCells(rec).catchup_note);
    expect(note).not.toMatch(/050|1234567|example\.com/);
    expect(note).toContain('התקשר לאמא');
    expect(sanitizeCatchUpNote('א'.repeat(900)).length).toBe(CATCHUP_NOTE_MAX_LENGTH);
    expect(sanitizeCatchUpNote('   ')).toBe('');
    expect(sanitizeCatchUpNote(42)).toBe('');
  });
});

describe('research export — records keyed by learner and meeting', () => {
  it('reads the fields, else the document id; skips what names no learner or meeting', () => {
    const map = catchUpRecordsByLearnerMeeting([
      { id: 'session_03_student_4', data: { student_id: 4, session_number: 3, rounds: {} } },
      { id: 'session_05_student_11', data: { rounds: {} } },
      { id: 'junk', data: { rounds: {} } },
      { id: 'session_02_student_13', data: null },
    ]);
    expect(Array.from(map.keys()).sort()).toEqual(['11:5', '4:3']);
  });
});
