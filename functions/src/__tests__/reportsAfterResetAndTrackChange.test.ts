import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Owner, 2.10.2026: "אני כן רוצה אבל שיהיה תיעוד איפה היו טעויות בלי הורדת
 * ציונים". After a reset, the personal report and the class report count the
 * run since the meeting's last reset — score, working group, exercise table —
 * and document the earlier mistakes in a separate "לפני האיפוס" section that
 * never changes them (audit M-reports-reset).
 *
 * Audit reports-14: a meeting is scored on the path the learner worked on in
 * it, not on the learner's current path — a learner moved to the other track
 * after meeting 3 got 0% on every report of meeting 3 produced afterwards.
 */

type Doc = { id: string; data: Record<string, any>; writtenAt?: number };
const h = vi.hoisted(() => ({
  collections: {} as Record<string, Array<{ id: string; data: Record<string, any>; writtenAt?: number }>>,
  rtdb: {} as Record<string, unknown>,
  sets: [] as Array<{ name: string; id: string; values: Record<string, any> }>,
  files: [] as Array<{ path: string; text: string }>,
  failResetLog: false,
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() { throw new Error('no Drive credentials in tests'); }
  },
}));

// No Chromium and no Gemini in tests: the PDF is a stub, the AI layer is unavailable (its PRD fallback applies).
vi.mock('../htmlPdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../htmlPdf')>()),
  CHROMIUM_PDF_RUNTIME: {},
  renderHtmlToPdf: async () => Buffer.from('%PDF'),
  renderWithFallback: async () => Buffer.from('%PDF'),
}));
vi.mock('../aiMonitoring', () => ({ recordAiCall: () => {} }));
vi.mock('../geminiConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../geminiConfig')>();
  return { ...actual, generateGeminiText: async () => { throw new Error('no Gemini in tests'); } };
});

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const snapOf = (d: Doc) => ({
    id: d.id,
    data: () => d.data,
    createTime: d.writtenAt === undefined ? undefined : { toMillis: () => d.writtenAt },
  });
  const query = (name: string, filters: Array<(d: Doc) => boolean> = [], paged = false): any => ({
    where: (field: string, op: string, value: unknown) => query(name, [...filters, (d: Doc) =>
      op === 'array-contains' ? Array.isArray(d.data[field]) && d.data[field].includes(value) : d.data[field] === value], paged),
    orderBy: () => query(name, filters, true),
    limit: () => query(name, filters, paged),
    startAfter: () => ({ get: async () => ({ docs: [], empty: true, size: 0 }) }),
    get: async () => {
      if (name === 'reset_audit_log' && h.failResetLog) throw new Error('reset log unavailable');
      const docs = (h.collections[name] ?? []).filter((d) => filters.every((f) => f(d))).map(snapOf);
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  const firestore = Object.assign(
    () => ({
      collection: (name: string) => ({
        ...query(name),
        doc: (id: string) => {
          const ref: any = {
            get: async () => {
              const d = (h.collections[name] ?? []).find((x) => x.id === id);
              return { exists: Boolean(d), data: () => d?.data, ref };
            },
            set: async (values: Record<string, any>) => { h.sets.push({ name, id, values }); },
          };
          return ref;
        },
      }),
    }),
    actual.firestore
  );
  const database = () => ({
    ref: (path: string) => ({
      get: async () => {
        const v = h.rtdb[path];
        return { val: () => (v === undefined ? null : v), exists: () => v !== undefined && v !== null };
      },
      update: async () => {},
    }),
  });
  const storage = () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: (path: string) => ({ save: async (buf: Buffer) => { h.files.push({ path, text: Buffer.from(buf).toString('utf8') }); }, getSignedUrl: async () => ['https://signed.example/file'] }),
    }),
  });
  const app = () => { throw new Error('no default app in tests'); };
  return { ...actual, default: { ...actual, database, firestore, storage, app }, database, firestore, storage, app };
});

