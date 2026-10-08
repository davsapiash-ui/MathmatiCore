import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Teacher-dashboard truth audit, 4.10.2026 — the server side of the reports,
 * the research export and the resets. Each block names the defect it pins.
 */
const h = vi.hoisted(() => ({
  uploads: [] as string[],
  saved: [] as string[],
  uploadStatus: 200,
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: 'test-access-token' }) };
    }
  },
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const storage = () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: (path: string) => ({
        save: async () => { h.saved.push(path); },
        getSignedUrl: async () => ['https://signed.example/file'],
      }),
    }),
  });
  return { ...actual, default: actual, app: () => ({ options: {} }), storage };
});

import {
  buildActiveSessionResetValues,
  buildResetScope,
  canonicalLearnerRecordsOf,
  executeResetDeletion,
  FULL_RESET_RESTART_COMMAND,
  learnerPathsFromRecords,
  uploadBufferToDrive,
} from '../exportDriveReport';
import { generateExerciseNarrativeFromEvents } from '../pedagogicalReport';
import { aggregateClass, buildLearnerRow } from '../classReport';
import { classReportHtml, pedagogicalReportHtml } from '../reportHtml';
import { SANDBOX_MEETING_PURPOSE_HE } from '../meetingMetrics';
import { israelDateTime } from '../driveNames';

const source = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8');

describe('Drive file names carry the Israeli clock, not UTC', () => {
  // PRD Module 23, "תיקיות הדרייב": DD.MM.YYYY and HH-mm, Israel time.
  it('summer time: 10:07 UTC is 13:07 in Israel', () => {
    expect(israelDateTime(Date.UTC(2026, 9, 4, 10, 7))).toBe('04.10.2026 13-07');
  });

  it('winter time, across midnight: the date moves too', () => {
    expect(israelDateTime(Date.UTC(2026, 0, 15, 22, 30))).toBe('16.01.2026 00-30');
  });

  it('the personal report, the class report and the research export all use it', () => {
    expect(source('pedagogicalReport.ts')).toContain('learnerReportFileName(resolvedSessionNumber, clampedStudentNum)');
    expect(source('classReport.ts')).toContain('classReportFileName(sessionNumber, "pdf", generatedAt)');
    expect(source('exportDriveReport.ts')).toContain('researchExportFileName(f.name, scopedSession, exportedAt)');
    for (const f of ['pedagogicalReport.ts', 'classReport.ts']) {
      expect(source(f)).not.toContain('toISOString().slice(0, 16)');
    }
  });
});

describe('the exercise narrative names only the columns of the wrong digits', () => {
  const ev = (type: string, details: Record<string, unknown>, t: number, column_index?: number) => ({
    session_id: 'session_4_student_student_user3',
    student_id: 3,
    exercise_id: 's4_g_t1',
    event_type: type,
    details,
    client_timestamp: 1_000_000 + t,
    ...(column_index !== undefined ? { column_index } : {}),
  });

  it('one wrong digit in a run over four columns is a mistake in one column', () => {
    const { compulsory } = generateExerciseNarrativeFromEvents([
      ev('DIGIT_ENTERED', { is_correct: true }, 1, 0),
      ev('DIGIT_ENTERED', { is_correct: false }, 2, 1),
      ev('DIGIT_ENTERED', { is_correct: true }, 3, 2),
      ev('DIGIT_ENTERED', { is_correct: true }, 4, 3),
      ev('PROBLEM_COMPLETE', {}, 5),
    ]);
    expect(compulsory[0]).toContain('הזין ספרה שגויה בטור העשרות (פעם אחת)');
    expect(compulsory[0]).not.toContain('ובטור');
  });

  it('a run with no wrong digit still names every column it covered', () => {
    const { compulsory } = generateExerciseNarrativeFromEvents([
      ev('DIGIT_ENTERED', { is_correct: true }, 1, 0),
      ev('DIGIT_ENTERED', { is_correct: true }, 2, 1),
      ev('PROBLEM_COMPLETE', {}, 3),
    ]);
    expect(compulsory[0]).toContain('הזין את הספרות בטור היחידות ובטור העשרות');
  });
});

