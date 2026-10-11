import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Audit round 12.10.2026, the research export (Module 24 §ב), the admin
 * report (Module 24 §ב) and one reset text (Module 23א §ב.2):
 *  M10 — a single-meeting export computed its cumulative columns and meeting
 *        8's baseline (meetings 4–6) from that meeting's events only;
 *  M12 — a learner id outside 1–12 was written raw into the actions file;
 *  L3  — a file with no row was the one word "empty", with no header row;
 *  L4  — the export's audit entry linked to the first file only;
 *  L7  — documents of another class reached the export;
 *  L14 — the admin report was an English page stamped with UTC ISO time;
 *  L29 — the class "full reset" refusal named level 3 by an old name.
 */

const h = vi.hoisted(() => ({
  rtdb: {} as Record<string, any>,
  fs: {} as Record<string, Record<string, Record<string, unknown>>>,
  fetchCalls: [] as Array<{ url: string; init: RequestInit }>,
  fadingCalls: [] as Array<{ now: unknown[]; before: unknown[] }>,
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: 'test-access-token' }) };
    }
  },
}));

vi.mock('../meetingMetrics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../meetingMetrics')>();
  return {
    ...actual,
    computeFadingGap: (now: Record<string, any>[], before: Record<string, any>[]) => {
      h.fadingCalls.push({ now, before });
      return actual.computeFadingGap(now, before);
    },
  };
});

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const parts = (p: string) => String(p || '').split('/').filter(Boolean);
  const getAt = (p: string): any => parts(p).reduce<any>((n, k) => (n && typeof n === 'object' ? n[k] : undefined), h.rtdb);
  const snap = (v: any) => ({
    val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))),
    exists: () => v !== undefined && v !== null,
    hasChildren: () => !!v && typeof v === 'object' && Object.keys(v).length > 0,
    numChildren: () => (v && typeof v === 'object' ? Object.keys(v).length : 0),
  });
  const database = () => ({ ref: (path?: string) => ({ get: async () => snap(getAt(path || '')) }) });
  const coll = (name: string) => (h.fs[name] ||= {});
  const docRef = (name: string, id: string) => ({
    id,
    get: async () => ({ exists: coll(name)[id] !== undefined, data: () => coll(name)[id] }),
    set: async (data: Record<string, unknown>) => { coll(name)[id] = { ...data }; },
  });
  const query = (name: string, filter?: (d: Record<string, unknown>) => boolean): any => ({
    where: (f: string, op: string, v: any) => query(name, (d) => (op === '==' ? d[f] === v : true) && (!filter || filter(d))),
    orderBy: () => query(name, filter),
    limit: () => query(name, filter),
    startAfter: () => ({ get: async () => ({ docs: [], size: 0, empty: true }) }),
    get: async () => {
      const docs = Object.entries(coll(name))
        .filter(([, d]) => !filter || filter(d))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([id, d]) => ({ id, data: () => JSON.parse(JSON.stringify(d)) }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  const firestore = Object.assign(() => ({
    collection: (name: string) => ({ ...query(name), doc: (id: string) => docRef(name, id) }),
  }), actual.firestore);
  const storage = () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: () => ({ save: async () => {}, getSignedUrl: async () => ['https://signed.example/x'] }),
    }),
  });
  const mocked = { ...actual, database, firestore, storage, app: () => ({ options: {} }) };
  return { ...mocked, default: mocked };
});

import {
  ADMIN_REPORT_TITLE_HE,
  RESEARCH_RECORDING_COLUMNS,
  RESEARCH_RESET_LOG_COLUMNS,
  RESET_CLASS_FULL_REFUSAL_HE,
  adminReportDateLineHe,
  adminReportHtml,
  adminReportLinesHe,
  backupAndResetSessionData,
  belongsToExportClass,
  createAdminReportPdf,
  driveFolderLink,
  exportFilesUrl,
  exportResearchDataset,
  researchCsv,
} from '../exportDriveReport';
import { MEDIATION_COLUMNS } from '../teacherMediationRows';