import { generatePedagogicalReportPDF } from '../pedagogicalReport';
import { generateClassMeetingReport } from '../classReport';
import { pathOfMeeting, splitMeetingRuns, resetsOfMeeting } from '../meetingMetrics';
import { buildPreResetRecord, nothingToAnalyseAfterResetHe, PRE_RESET_NOTE_HE, RESET_LOG_UNAVAILABLE_HE } from '../preResetRecord';
import { exportResearchDataset } from '../exportDriveReport';
import { buildAdminMetrics, currentRunEvents, groupTelemetryByMeeting } from '../adminAggregator';
import { pedagogicalReportHtml, classReportHtml } from '../reportHtml';

const GREEN = ['s3_g_t1', 's3_g_t2', 's3_g_t3', 's3_g_t4', 's3_g_t5', 's3_g_t6', 's3_g_t7'];
const REMEDIATION = ['s3_r_t1', 's3_r_t2', 's3_r_t3', 's3_r_t4', 's3_r_t5', 's3_r_t6', 's3_r_t7'];
const T_RESET = 1_790_935_980_000; // 2.10.2026 13:13 in Israel

let seq = 0;
function event(student: number, exercise: string, type: string, at: number, extra: Record<string, any> = {}): Doc {
  seq++;
  return {
    id: `ev_${seq}`,
    writtenAt: at,
    data: {
      student_id: student,
      session_id: `session_3_student_student_user${student}`,
      exercise_id: exercise,
      event_type: type,
      client_timestamp: at,
      details: {},
      ...extra,
    },
  };
}
const perfectRun = (student: number, ids: string[], from: number) =>
  ids.map((id, i) => event(student, id, 'PROBLEM_COMPLETE', from + i * 1000, { details: { error_count: 0 } }));

/** Learner 4: mistakes in meeting 3, a reset of meeting 3, then a perfect run. */
const learner4FirstRun = [
  event(4, 's3_g_t1', 'DIGIT_ENTERED', T_RESET - 60_000, { column_index: 1, details: { digit_value: 7, is_correct: false } }),
  event(4, 's3_g_t1', 'DIGIT_ENTERED', T_RESET - 59_000, { column_index: 1, details: { digit_value: 8, is_correct: false } }),
  event(4, 's3_g_t1', 'PROBLEM_COMPLETE', T_RESET - 58_000),
  event(4, 's3_g_t2', 'UNDO_EXECUTED', T_RESET - 50_000),
  event(4, 's3_g_t2', 'DIGIT_ENTERED', T_RESET - 49_000, { column_index: 0, details: { digit_value: 3, is_correct: false } }),
];
const resetOfMeeting3 = (student: number, at = T_RESET) => ({
  id: `reset_${student}_${at}`,
  data: {
    reset_level: 'single_student', reset_scope: 'active_session', reset_target: 'student', session_number: 3, class_id: 'class_1',
    affected_student_ids: [student], backup_status: 'success', performed_at: at, reset_reason: 'technical_fault',
  },
});

beforeEach(() => {
  seq = 0;
  h.sets.length = 0;
  h.files.length = 0;
  h.failResetLog = false;
  h.collections = {
    curriculum_catalog: [
      { id: 'session_3_green_path', data: { tasks: GREEN.map((id, i) => ({ id, titleHe: `ירוק ${i + 1}` })) } },
      { id: 'session_3_remediation_path', data: { tasks: REMEDIATION.map((id, i) => ({ id, titleHe: `צמצום ${i + 1}` })) } },
    ],
    telemetry_logs: [
      ...learner4FirstRun,
      ...perfectRun(4, GREEN, T_RESET + 60_000),
      // Learner 5: meeting 3 on the green path, perfect, then moved to remediation (no reset).
      ...perfectRun(5, GREEN, T_RESET - 100_000),
      // Learner 6: a wrong digit, a reset, and has not worked on the meeting again —
      // the screen reopened (SESSION_START, PROBLEM_LOAD), nothing answered (review of PR #209).
      event(6, 's3_g_t1', 'DIGIT_ENTERED', T_RESET - 30_000, { column_index: 2, details: { digit_value: 1, is_correct: false } }),
      event(6, 'ex_3_01', 'SESSION_START', T_RESET + 5_000, { details: { session_number: 3 } }),
      event(6, 's3_g_t1', 'PROBLEM_LOAD', T_RESET + 6_000, { details: { path_type: 'compulsory' } }),
    ],
    reset_audit_log: [resetOfMeeting3(4), resetOfMeeting3(6)],
    sessions: [],
    srl_reflections: [],
  };
  // All three are on the remediation path NOW; meeting 3 was done on the green path.
  h.rtdb = {
    'users/students/student_user4': { teacher_selected_path: 'remediation_path' },
    'users/students/student_user5': { teacher_selected_path: 'remediation_path' },
    'users/students/student_user6': { teacher_selected_path: 'remediation_path' },
    'users/students': {
      student_user4: { teacher_selected_path: 'remediation_path' },
      student_user5: { teacher_selected_path: 'remediation_path' },
      student_user6: { teacher_selected_path: 'remediation_path' },
    },
  };
});

