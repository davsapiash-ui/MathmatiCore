import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Owner decision, 11.10.2026: every rejected coaching card is stored in a
 * minimal anonymised record (ai_rejections, server-only), and a weekly report
 * (Sunday 08:00, Israel time) summarises the week into the Drive folder "4 מנהל".
 */

const h = vi.hoisted(() => ({
  answers: [] as Array<() => Promise<{ text: string; latency_ms: number }>>,
  added: [] as Array<{ collection: string; doc: Record<string, any> }>,
}));

vi.mock('../geminiConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../geminiConfig')>();
  return {
    ...actual,
    generateGeminiText: async () => {
      const next = h.answers.shift();
      if (!next) throw new Error('no answer queued');
      return next();
    },
  };
});

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n: number) => ({ __inc: n }), serverTimestamp: () => ({ __ts: true }) },
  getFirestore: () => ({
    collection: (name: string) => ({
      add: async (doc: Record<string, any>) => { h.added.push({ collection: name, doc }); return { id: 'x' }; },
      doc: () => ({ set: async () => undefined, get: async () => ({ exists: false }) }),
    }),
  }),
}));

import { buildAiRejectionRecord, generateWithRetry, meetingFromExerciseId } from '../geminiProxy';
import { AI_REJECTIONS_COLLECTION, AI_REJECTION_FIELDS, AI_REJECTION_TEXT_MAX, aiRejectionDoc } from '../aiMonitoring';
import {
  AI_REJECTIONS_EMPTY_HE,
  AI_REJECTIONS_HEADINGS_HE,
  AI_REJECTIONS_REPORT_OPTIONS,
  AI_REJECTIONS_TITLE_HE,
  MAX_EXAMPLES,
  aiRejectionsReportHtml,
  aiRejectionsReportLines,
  buildAiRejectionsReport,
  weeklyAiRejectionsReport,
} from '../aiRejectionsReport';
import { DRIVE_FOLDERS, aiRejectionsReportFileName } from '../driveNames';
import { validateSocraticRequest, deriveSocraticFacts } from '../socraticContract';

// Sunday 11.10.2026 08:00 in Israel (UTC+3).
const TO = Date.UTC(2026, 9, 11, 5, 0);
const FROM = TO - 7 * 24 * 60 * 60 * 1000;

const card = (q: string) => JSON.stringify({ error_category: 'conceptual', guiding_question: q, options: [{ option_text: 'אפשרות א' }, { option_text: 'אפשרות ב' }, { option_text: 'אפשרות ג' }] });

const row = (over: Record<string, unknown> = {}) => ({
  exercise_id: 's4_add_1',
  meeting: 4,
  reason: 'forbidden terminology: x',
  outcome: 'forbidden_term',
  model_id: 'gemini-x',
  attempt: 1,
  demo: false,
  card_text: card('מה קורה בטור האחדות?'),
  created_at_ms: TO - 1000,
  ...over,
});

describe('the rejection record', () => {
  it('holds the listed fields only: no learner, no session, the text capped and scrubbed', () => {
    const rec = buildAiRejectionRecord({
      context: { exercise_id: 's5_sub_2', meeting: null, demo: false },
      reason: '  final answer leaked  ',
      outcome: 'answer_leak',
      model_id: 'gemini-x',
      attempt: 2,
      raw: 'כתבו אל a@b.co ' + 'א'.repeat(5000),
    });
    expect(Object.keys(rec).sort()).toEqual([...AI_REJECTION_FIELDS].sort());
    expect(rec).not.toHaveProperty('student_id');
    expect(rec).not.toHaveProperty('session_id');
    expect(rec.meeting).toBe(5); // from the exercise id
    expect(rec.reason).toBe('final answer leaked');
    expect(rec.card_text.length).toBe(AI_REJECTION_TEXT_MAX);
    expect(rec.card_text).toContain('[REDACTED_EMAIL]');
    expect(rec.card_text).not.toContain('a@b.co');
  });

  it('the written document drops any field outside the list', () => {
    const doc = aiRejectionDoc({ ...buildAiRejectionRecord({ context: { exercise_id: 's1_x', meeting: 1, demo: true }, reason: 'r', outcome: 'schema_reject', model_id: 'm', attempt: 1, raw: '{}' }), student_id: 3, session_id: 'session_1_student_3' } as any);
    expect(doc).not.toHaveProperty('student_id');
    expect(doc).not.toHaveProperty('session_id');
    expect(doc.demo).toBe(true);
  });

  it('meeting from the exercise id', () => {
    expect(meetingFromExerciseId('s7_detective_3')).toBe(7);
    expect(meetingFromExerciseId('s9_x')).toBeNull();
    expect(meetingFromExerciseId('x')).toBeNull();
    expect(meetingFromExerciseId(null)).toBeNull();
  });
});

