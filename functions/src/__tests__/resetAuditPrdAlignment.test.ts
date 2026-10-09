import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as realAdmin from 'firebase-admin';

/**
 * PRD v7.4, Module 23א §ב.1, §ד, §ז and Module 24 §ב — the reset audit trail
 * against the text:
 *
 * 1. l.1048 — records_deleted_count counts deleted records: a Firestore
 *    document or an RTDB node is one record. A learner reset counted the
 *    record's fields (one record with ten fields was "10 records").
 * 2. l.1105 — every time in every research file is ISO text. Times stored as
 *    epoch ms (performed_at, created_at, submitted_at, timestamp) reached the
 *    reset-log and reflections files as thirteen-digit numbers.
 * 6. Appendix A — created_at is a number, the server time the entry was written.
 * 8. l.1014 — the alerts reset is always class-wide: all 12 learners logged.
 * 9. l.1085 — the dashboard names the reset (reset_id), the entry is stored
 *    under that id, and the same id never runs a second reset.
 */

const h = vi.hoisted(() => ({
  rtdbData: {} as Record<string, unknown>,
  rtdbWrites: [] as Array<{ op: string; path: string }>,
  docs: {} as Record<string, Record<string, unknown>>,
  /** Per doc path, values that successive get() calls return (then docs[path]). */
  getSequence: {} as Record<string, Array<Record<string, unknown> | null>>,
  collections: {} as Record<string, Array<{ id: string; data: Record<string, unknown> }>>,
  sets: [] as Array<{ name: string; id: string; values: Record<string, unknown> }>,
  saved: [] as Array<{ path: string; content: string }>,
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() { throw new Error('no Drive credentials in tests'); }
  },
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const snapOf = (v: unknown) => {
    const isObj = v !== null && typeof v === 'object';
    return {
      val: () => (v === undefined ? null : v),
      exists: () => v !== undefined && v !== null,
      hasChildren: () => isObj && Object.keys(v as object).length > 0,
      numChildren: () => (isObj ? Object.keys(v as object).length : 0),
    };
  };
  const database = () => ({
    ref: (path = '') => ({
      get: async () => snapOf(h.rtdbData[path]),
      set: async () => { h.rtdbWrites.push({ op: 'set', path }); },
      update: async () => { h.rtdbWrites.push({ op: 'update', path }); },
      remove: async () => { h.rtdbWrites.push({ op: 'remove', path }); },
    }),
  });
  const query = (name: string): any => {
    const q: any = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      startAfter: () => ({ get: async () => ({ docs: [], empty: true, size: 0 }) }),
      get: async () => {
        const docs = (h.collections[name] ?? []).map(({ id, data }) => ({ id, data: () => data, ref: {} }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
    return q;
  };
  const firestore = Object.assign(
    () => ({
      collection: (name: string) => ({
        ...query(name),
        doc: (id: string) => ({
          get: async () => {
            const key = `${name}/${id}`;
            const seq = h.getSequence[key];
            const data = seq && seq.length > 0 ? seq.shift() : h.docs[key];
            return { exists: data !== undefined && data !== null, data: () => data ?? undefined };
          },
          set: async (values: Record<string, unknown>) => {
            h.sets.push({ name, id, values });
            h.docs[`${name}/${id}`] = values;
          },
          update: async (values: Record<string, unknown>) => {
            h.docs[`${name}/${id}`] = { ...(h.docs[`${name}/${id}`] ?? {}), ...values };
          },
        }),
      }),
      batch: () => ({ delete: () => {}, commit: async () => {} }),
      runTransaction: async (fn: (tx: any) => Promise<unknown>) =>
        fn({ get: async () => ({ exists: false, data: () => undefined }), set: () => {}, delete: () => {} }),
    }),
    actual.firestore
  );
  const storage = () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: (path: string) => ({
        save: async (buffer: Buffer) => { h.saved.push({ path, content: Buffer.from(buffer).toString('utf-8') }); },
        getSignedUrl: async () => ['https://signed.example/file'],
      }),
    }),
  });
  const app = () => { throw new Error('no default app in tests'); };
  return { ...actual, default: { ...actual, database, firestore, storage, app }, database, firestore, storage, app };
});

import {
  backupAndResetSessionData,
  buildResetScope,
  executeResetDeletion,
  exportResearchDataset,
  isoTimeFields,
  researchCsv,
  rtdbRecordCount,
} from '../exportDriveReport';
import { exportAuditEntry, isClientResetId, replayOutcomeOfEntry } from '../resetAudit';
import * as admin from 'firebase-admin';

const teacherAuth = { uid: 'teacher-uid', token: { role: 'teacher', roles: ['TEACHER'], teacher: true, class_id: 'class_1' } };
const reset = (data: Record<string, unknown>) => (backupAndResetSessionData as any).run({
  auth: teacherAuth,
  data: { reason: 'technical_fault', class_id: 'class_1', ...data },
});
const exportAll = () => (exportResearchDataset as any).run({ auth: teacherAuth, data: { class_id: 'class_1', session_number: 'all' } });