describe('the printed personal report: section numbers and no specification jargon', () => {
  const measures = { persistence: null, flexibility: null, mediation: null };

  it('meeting 1: "לקראת האבחון" is 4 and the research measures are 5', () => {
    const html = pedagogicalReportHtml({
      meeting_kind: 'sandbox_refresh', session_number: 1, anonymous_student_label: 'תלמיד 5',
      exercise_narratives: [], knowledge_gaps: [], teaching_recommendations: [], research_measures: measures,
    });
    expect(html).toContain('4. לקראת האבחון');
    expect(html).toContain('5. מדדי המחקר');
    expect(html).not.toContain('4. מדדי המחקר');
  });

  it('meetings 2–8: the research measures stay 4', () => {
    const html = pedagogicalReportHtml({
      session_number: 4, anonymous_student_label: 'תלמיד 5', score_percent: 71,
      exercise_narratives: [], knowledge_gaps: [], teaching_recommendations: [], research_measures: measures,
    });
    expect(html).toContain('4. מדדי המחקר');
  });

  it('the meeting-1 purpose sentence does not cite the specification', () => {
    expect(SANDBOX_MEETING_PURPOSE_HE).not.toMatch(/PRD|מודול/);
    expect(SANDBOX_MEETING_PURPOSE_HE).toContain('המפגש אינו מקבל ציון ואינו מסווג לקבוצת עבודה. ');
  });
});

describe('the printed class report carries what only the backup renderer had', () => {
  const ev = (session: number, exercise: string, type: string, details: Record<string, unknown> = {}, t = 0) => ({
    session_id: `session_${session}_student_user4`,
    student_id: 4,
    exercise_id: exercise,
    event_type: type,
    details,
    client_timestamp: 1_000_000 + t,
  });
  const earlier = [ev(4, 's4_r_t1', 'PROBLEM_COMPLETE', { total_duration_ms: 60_000 }, 1)];
  const meeting8 = [ev(8, 's8_r_t1', 'PROBLEM_COMPLETE', { total_duration_ms: 20_000 }, 1)];
  const row8 = buildLearnerRow(4, meeting8, 7, 'remediation_path', null, null, 0, earlier, { sessionNumber: 8, allEvents: [...earlier, ...meeting8] });
  const a8 = aggregateClass([row8], new Map(), 8);

  it('meeting 8: the fading gap (register deviation 19), per learner', () => {
    expect(row8.fading_gap?.pairs_measured).toBe(1);
    const html = classReportHtml({ session_number: 8, title_he: 'דוח כיתה', aggregates: a8, learners: [row8] });
    expect(html).toContain('4א. פער הדעיכה: מפגש 8 בלי לבני הדינס מול מפגשים 4–6 עם לבני הדינס');
    expect(html).toContain('<th>זוגות שנמדדו</th>');
    expect(html).toContain('<td>60 שניות</td>');
    expect(html).toContain('<td>20 שניות</td>');
  });

  it('any other meeting: no fading-gap section', () => {
    const row4 = buildLearnerRow(4, earlier, 7, 'remediation_path', null, null, 0, null, { sessionNumber: 4, allEvents: earlier });
    const html = classReportHtml({ session_number: 4, title_he: 'דוח כיתה', aggregates: aggregateClass([row4], new Map(), 4), learners: [row4] });
    expect(html).not.toContain('פער הדעיכה');
  });

  it('help from the chat and withdrawn help calls are on the class line', () => {
    const a = { ...a8, help_requests_total: 5, help_withdrawals_total: 2, chat_help_requests_total: 3 };
    const html = classReportHtml({ session_number: 8, title_he: 'דוח כיתה', aggregates: a, learners: [row8] });
    expect(html).toContain('קריאות שקטות למורה: 5 (הלומדים ביטלו 2 מהן) | בקשות עזרה מהצ׳אט: 3 | פיגום בשורת התוצאה:');
  });

  it('no withdrawn call: the bracket is left out', () => {
    const a = { ...a8, help_requests_total: 5, help_withdrawals_total: 0, chat_help_requests_total: 0 };
    const html = classReportHtml({ session_number: 8, title_he: 'דוח כיתה', aggregates: a, learners: [row8] });
    expect(html).toContain('קריאות שקטות למורה: 5 | בקשות עזרה מהצ׳אט: 0 |');
  });
});