const teacher = (data: Record<string, unknown>) => ({
  auth: { uid: 'teacher-uid', token: { role: 'teacher', roles: ['TEACHER'], teacher: true, class_id: 'class_1' } },
  data: { classId: 'class_1', ...data },
});
const personal = (student: number) =>
  (generatePedagogicalReportPDF as any).run(teacher({ sessionId: `session_3_student_student_user${student}`, sessionNumber: 3, studentId: student }));

describe('the personal report after a reset', () => {
  it('scores the new run only: 100% and the independent group, not 86%', async () => {
    const { report } = await personal(4);
    expect(report.score_percent).toBe(100);
    expect(report.recommendation_tier).toBe('above_75');
    expect(report.telemetry_event_count).toBe(7);
    expect(report.exercise_narratives).toHaveLength(7);
    expect(report.exercise_narratives.join(' ')).not.toContain('ספרה שגויה');
  });

  it('documents the earlier mistakes apart, with the reset and its reason', async () => {
    const { report } = await personal(4);
    expect(report.pre_reset.lines_he).toEqual([
      'המפגש אופס ב-2.10.2026 בשעה 13:13. הסיבה: תקלה טכנית במכשיר או בתקשורת.',
      'ירוק 1: ספרה שגויה בטור העשרות (פעמיים). התרגיל הושלם לפני האיפוס.',
      'ירוק 2: ספרה שגויה בטור היחידות (פעם אחת), ביטול פעולה (פעם אחת). התרגיל לא הושלם לפני האיפוס.',
    ]);
    const html = pedagogicalReportHtml(report);
    expect(html).toContain('לפני האיפוס');
    expect(html).toContain(PRE_RESET_NOTE_HE);
    // Stored with the report, for the learner journey.
    const stored = h.sets.find((s) => s.name === 'reports')!.values;
    expect(stored.pre_reset.lines_he).toHaveLength(3);
    expect(stored.score_percent).toBe(100);
  });

  it('a meeting reset and not yet done again has no report, and says why — also when the screen reopened', async () => {
    // Learner 6 has SESSION_START and PROBLEM_LOAD after the reset and nothing answered: not 0% and remediation.
    await expect(personal(6)).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('אופס') });
  });

  it('when the reset log cannot be read there is no report, said plainly (it would count the whole history)', async () => {
    h.failResetLog = true;
    try {
      await expect(personal(4)).rejects.toMatchObject({ code: 'unavailable', message: RESET_LOG_UNAVAILABLE_HE });
      await expect((generateClassMeetingReport as any).run(teacher({ sessionNumber: 3 }))).rejects.toMatchObject({ code: 'unavailable', message: RESET_LOG_UNAVAILABLE_HE });
    } finally {
      h.failResetLog = false;
    }
  });

  it('a meeting that was never reset has no "לפני האיפוס" section', async () => {
    const { report } = await personal(5);
    expect(report.pre_reset).toBeNull();
    expect(pedagogicalReportHtml(report)).not.toContain('לפני האיפוס');
  });
});