const auditSets = () => h.sets.filter((s) => s.name === 'reset_audit_log');
const snap = (v: unknown) => ({
  exists: () => v !== undefined && v !== null,
  hasChildren: () => !!v && typeof v === 'object' && Object.keys(v as object).length > 0,
  numChildren: () => (v && typeof v === 'object' ? Object.keys(v as object).length : 0),
});
const TEN_FIELDS = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}`, i + 1]));

beforeEach(() => {
  h.rtdbData = {};
  h.rtdbWrites.length = 0;
  h.docs = {};
  h.getSequence = {};
  h.collections = {};
  h.sets.length = 0;
  h.saved.length = 0;
});

describe('1 — records_deleted_count counts records, not fields (l.1048)', () => {
  it('a node that is one record counts one; a root counts the nodes under it', () => {
    expect(rtdbRecordCount('users/students/student_user4', snap(TEN_FIELDS))).toBe(1);
    expect(rtdbRecordCount('chat_messages/student_user4', snap({ m1: {}, m2: {}, m3: {} }))).toBe(1);
    expect(rtdbRecordCount('recordings/student_user4', snap({ r1: {} }))).toBe(1);
    expect(rtdbRecordCount('users/students', snap({ student_user4: TEN_FIELDS, student_user5: {} }))).toBe(2);
    expect(rtdbRecordCount('chat_messages', snap({ student_user4: { m1: {} }, student_user5: { m1: {} } }))).toBe(2);
    expect(rtdbRecordCount('radar_alerts', snap({ a: 1, b: 2, c: 3 }))).toBe(3);
    expect(rtdbRecordCount('sessions', snap(5))).toBe(1);
    expect(rtdbRecordCount('users/students/student_user4', snap(undefined))).toBe(0);
  });

  it('the same learner record counts one whichever reset deletes it', async () => {
    h.rtdbData['users/students/student_user4'] = TEN_FIELDS;
    const full = await executeResetDeletion(admin.database(), admin.firestore(), buildResetScope('single_student', '4', 'full_student'));
    expect(full.realtime_database['users/students/student_user4']).toBe(1);
    expect(full.total).toBe(1);

    h.rtdbData = { 'users/students': { student_user4: TEN_FIELDS } };
    const system = await executeResetDeletion(admin.database(), admin.firestore(), buildResetScope('system', ''));
    expect(system.realtime_database['users/students']).toBe(1);
    expect(system.total).toBe(1);
  });

  it('end to end: a full learner reset with a record and a chat logs 2', async () => {
    h.rtdbData['users/students/student_user4'] = { ...TEN_FIELDS, isASD: true };
    h.rtdbData['chat_messages/student_user4'] = { m1: { text: 'x' }, m2: { text: 'y' } };
    const result = await reset({ reset_level: 'single_student', reset_scope: 'full_student', student_id: 4 });
    expect(result.deletedRecords).toBe(2);
    const id = result.resetId as string;
    expect(h.docs[`reset_audit_log/${id}`]).toMatchObject({ records_deleted_count: 2, deletion_status: 'completed' });
  });
});

describe('2 — every time in the research files is ISO text (l.1105)', () => {
  it('isoTimeFields: numeric *_at and timestamp become ISO; everything else stays', () => {
    const row = isoTimeFields({
      performed_at: 1_759_400_000_000,
      created_at: 1_759_400_000_500,
      backup_drive_copied_at: null,
      submitted_at: 1_759_400_001_000,
      timestamp: 1_759_400_002_000,
      client_timestamp: 1_759_400_003_000,
      records_deleted_count: 3,
      session_number: 3,
      late_recording_drive: { k1: { copied_at: 1_759_400_004_000, drive_link: 'x' } },
    });
    expect(row.performed_at).toBe('2025-10-02T10:13:20.000Z');
    expect(row.created_at).toBe('2025-10-02T10:13:20.500Z');
    expect(row.backup_drive_copied_at).toBeNull();
    expect(row.submitted_at).toBe('2025-10-02T10:13:21.000Z');
    expect(row.timestamp).toBe('2025-10-02T10:13:22.000Z');
    // The actions file's raw client time is not a *_at field and is not touched.
    expect(row.client_timestamp).toBe(1_759_400_003_000);
    expect(row.records_deleted_count).toBe(3);
    expect(row.session_number).toBe(3);
    expect(row.late_recording_drive.k1.copied_at).toBe('2025-10-02T10:13:24.000Z');
  });

  it('the export: reset log and reflections carry ISO times; the actions file keeps its raw client_timestamp', async () => {
    h.collections.reset_audit_log = [
      {
        id: 'reset_new',
        data: {
          reset_id: 'reset_new', reset_level: 'single_student', reset_scope: 'active_session', session_number: 3,
          performed_by_teacher_id: 'teacher-uid', performed_at: 1_759_400_000_000, class_id: 'class_1',
          affected_student_ids: [4], backup_file_url: 'gs://b/x.json', backup_status: 'success',
          reset_reason: 'technical_fault', reason_note: null, records_deleted_count: 1,
          backup_channel: 'storage', backup_drive_copied_at: 1_759_500_000_000, deletion_status: 'completed',
          created_at: 1_759_400_000_100,
        },
      },
      {
        // An entry written before 9.10.2026: created_at is a Firestore Timestamp.
        id: 'reset_old',
        data: {
          reset_id: 'reset_old', reset_level: 'alerts', performed_by_teacher_id: 'teacher-uid',
          performed_at: 1_759_300_000_000, class_id: 'class_1', affected_student_ids: [1],
          backup_file_url: null, backup_status: 'not_required', reset_reason: 'other', reason_note: null,
          records_deleted_count: 0, created_at: new realAdmin.firestore.Timestamp(1_759_300_000, 282_943_000),
        },
      },
    ];
    h.collections.srl_reflections = [
      { id: 'session_08_student_4', data: { student_id: 4, session_id: 'session_08_student_4', session_number: 8, effort_level: 'HIGH', selected_strategies: ['a'], persistence_index: 50, submitted_at: 1_759_600_000_000 } },
    ];
    h.collections.telemetry_logs = [
      { id: 'k1', data: { student_id: 4, session_id: 'session_03_student_4', exercise_id: 'e1', event_type: 'SESSION_STARTED', client_timestamp: 1_759_400_005_000, details: {} } },
    ];
    const result = await exportAll();
    expect(result.status).toBe('SUCCESS');
    const fileOf = (label: string) => h.saved.find((f) => f.path.endsWith('.csv') && f.path.includes(label))?.content ?? '';

    const resetLog = fileOf('יומן_איפוסים') || fileOf('יומן איפוסים');
    expect(resetLog).toContain('"2025-10-02T10:13:20.000Z"'); // performed_at
    expect(resetLog).toContain('"2025-10-02T10:13:20.100Z"'); // created_at as ms
    expect(resetLog).toContain('"2025-10-03T14:00:00.000Z"'); // backup_drive_copied_at
    expect(resetLog).toContain('"2025-10-01T06:26:40.283Z"'); // created_at as an old Timestamp
    expect(resetLog).not.toMatch(/"1759[0-9]{9}"/);

    const reflections = fileOf('רפלקציות');
    expect(reflections).toContain('"2025-10-04T17:46:40.000Z"');
    expect(reflections).not.toContain('1759600000000');

    const actions = fileOf('פעולות');
    expect(actions).toContain('"1759400005000"');
    expect(actions).toContain('"2025-10-02T10:13:25.000Z"');
  });

  it('a reset-log file with both created_at shapes passes the PII gate', () => {
    const csv = researchCsv([
      isoTimeFields({ created_at: 1_759_400_000_100 }),
      isoTimeFields({ created_at: new realAdmin.firestore.Timestamp(1_759_300_000, 282_943_000) }),
    ]);
    expect(csv).not.toMatch(/282943000|_seconds/);
  });
});

describe('6 — created_at is the server time in ms (Appendix A)', () => {
  it('alerts, level 2 and level 3 entries write a number', async () => {
    await reset({ reset_level: 'alerts' });
    h.rtdbData['users/students/student_user4'] = { a: 1 };
    await reset({ reset_level: 'single_student', reset_scope: 'full_student', student_id: 4 });
    await reset({ reset_level: 'system' });
    const entries = auditSets();
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const e of entries) {
      expect(typeof e.values.created_at).toBe('number');
      expect(e.values.created_at as number).toBeGreaterThan(1_700_000_000_000);
    }
  });

  it('export entries too', () => {
    const entry = exportAuditEntry({ resetId: 'export_1', teacherUid: 't', classId: 'class_1', affectedStudentIds: [1], fileUrl: null, note: 'n', sessionNumber: null, now: 1_759_400_000_000 });
    expect(entry.created_at).toBe(1_759_400_000_000);
  });
});

describe('8 — the alerts reset is always class-wide (l.1014)', () => {
  it('a student_id in the request does not narrow the entry', async () => {
    await reset({ reset_level: 'alerts', student_id: 5 });
    expect(auditSets()[0].values.affected_student_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('9 — a named reset runs once, and its outcome can be read back (l.1085)', () => {
  const RID = 'reset_1759400000000_abcdef12';

  it('isClientResetId', () => {
    expect(isClientResetId(RID)).toBe(true);
    expect(isClientResetId('reset_x')).toBe(false);
    expect(isClientResetId('export_1759400000000_abcdef12')).toBe(false);
    expect(isClientResetId('reset_../../x')).toBe(false);
    expect(isClientResetId(42)).toBe(false);
  });

  it('the entry is stored under the id the dashboard sent', async () => {
    h.rtdbData['users/students/student_user4'] = { a: 1 };
    const result = await reset({ reset_level: 'single_student', reset_scope: 'full_student', student_id: 4, reset_id: RID });
    expect(result.resetId).toBe(RID);
    expect(auditSets().every((s) => s.id === RID)).toBe(true);
    expect(h.docs[`reset_audit_log/${RID}`]).toMatchObject({ deletion_status: 'completed' });
  });

  it('a malformed id is refused before anything runs', async () => {
    await expect(reset({ reset_level: 'system', reset_id: 'reset_/../' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(h.saved).toEqual([]);
    expect(h.rtdbWrites).toEqual([]);
  });

  it('the same id again: no second backup, no deletion — the logged outcome', async () => {
    h.rtdbData['users/students/student_user4'] = { a: 1 };
    await reset({ reset_level: 'single_student', reset_scope: 'full_student', student_id: 4, reset_id: RID });
    const savedBefore = h.saved.length;
    const writesBefore = h.rtdbWrites.length;
    const setsBefore = h.sets.length;
    const again = await reset({ reset_level: 'single_student', reset_scope: 'full_student', student_id: 4, reset_id: RID });
    expect(again).toMatchObject({ status: 'SUCCESS', resetId: RID, replayed: true, deletedRecords: 1 });
    expect(h.saved.length).toBe(savedBefore);
    expect(h.rtdbWrites.length).toBe(writesBefore);
    expect(h.sets.length).toBe(setsBefore);
  });

  it('logged while the second request waited for the lock: still no second run', async () => {
    h.rtdbData['users/students/student_user4'] = { a: 1 };
    h.getSequence[`reset_audit_log/${RID}`] = [null, {
      reset_id: RID, reset_level: 'system', class_id: 'class_1', backup_status: 'success',
      deletion_status: 'completed', records_deleted_count: 7, backup_file_url: 'gs://b/x', backup_channel: 'storage',
    }];
    const result = await reset({ reset_level: 'system', reset_id: RID });
    expect(result).toMatchObject({ status: 'SUCCESS', replayed: true, deletedRecords: 7 });
    expect(h.saved).toEqual([]);
    expect(h.rtdbWrites).toEqual([]);
  });

  it('a logged failure is given again, not retried', async () => {
    h.docs[`reset_audit_log/${RID}`] = { reset_id: RID, reset_level: 'system', class_id: 'class_1', backup_status: 'failed', deletion_status: 'not_required' };
    await expect(reset({ reset_level: 'system', reset_id: RID })).rejects.toMatchObject({ code: 'internal', message: 'הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.' });
    expect(h.saved).toEqual([]);
    expect(h.rtdbWrites).toEqual([]);
  });

  it('replayOutcomeOfEntry: every status', () => {
    const base = { reset_id: RID, class_id: 'class_1', reset_level: 'single_student', backup_status: 'success' };
    expect(replayOutcomeOfEntry({ ...base, deletion_status: 'completed', reset_scope: 'active_session', session_number: 3, reset_target: 'student', side_effect_errors: ['x'] }, 'class_1'))
      .toMatchObject({ kind: 'result', result: { status: 'SUCCESS', sessionNumber: 3, resetScope: 'active_session', resetTarget: 'student', sideEffectErrors: ['x'] } });
    expect(replayOutcomeOfEntry({ ...base, deletion_status: 'in_progress' }, 'class_1')).toMatchObject({ kind: 'error', code: 'unavailable' });
    expect(replayOutcomeOfEntry({ ...base, deletion_status: 'partial' }, 'class_1')).toMatchObject({ kind: 'error', code: 'internal', details: { stage: 'deletion_incomplete' } });
    expect(replayOutcomeOfEntry({ ...base, deletion_status: 'not_required' }, 'class_1')).toMatchObject({ kind: 'error', code: 'failed-precondition' });
    expect(replayOutcomeOfEntry({ ...base, backup_status: 'failed' }, 'class_1')).toMatchObject({ kind: 'error', code: 'internal' });
    expect(replayOutcomeOfEntry({ ...base, reset_level: 'alerts' }, 'class_1')).toMatchObject({ kind: 'result', result: { status: 'SUCCESS' } });
    expect(replayOutcomeOfEntry({ ...base, deletion_status: 'completed' }, 'class_2')).toMatchObject({ kind: 'error', code: 'permission-denied' });
    expect(replayOutcomeOfEntry({ ...base, reset_level: 'export' }, 'class_1')).toMatchObject({ kind: 'error', code: 'invalid-argument' });
  });
});