const teacher = (data: Record<string, unknown>) => ({
  auth: { uid: 'teacher_1', token: { teacher: true, role: 'teacher', class_id: 'class_1' } },
  data: { class_id: 'class_1', ...data },
}) as any;

/** The CSV files the export sent to Drive, by their label ("מפגשים", …). */
function uploaded(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of h.fetchCalls) {
    if (!c.url.includes('uploadType=multipart')) continue;
    const body = Buffer.from(c.init.body as Buffer).toString('utf8');
    const meta = JSON.parse(/\{"name".*?\}(?=\r\n--)/s.exec(body)![0]) as { name: string };
    const b64 = body.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
    const label = meta.name.replace(/\.csv$/, '').split(' - ').pop()!;
    out[label] = Buffer.from(b64, 'base64').toString('utf8').replace(/^﻿/, '');
  }
  return out;
}

const rowsOf = (csv: string): Array<Record<string, string>> => {
  const [header, ...lines] = csv.split('\n');
  const cells = (line: string) => line.slice(1, -1).split('","');
  const cols = cells(header);
  return lines.map((l) => Object.fromEntries(cells(l).map((v, i) => [cols[i], v])));
};

const ev = (session: number, type: string, ts: number, extra: Record<string, unknown> = {}) => ({
  student_id: 4,
  session_id: `session_0${session}_student_4`,
  exercise_id: `ex_${session}`,
  event_type: type,
  client_timestamp: ts,
  details: {},
  ...extra,
});