describe('a file the shared Drive folder refuses waits in the backup storage', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    h.uploads = [];
    h.saved = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      if (String(url).startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        h.uploads.push(Buffer.from(init.body as Buffer).toString('utf8'));
        return new Response('refused', { status: h.uploadStatus });
      }
      // The folder search finds the flat folder "1 דוחות".
      return new Response(JSON.stringify({ files: [{ id: 'shared-folder' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it.each([403, 404, 400])('Drive answers %i: one upload only, never without a parent folder', { timeout: 30_000 }, async (status) => {
    h.uploadStatus = status;
    const res = await uploadBufferToDrive(Buffer.from('report'), 'דוח.pdf', 'application/pdf', '1 דוחות');
    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0]).toContain('"parents":["shared-folder"]');
    expect(res.success).toBe(false);
    expect(res.fallbackStoragePath).toMatch(/^drive_fallback\//);
    expect(h.saved).toEqual([res.fallbackStoragePath]);
  });

  it('a reset backup is never parked in drive_fallback/: its fallback is backups/{class_id}/ (PRD 23א §ג)', async () => {
    h.uploadStatus = 403;
    const res = await uploadBufferToDrive(Buffer.from('{}'), 'גיבוי.json', 'application/json', '3 גיבויים', { park: false });
    expect(res.success).toBe(false);
    expect(res.fallbackStoragePath).toBeUndefined();
    expect(h.saved).toEqual([]);
    expect(source('exportDriveReport.ts')).toContain('uploadBufferToDrive(buffer, fileName, "application/json", DRIVE_FOLDERS.backups, { park: false, signal })');
  });
});

describe('a meeting reset clears the meeting\'s error-category counts', () => {
  it.each([1, 3, 8])('meeting %i: only its own errorCategoryDistribution key', (m) => {
    const values = buildActiveSessionResetValues(m, { highestCompletedMeeting: 8 });
    expect(values[`errorCategoryDistribution/session_${m}`]).toBeNull();
    expect(Object.keys(values).filter((k) => k.startsWith('errorCategoryDistribution'))).toEqual([`errorCategoryDistribution/session_${m}`]);
  });
});

describe('the research export reads a learner\'s path from the canonical record', () => {
  it('a leftover alias that comes first does not decide', () => {
    const paths = learnerPathsFromRecords({
      '4': { forceReload: true },
      student_4: { forceReload: true },
      student_user4: { teacher_selected_path: 'remediation_path' },
      user4: { forceReload: true },
    });
    expect(paths.get(4)).toBe('remediation_path');
  });

  it('a stale remediation alias does not override a canonical green record either', () => {
    const paths = learnerPathsFromRecords({ student_user6: { pedagogicalPath: 'green_path' }, user6: { pedagogicalPath: 'remediation_path' } });
    expect(paths.get(6)).toBe('green_path');
  });

  it('no canonical record: the alias is used; keys that are not learners 1–12 are skipped', () => {
    const paths = learnerPathsFromRecords({ student_9: { pedagogicalPath: 'remediation_path' }, student_user13: {}, teacher: {} });
    expect(paths.get(9)).toBe('remediation_path');
    expect(Array.from(paths.keys())).toEqual([9]);
  });
});

describe('a full reset: the server itself tells the learner\'s screen to start over', () => {
  /** An in-memory Realtime Database: get / set / update / remove by path. */
  function fakeRtdb(initial: Record<string, any>, failOn: string | null = null) {
    const tree: Record<string, any> = JSON.parse(JSON.stringify(initial));
    const parts = (p: string) => p.split('/').filter(Boolean);
    const read = (p: string) => parts(p).reduce<any>((n, k) => (n && typeof n === 'object' ? n[k] : undefined), tree) ?? null;
    const write = (p: string, value: unknown) => {
      const keys = parts(p);
      let n = tree;
      for (const k of keys.slice(0, -1)) n = n[k] = n[k] && typeof n[k] === 'object' ? n[k] : {};
      if (value === null) delete n[keys[keys.length - 1]];
      else n[keys[keys.length - 1]] = value;
    };
    const rtdb: any = {
      ref: (path: string) => ({
        get: async () => {
          const v = read(path);
          const children = v && typeof v === 'object' ? Object.keys(v).length : 0;
          return { val: () => v, exists: () => v !== null, hasChildren: () => children > 0, numChildren: () => children };
        },
        set: async (value: unknown) => write(path, value),
        update: async (values: Record<string, unknown>) => write(path, { ...(read(path) ?? {}), ...values }),
        remove: async () => {
          if (path === failOn) throw new Error('remove refused');
          write(path, null);
        },
      }),
    };
    return { rtdb, read };
  }
  const emptyDb: any = {
    collection: () => {
      const q: any = { where: () => q, orderBy: () => q, limit: () => q, get: async () => ({ empty: true, size: 0, docs: [] }) };
      return q;
    },
    batch: () => ({ delete: () => undefined, commit: async () => undefined }),
  };
  const learner = { workspaceState: { blocks: [1] }, highestCompletedMeeting: 3, lastAction: 'פעיל במפגש 4' };

  it('names the canonical records a removed path held, and only those', () => {
    expect(canonicalLearnerRecordsOf('users/students/student_user4', learner)).toEqual(['users/students/student_user4']);
    expect(canonicalLearnerRecordsOf('users/students/student_4', learner)).toEqual([]);
    expect(canonicalLearnerRecordsOf('users/students/student_user4', null)).toEqual([]);
    expect(canonicalLearnerRecordsOf('users/students', { student_user2: learner, user2: learner, student_user13: learner }))
      .toEqual(['users/students/student_user2']);
    expect(canonicalLearnerRecordsOf('chat_messages', { student_user2: {} })).toEqual([]);
  });

  it('full learner reset: the record is left with the restart command, and no alias record is created', async () => {
    const { rtdb, read } = fakeRtdb({ users: { students: { student_user4: learner, student_user5: learner } } });
    const counts = await executeResetDeletion(rtdb, emptyDb, buildResetScope('single_student', '4', 'full_student', null, 'student'));
    expect(counts.failures).toEqual([]);
    expect(read('users/students/student_user4')).toEqual({ ...FULL_RESET_RESTART_COMMAND });
    expect(Object.keys(read('users/students')).sort()).toEqual(['student_user4', 'student_user5']);
    expect(read('users/students/student_user5')).toEqual(learner);
  });

  it('full learner reset: the teacher\'s settings for the learner stay next to the command', async () => {
    const { rtdb, read } = fakeRtdb({ users: { students: { student_user4: { ...learner, isASD: true } } } });
    await executeResetDeletion(rtdb, emptyDb, buildResetScope('single_student', '4', 'full_student', null, 'student'));
    expect(read('users/students/student_user4')).toEqual({ isASD: true, ...FULL_RESET_RESTART_COMMAND });
  });

  it('level 3: every learner who had a record gets the command; a learner who never signed in gets no record', async () => {
    const { rtdb, read } = fakeRtdb({ users: { students: { student_user1: learner, student_user2: learner, user2: learner } }, chat_messages: { student_user1: { m: 1 } } });
    await executeResetDeletion(rtdb, emptyDb, buildResetScope('system', 'all'));
    expect(read('users/students')).toEqual({ student_user1: { ...FULL_RESET_RESTART_COMMAND }, student_user2: { ...FULL_RESET_RESTART_COMMAND } });
    expect(read('chat_messages')).toBeNull();
  });

  it('a deletion that fails elsewhere still restarts the learner (the teacher\'s browser no longer has to)', async () => {
    const { rtdb, read } = fakeRtdb(
      { users: { students: { student_user4: learner } }, chat_messages: { student_user4: { m: 1 } } },
      'chat_messages/student_user4'
    );
    const counts = await executeResetDeletion(rtdb, emptyDb, buildResetScope('single_student', '4', 'full_student', null, 'student'));
    expect(counts.failures).toEqual(['chat_messages/student_user4: remove refused']);
    expect(read('users/students/student_user4')).toEqual({ ...FULL_RESET_RESTART_COMMAND });
  });

  it('a meeting reset is untouched: it resets fields in place and removes no record', async () => {
    const { rtdb, read } = fakeRtdb({ users: { students: { student_user4: learner } } });
    await executeResetDeletion(rtdb, emptyDb, buildResetScope('single_student', '4', 'active_session', 4, 'student'));
    expect(read('users/students/student_user4').lastAction).toBe('המפגש 4 אופס ע״י המורה');
  });
});