describe('the proxy stores every rejection, the first try included', () => {
  beforeEach(() => {
    h.answers.length = 0;
    h.added.length = 0;
  });

  const facts = () => {
    const v = validateSocraticRequest({
      student_id: 3, session_id: 'session_4_student_3', exercise_id: 's4_add_1', active_column_index: 0,
      workspace_state: { ones_count: 13, tens_count: 5, hundreds_count: 1, memory_circles: {} }, recent_actions: [],
      exercise_context: { operation: 'addition', number_a: 128, number_b: 35, session_id: 's', session_topic: '', active_column: 'units', active_column_index: 0, target_sub_problem: '8 + 5' },
    });
    if (!v.ok) throw new Error(v.reason);
    return deriveSocraticFacts(v.value);
  };

  it('two rejected tries → two records, no learner identity, the card unchanged', async () => {
    h.answers.push(async () => ({ text: 'not json', latency_ms: 5 }));
    h.answers.push(async () => ({ text: 'still not json', latency_ms: 5 }));
    const r = await generateWithRetry('prompt', facts(), { exercise_id: 's4_add_1', meeting: 4, demo: false });
    expect(r.ok).toBe(false);
    await new Promise((res) => setImmediate(res));
    await new Promise((res) => setImmediate(res));
    const recs = h.added.filter((a) => a.collection === AI_REJECTIONS_COLLECTION);
    expect(recs.map((a) => a.doc.attempt)).toEqual([1, 2]);
    for (const { doc } of recs) {
      expect(doc).toMatchObject({ exercise_id: 's4_add_1', meeting: 4, outcome: 'not_json', demo: false });
      expect(doc).not.toHaveProperty('student_id');
      expect(doc).not.toHaveProperty('session_id');
      expect(doc.created_at).toEqual({ __ts: true });
    }
  });

  it('without a context nothing is stored (behaviour of the old call unchanged)', async () => {
    h.answers.push(async () => ({ text: 'not json', latency_ms: 5 }));
    h.answers.push(async () => ({ text: 'not json', latency_ms: 5 }));
    await generateWithRetry('prompt', facts());
    await new Promise((res) => setImmediate(res));
    expect(h.added).toHaveLength(0);
  });
});