describe('a track change does not rescore an earlier meeting', () => {
  it('meeting 3 done on the green path, learner now on remediation: still 100%', async () => {
    const { report } = await personal(5);
    expect(report.meeting_path).toBe('green_path');
    expect(report.score_percent).toBe(100);
  });

  it('pathOfMeeting: the bank ids first, the id spelling after them, null on a tie', () => {
    const evs = GREEN.slice(0, 3).map((id, i) => event(5, id, 'PROBLEM_COMPLETE', i).data);
    expect(pathOfMeeting(evs, { green_path: new Set(GREEN), remediation_path: new Set(REMEDIATION) })).toBe('green_path');
    expect(pathOfMeeting(evs)).toBe('green_path');
    expect(pathOfMeeting([event(5, 's3_r_t1', 'PROBLEM_COMPLETE', 1).data])).toBe('remediation_path');
    expect(pathOfMeeting([event(5, 'ex_3_01', 'SESSION_START', 1).data])).toBeNull();
    expect(pathOfMeeting([...evs.slice(0, 1), event(5, 's3_r_t1', 'PROBLEM_COMPLETE', 1).data])).toBeNull();
  });
});

describe('the class report after a reset and a track change', () => {
  it('each learner by the new run, on the path of this meeting, with a short note', async () => {
    const { report } = await (generateClassMeetingReport as any).run(teacher({ sessionNumber: 3 }));
    const row = (n: number) => report.learners.find((r: any) => r.student_id === n);
    expect(row(4).score_percent).toBe(100);
    expect(row(4).wrong_digits).toBe(0);
    expect(row(4).learning_path).toBe('green_path');
    expect(row(5).score_percent).toBe(100);
    expect(row(4).pre_reset.class_note_he).toBe(
      'המפגש אופס ב-2.10.2026 בשעה 13:13 (תקלה טכנית במכשיר או בתקשורת). לפני האיפוס: 3 ספרות שגויות (1 בטור היחידות, 2 בטור העשרות), ביטול אחד, ב-2 תרגילים.'
    );
    expect(row(5).pre_reset).toBeNull();
    // Learner 6 was reset and has not worked again: no row, no 0%, listed apart.
    expect(row(6)).toBeUndefined();
    expect(report.aggregates.learners_awaiting_rerun).toEqual([6]);
    expect(report.aggregates.learners_without_data).not.toContain(6);
    expect(report.aggregates.tiers.above_75).toEqual([4, 5]);
    const html = classReportHtml(report);
    expect(html).toContain('4ג. לפני האיפוס');
    expect(html).toContain('תלמיד 4: המפגש אופס ב-2.10.2026');
    expect(html).toContain('תלמיד 6: עוד לא עבד על המפגש מחדש, ולכן אין לו ציון במפגש הזה.');
  });
});

describe('the split itself', () => {
  it('cuts at the last reset by server write time; an event without one counts as new', () => {
    const resets = resetsOfMeeting([resetOfMeeting3(4).data, resetOfMeeting3(4, T_RESET - 10_000).data], 4, 3);
    expect(resets.map((r) => r.at)).toEqual([T_RESET - 10_000, T_RESET]);
    const runs = splitMeetingRuns([
      { data: { client_timestamp: 1 }, writtenAtMs: T_RESET - 1 },
      { data: { client_timestamp: 2 }, writtenAtMs: T_RESET + 1 },
      { data: { client_timestamp: 3 }, writtenAtMs: null },
    ], resets);
    expect(runs.beforeReset).toHaveLength(1);
    expect(runs.current).toHaveLength(2);
  });

  it('nothing before the reset: no record', () => {
    expect(buildPreResetRecord(splitMeetingRuns([{ data: {}, writtenAtMs: T_RESET + 1 }], resetsOfMeeting([resetOfMeeting3(4).data], 4, 3)))).toBeNull();
  });
});