function seed() {
  h.fetchCalls = [];
  h.fadingCalls = [];
  h.rtdb = { users: { students: {} }, recordings: {}, reflections: {}, chat_messages: {} };
  h.fs = {
    telemetry_logs: {
      e1: ev(5, 'SOCRATIC_CARD_SHOWN', 1000),
      e2: ev(8, 'SOCRATIC_CARD_SHOWN', 2000),
      e3: ev(8, 'DIGIT_ENTERED', 2100, { student_id: 'guest_99', details: { is_correct: true } }),
    },
    sessions: {
      session_08_student_4: { class_id: 'class_1', session_number: 8, session_score_percent: 71 },
      session_08_student_4_other: { class_id: 'class_2', student_id: 4, session_number: 8, session_score_percent: 12 },
    },
    reset_audit_log: {
      r_other: { class_id: 'class_2', reset_level: 'alerts', reset_id: 'r_other', performed_at: 5 },
    },
    catchup_records: {
      session_08_student_4: { class_id: 'class_2', student_id: 4, session_number: 8, rounds: { r1: { action: 'continue', reason: 'technical_fault', recorded_at: 1 } } },
    },
  };
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  seed();
  let n = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    h.fetchCalls.push({ url: String(url), init });
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (String(url).includes('/drive/v3/files?q=')) return json({ files: [{ id: 'folder-1' }] });
    return json({ id: `file-${++n}` });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('M10 — a single-meeting export: rows of that meeting, cumulative values over every meeting', () => {
  it('meeting 8: one row, the cumulative columns count meeting 5 too, and the baseline reaches meetings 4–6', async () => {
    const res = await (exportResearchDataset as any).run(teacher({ session_number: 8 }));
    expect(res.status).toBe('SUCCESS');
    const meetings = rowsOf(uploaded()['מפגשים']);
    expect(meetings.map((r) => `${r.student_id}:${r.session_number}`)).toEqual(['4:8']);
    expect(meetings[0].mediation_cards).toBe('1');
    expect(meetings[0].mediation_cumulative_cards).toBe('2');
    const baseline = h.fadingCalls[h.fadingCalls.length - 1].before as Array<Record<string, unknown>>;
    expect(baseline.map((e) => e.session_id)).toEqual(['session_05_student_4']);
    // The actions file is still that meeting's events only.
    expect(rowsOf(uploaded()['פעולות']).map((r) => r.session_number)).toEqual(['8', '8']);
  });

  it('the whole process gives the same cumulative value', async () => {
    await (exportResearchDataset as any).run(teacher({}));
    const meetings = rowsOf(uploaded()['מפגשים']);
    expect(meetings.find((r) => r.session_number === '8')!.mediation_cumulative_cards).toBe('2');
  });
});

describe('M12 — no raw learner id in the actions file', () => {
  it('an event whose learner is not 1–12 keeps its row with an empty student_id', async () => {
    await (exportResearchDataset as any).run(teacher({ session_number: 8 }));
    const actions = rowsOf(uploaded()['פעולות']);
    expect(actions).toHaveLength(2);
    expect(actions.map((r) => r.student_id)).toEqual(['4', '']);
    expect(uploaded()['פעולות']).not.toContain('guest_99');
  });
});

describe('L3 — an empty file still has its header row', () => {
  it('meeting 3 has no data: every file is a header row, the same columns as a full export', async () => {
    await (exportResearchDataset as any).run(teacher({ session_number: 8 }));
    const fullMeetingsHeader = uploaded()['מפגשים'].split('\n')[0];
    const fullActionsHeader = uploaded()['פעולות'].split('\n')[0];
    h.fetchCalls = [];
    const res = await (exportResearchDataset as any).run(teacher({ session_number: 3 }));
    expect(res.rowCounts).toMatchObject({ 'פעולות': 0, 'מפגשים': 0, 'הקלטות': 0, 'רפלקציות': 0, 'תיווך המורה': 0 });
    const files = uploaded();
    const quoted = (cols: readonly string[]) => cols.map((c) => `"${c}"`).join(',');
    expect(files['מפגשים']).toBe(fullMeetingsHeader);
    expect(files['פעולות']).toBe(fullActionsHeader);
    expect(files['הקלטות']).toBe(quoted(RESEARCH_RECORDING_COLUMNS));
    expect(files['תיווך המורה']).toBe(quoted(MEDIATION_COLUMNS));
    expect(files['רפלקציות'].startsWith('"source","reflection_id","student_id"')).toBe(true);
    for (const csv of Object.values(files)) expect(csv).not.toBe('empty\n');
  });

  it('researchCsv: no rows and columns → the header; no rows and no columns → the old one-word file', () => {
    expect(researchCsv([], ['a', 'b'])).toBe('﻿"a","b"');
    expect(researchCsv([])).toBe('﻿empty\n');
    expect(researchCsv([{ a: 1 }], ['a', 'b'])).toBe('﻿"a","b"\n"1",""');
  });

  it('the empty reset log names the audit-entry fields and never the person who performed the reset', () => {
    expect(RESEARCH_RESET_LOG_COLUMNS[0]).toBe('log_id');
    expect(RESEARCH_RESET_LOG_COLUMNS.some((c) => /performed_by|email/i.test(c))).toBe(false);
  });
});

describe('L7 — only the requested class', () => {
  it('another class\'s session document, catch-up record and reset entry do not reach the export', async () => {
    await (exportResearchDataset as any).run(teacher({ session_number: 8 }));
    const files = uploaded();
    const row = rowsOf(files['מפגשים'])[0];
    expect(row.session_doc_score_percent).toBe('71');
    expect(row.catchup_rounds).toBe('0');
    expect(files['יומן איפוסים']).not.toContain('r_other');
  });

  it('belongsToExportClass: another class out; no class, this class or the legacy school id in', () => {
    expect(belongsToExportClass({ class_id: 'class_2' }, 'class_1')).toBe(false);
    expect(belongsToExportClass({ class_id: 'class_1' }, 'class_1')).toBe(true);
    expect(belongsToExportClass({ class_id: 'school_bikorot' }, 'class_1')).toBe(true);
    expect(belongsToExportClass({}, 'class_1')).toBe(true);
    expect(belongsToExportClass({ class_id: '' }, 'class_1')).toBe(true);
  });

  it('the reset log is never read whole as a fallback', () => {
    const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
    expect(src).not.toContain('.catch(async () => readAllDocs(db.collection("reset_audit_log")));');
    expect(src).toContain('.filter(({ data }) => data.class_id === class_id));');
  });
});

describe('L4 — the export\'s audit entry links to the files created', () => {
  it('the Drive folder, not the first file', async () => {
    await (exportResearchDataset as any).run(teacher({}));
    const [entry] = Object.values(h.fs.reset_audit_log).filter((e) => e.reset_level === 'export');
    expect(entry.backup_file_url).toBe('https://drive.google.com/drive/folders/folder-1');
  });

  it('exportFilesUrl: the folder, then every parked file; the file links only without a folder id; null when nothing', () => {
    expect(exportFilesUrl('F', [])).toBe(driveFolderLink('F'));
    expect(exportFilesUrl('F', ['gs://b/x.csv', 'gs://b/y.csv'])).toBe('https://drive.google.com/drive/folders/F | gs://b/x.csv | gs://b/y.csv');
    expect(exportFilesUrl(null, ['gs://b/x.csv'])).toBe('gs://b/x.csv');
    expect(exportFilesUrl(null, [], ['https://drive.google.com/file/d/1/view'])).toBe('https://drive.google.com/file/d/1/view');
    expect(exportFilesUrl(null, [])).toBeNull();
  });
});

describe('L14 — the admin report in Hebrew, dated by the Israeli clock', () => {
  // 21:30 UTC on 12.10.2026 is already 13.10.2026 00:30 in Israel (summer time, UTC+3).
  const at = Date.UTC(2026, 9, 12, 21, 30);
  const counts = { schoolsCount: 1, teachersCount: 2, studentsCount: 12, alertsCount: 3 };

  it('title, Israeli date line, the counts-only note and the four counts', () => {
    expect(adminReportDateLineHe(at)).toBe('תאריך ההפקה: 13.10.2026, 00:30 (שעון ישראל)');
    expect(adminReportLinesHe(counts, at)).toEqual([
      'דוח מנהל',
      'תאריך ההפקה: 13.10.2026, 00:30 (שעון ישראל)',
      'הדוח כולל ספירות בלבד. אין בו כתובות דוא״ל ואין בו פרטים מזהים.',
      '',
      'בתי ספר: 1',
      'מורים: 2',
      'לומדים: 12',
      'התראות רדאר פעילות: 3',
    ]);
  });

  it('the HTML page is right-to-left Hebrew, with no English title and no ISO time', () => {
    const html = adminReportHtml(counts, at);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(`<h1>${ADMIN_REPORT_TITLE_HE}</h1>`);
    expect(html).not.toContain('Executive');
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('the pdfkit fallback prints a PDF with a Hebrew font', async () => {
    const before = process.env.PDF_ENGINE;
    process.env.PDF_ENGINE = 'pdfkit';
    try {
      const pdf = await createAdminReportPdf(counts, at);
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdf.toString('latin1')).not.toContain('/BaseFont /Helvetica-Bold');
    } finally {
      if (before === undefined) delete process.env.PDF_ENGINE;
      else process.env.PDF_ENGINE = before;
    }
  });

  it('the callable prints with the Chromium runtime and no longer builds the English page', () => {
    const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
    expect(src).toContain('export const exportAdminReportToDrive = onCall(CHROMIUM_PDF_RUNTIME, async (request) => {');
    expect(src).toContain('await createAdminReportPdf({ schoolsCount, teachersCount, studentsCount, alertsCount }, now);');
    expect(src).not.toContain('Executive System & Governance Report');
  });
});

describe('L29 — the class "full reset" refusal names level 3 by its button', () => {
  it('the text, and the refusal before anything is read', async () => {
    expect(RESET_CLASS_FULL_REFUSAL_HE).toBe('איפוס המפגש לכיתה מאפס את המפגש הפעיל בלבד. כדי למחוק את כל נתוני הכיתה, בחרו "איפוס כל נתוני הכיתה" (רמה 3). לא נמחקו נתונים.');
    await expect((backupAndResetSessionData as any).run(teacher({ reason: 'test_run', reset_level: 'single_student', reset_target: 'class', reset_scope: 'full_student' })))
      .rejects.toMatchObject({ code: 'invalid-argument', message: RESET_CLASS_FULL_REFUSAL_HE });
    expect(h.fs.reset_audit_log.r_other).toBeDefined();
    expect(Object.keys(h.fs.reset_audit_log)).toEqual(['r_other']);
  });
});