describe('the weekly report builder', () => {
  it('counts by kind and by meeting, with Hebrew headings', () => {
    const rows = [
      row(),
      row({ exercise_id: 's4_add_2' }),
      row({ exercise_id: 's5_sub_1', meeting: 5, outcome: 'answer_leak', reason: 'final answer leaked' }),
      row({ exercise_id: 's1_target_347', meeting: 1, outcome: 'language_reject', reason: 'language: x', demo: true }),
    ];
    const r = buildAiRejectionsReport(rows, { from_ms: FROM, to_ms: TO });
    expect(r.total).toBe(4);
    expect(r.demo_count).toBe(1);
    expect(r.by_kind[0]).toEqual({ code: 'forbidden_term', label_he: 'מונח אסור', count: 2 });
    expect(r.by_meeting.map((m) => [m.meeting, m.count])).toEqual([[1, 1], [4, 2], [5, 1]]);
    expect(r.by_meeting[1].label_he).toBe('מפגש 4 · חיבור במאונך עם הקבצה');
    expect(r.period_he).toContain('04.10.2026');
    expect(r.period_he).toContain('11.10.2026');
    const html = aiRejectionsReportHtml(r);
    expect(html).toContain('dir="rtl"');
    for (const heading of [AI_REJECTIONS_TITLE_HE, ...Object.values(AI_REJECTIONS_HEADINGS_HE)]) expect(html).toContain(heading);
  });

  it('at most five examples, one of each kind first, newest first', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ exercise_id: `s4_add_${i}`, created_at_ms: TO - i * 1000 }));
    rows.push(row({ exercise_id: 's6_zero_1', meeting: 6, outcome: 'frame_reject', created_at_ms: FROM + 10 }));
    const r = buildAiRejectionsReport(rows, { from_ms: FROM, to_ms: TO });
    expect(r.examples).toHaveLength(MAX_EXAMPLES);
    expect(r.examples[0].exercise_id).toBe('s4_add_0');
    expect(r.examples.map((e) => e.code)).toContain('frame_reject');
    expect(r.examples[0].card_excerpt).toBe('מה קורה בטור האחדות? | אפשרות א | אפשרות ב | אפשרות ג');
  });

  it('a learner id or session id on a stored row never reaches the report', () => {
    const r = buildAiRejectionsReport([row({ student_id: 7, session_id: 'session_4_student_7', uid: 'abc123' })], { from_ms: FROM, to_ms: TO });
    const all = JSON.stringify(r) + aiRejectionsReportHtml(r) + aiRejectionsReportLines(r).join('\n');
    expect(all).not.toContain('student_id');
    expect(all).not.toContain('session_4_student_7');
    expect(all).not.toContain('abc123');
    expect(Object.keys(r.examples[0]).sort()).toEqual(['card_excerpt', 'code', 'exercise_id', 'kind_label_he', 'meeting_label_he', 'reason']);
  });

  it('an empty week still says so', () => {
    const r = buildAiRejectionsReport([], { from_ms: FROM, to_ms: TO });
    expect(r.total).toBe(0);
    expect(aiRejectionsReportHtml(r)).toContain(AI_REJECTIONS_EMPTY_HE);
    expect(aiRejectionsReportLines(r)).toContain(AI_REJECTIONS_EMPTY_HE);
  });
});

describe('schedule, file name and rules', () => {
  it('Sunday 08:00, Israel time', () => {
    expect(AI_REJECTIONS_REPORT_OPTIONS.schedule).toBe('0 8 * * 0');
    expect(AI_REJECTIONS_REPORT_OPTIONS.timeZone).toBe('Asia/Jerusalem');
    const ep = (weeklyAiRejectionsReport as any).__endpoint;
    expect(ep.scheduleTrigger.schedule).toBe('0 8 * * 0');
    expect(ep.scheduleTrigger.timeZone).toBe('Asia/Jerusalem');
  });

  it('the file goes to "4 מנהל" under a dated name', () => {
    expect(DRIVE_FOLDERS.admin).toBe('4 מנהל');
    expect(readFileSync(resolve(__dirname, '../aiRejectionsReport.ts'), 'utf8')).toContain('DRIVE_FOLDERS.admin');
    expect(aiRejectionsReportFileName(FROM, TO)).toBe('כרטיסי חניכה שנדחו - 04.10.2026-11.10.2026.pdf');
  });

  it('firestore.rules closes ai_rejections to every client', () => {
    const rules = readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8');
    const start = rules.indexOf('match /ai_rejections/{rejectionId}');
    expect(start).toBeGreaterThan(-1);
    const open = rules.indexOf('{', rules.indexOf('}', start));
    const block = rules.slice(open, rules.indexOf('}', open));
    expect(block).toMatch(/allow read, write: if false;/);
    expect(block).not.toMatch(/if (?!false)/);
  });
});