describe('the class report when nobody has redone a reset meeting', () => {
  it('says who was reset and that the others have no events, true for every learner', async () => {
    h.collections.telemetry_logs = h.collections.telemetry_logs.filter((d) => d.data.student_id === 6);
    await expect((generateClassMeetingReport as any).run(teacher({ sessionNumber: 3 }))).rejects.toMatchObject({
      code: 'not-found',
      message: 'אין עדיין מה לנתח במפגש 3. המפגש אופס לתלמיד 6, והוא עוד לא עבד עליו מחדש. לשאר התלמידים אין פעולות מתועדות במפגש הזה.',
    });
    expect(nothingToAnalyseAfterResetHe(4, [9, 2, 5])).toBe(
      'אין עדיין מה לנתח במפגש 4. המפגש אופס לתלמידים 2, 5 ו-9, והם עוד לא עבדו עליו מחדש. לשאר התלמידים אין פעולות מתועדות במפגש הזה.'
    );
  });
});

describe('the research export adds the after-reset numbers and keeps the rest', () => {
  it('all-events columns unchanged; score_after_reset_percent as the reports; awaiting marked', async () => {
    const res = await (exportResearchDataset as any).run({
      auth: { uid: 'teacher-uid', token: { role: 'teacher', roles: ['TEACHER'], teacher: true, class_id: 'class_1' } },
      data: { class_id: 'class_1', session_number: 'all' },
    });
    expect(res.status).toBe('SUCCESS');
    const file = h.files.find((f) => /\/\d+_מפגשים_/.test(f.path))!;
    const [head, ...lines] = file.text.replace(/^﻿/, '').split('\n');
    const split = (l: string) => l.split('","').map((c) => c.replace(/^"|"$/g, ''));
    const cols = split(head);
    const rowOf = (n: number) => {
      const cells = lines.map(split).find((c) => c[0] === String(n) && c[1] === '3')!;
      return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
    };
    // The existing columns keep every event (register gap יג): learner 4's wrong digits before the reset still cost t1 and t2.
    expect(rowOf(4).first_attempt_score_percent).toBe('71');
    expect(rowOf(4).was_reset).toBe('כן');
    // The appended column is what the reports and the gate count.
    expect(rowOf(4).score_after_reset_percent).toBe('100');
    expect(rowOf(4).reset_awaiting_rerun).toBe('');
    expect(rowOf(6).reset_awaiting_rerun).toBe('כן');
    expect(rowOf(6).score_after_reset_percent).toBe('');
    // Learner 5 was moved to remediation after meeting 3: the meeting's own path, and 100%.
    expect(rowOf(5).learning_path).toBe('green_path');
    expect(rowOf(5).first_attempt_score_percent).toBe('100');
    expect(rowOf(5).score_after_reset_percent).toBe('100');
    // Appended after every existing column.
    expect(cols.indexOf('score_after_reset_percent')).toBeGreaterThan(cols.indexOf('chat_help_requests'));
  });
});

describe('the admin metrics count a meeting as the reports do', () => {
  it("the run since the reset, on the meeting's own path; nothing answered is no score", () => {
    const docs = h.collections.telemetry_logs.map((d) => ({ data: d.data, writtenAtMs: d.writtenAt ?? null }));
    const byMeeting = groupTelemetryByMeeting(currentRunEvents(docs, h.collections.reset_audit_log.map((r) => r.data)));
    const metrics = buildAdminMetrics({
      byMeeting,
      sessionDocs: [],
      highestCompletedByLearner: new Map([[4, 3], [5, 3], [6, 3]]),
      pathByLearner: new Map([[4, 'remediation_path'], [5, 'remediation_path'], [6, 'remediation_path']]),
      pathByLearnerMeeting: new Map([['4:3', 'green_path'], ['5:3', 'green_path']]),
      compulsory: new Map([['3:green_path', { total: 7, ids: new Set(GREEN) }], ['3:remediation_path', { total: 7, ids: new Set(REMEDIATION) }]]),
    });
    // 4 and 5 at 100%; 6 (reset, nothing answered since) has no score rather than 0%.
    expect(metrics.session_breakdown['3'].average_score_percent).toBe(100);
    expect(metrics.session_breakdown['3'].wrong_digits).toBe(0);
  });
});
