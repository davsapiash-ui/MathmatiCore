import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 1.10.2026 — the engine around the model: errors are classified as what
 * they are, the second try goes to the right model, the monitoring counters
 * are written where the console reads them, the reports are Hebrew-only, and
 * the research export tells an AI card from a static one.
 */
const h = vi.hoisted(() => ({
  calls: [] as Array<{ model?: string; prompt: string; thinking: string }>,
  answers: [] as Array<() => Promise<{ text: string; latency_ms: number }>>,
  sets: [] as Array<Record<string, any>>,
}));

vi.mock('../geminiConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../geminiConfig')>();
  return {
    ...actual,
    generateGeminiText: async (call: { model?: string; prompt: string; thinking: string }) => {
      h.calls.push({ model: call.model, prompt: call.prompt, thinking: call.thinking });
      const next = h.answers.shift();
      if (!next) throw new Error('no answer queued');
      return next();
    },
  };
});

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n: number) => ({ __inc: n }) },
  getFirestore: () => ({
    collection: () => ({ doc: () => ({ set: async (v: Record<string, any>) => { h.sets.push(v); }, get: async () => ({ exists: false }) }) }),
  }),
}));

import { classifyGeminiError, GeminiTimeoutError, getGeminiKeyStatus, SOCRATIC_PRIMARY_MODEL, SOCRATIC_FALLBACK_MODEL } from '../geminiConfig';
import { generateWithRetry, CORRECTED_RETRY_ON_PRIMARY_MIN_MS, SOCRATIC_TOTAL_BUDGET_MS } from '../geminiProxy';
import { recordAiCall, resetAiMonitoringState, getAiServiceStatus, summarizeShownCards } from '../aiMonitoring';
import { reportTextViolation, keepHebrewLines, reportAnalysisOutcome, isEmptyAnalysis } from '../reportAnalysis';
import { researchDetailsColumns } from '../researchTelemetryRow';
import { validateSocraticRequest, deriveSocraticFacts } from '../socraticContract';

const goodCard = JSON.stringify({
  error_category: 'procedural',
  guiding_question: 'בתרגיל 128 + 35, בטור היחידות יש 10 לבנים או יותר. מה עושים?',
  options: [
    { id: 'opt_1', option_text: 'מקבצים 10 יחידות לעשרת אחת', feedback_text: 'נכון מאוד! לחצו על הכפתור "קבצו 10".', is_correct: true },
    { id: 'opt_2', option_text: 'מוחקים יחידות לפח האשפה', feedback_text: 'רמז: מה קורה למספר כשמוחקים לבנים?', is_correct: false },
    { id: 'opt_3', option_text: 'כותבים 13 בתיבה אחת', feedback_text: 'רמז: כמה ספרות כותבים בכל תיבה?', is_correct: false },
  ],
});
const facts = () => {
  const v = validateSocraticRequest({
    student_id: 5, session_id: 'session_4_student_5', exercise_id: 's4_r_t2', active_column_index: 0,
    workspace_state: { ones_count: 13, tens_count: 5, hundreds_count: 1, memory_circles: {} }, recent_actions: [],
    exercise_context: { operation: 'addition', number_a: 128, number_b: 35, session_id: 's', session_topic: '', active_column: 'units', active_column_index: 0, target_sub_problem: '8 + 5' },
  });
  if (!v.ok) throw new Error(v.reason);
  return deriveSocraticFacts(v.value);
};
const apiError = (status: number, message: string) => Object.assign(new Error(message), { status });

describe('errors are what they are', () => {
  it('a retired model is "misconfigured", not "network" (the legacy SDK message starts "Error fetching")', () => {
    expect(classifyGeminiError(new Error('[GoogleGenerativeAI Error]: Error fetching from https://x: [404 Not Found] This model models/gemini-2.5-flash is no longer available to new users.'))).toBe('misconfigured');
    expect(classifyGeminiError(apiError(404, 'models/x is not found'))).toBe('misconfigured');
    expect(classifyGeminiError(apiError(400, 'Thinking level MINIMAL is not supported for this model.'))).toBe('misconfigured');
    expect(classifyGeminiError(apiError(400, 'Manually set deadline 5s is too short.'))).toBe('misconfigured');
  });
  it('overload, quota, auth and our own timeout', () => {
    expect(classifyGeminiError(apiError(503, 'This model is currently experiencing high demand'))).toBe('network');
    expect(classifyGeminiError(apiError(429, 'Resource exhausted'))).toBe('quota');
    expect(classifyGeminiError(apiError(403, 'permission denied'))).toBe('auth');
    expect(classifyGeminiError(new GeminiTimeoutError(4500))).toBe('timeout');
  });
  it('a key that is not "AIza…" is not reported as malformed (the bound key authenticates)', () => {
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'AQ.test-key-of-the-new-shape-1234567890';
    try {
      const s = getGeminiKeyStatus();
      expect(s.configured).toBe(true);
      expect(s.well_formed).toBe(true);
      expect(s.problem).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prev;
    }
  });
});

describe('the second try goes to the right model', () => {
  beforeEach(() => { h.calls = []; h.answers = []; });

  it('an overloaded primary (503) → the fallback model answers', async () => {
    h.answers.push(async () => { throw apiError(503, 'high demand'); });
    h.answers.push(async () => ({ text: goodCard, latency_ms: 1800 }));
    const r = await generateWithRetry('prompt', facts());
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(h.calls.map((c) => c.model)).toEqual([SOCRATIC_PRIMARY_MODEL.id, SOCRATIC_FALLBACK_MODEL.id]);
    expect(h.calls[1].thinking).toBe(SOCRATIC_FALLBACK_MODEL.thinking);
  });

  it('a card that broke a rule → the same model, told what to fix', async () => {
    h.answers.push(async () => ({ text: goodCard.replace('מה עושים?', 'מה נעשה?'), latency_ms: 2000 }));
    h.answers.push(async () => ({ text: goodCard, latency_ms: 2000 }));
    const r = await generateWithRetry('prompt', facts());
    expect(r.ok).toBe(true);
    expect(h.calls.map((c) => c.model)).toEqual([SOCRATIC_PRIMARY_MODEL.id, SOCRATIC_PRIMARY_MODEL.id]);
    expect(h.calls[1].prompt).toContain('YOUR PREVIOUS ANSWER WAS REJECTED: language: first_person_plural');
  });

  it('a late rule rejection (little budget left) → the corrected card goes to the faster fallback model', async () => {
    let now = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      h.answers.push(async () => { now += 4400; return { text: goodCard.replace('מה עושים?', 'מה נעשה?'), latency_ms: 4400 }; });
      h.answers.push(async () => ({ text: goodCard, latency_ms: 1500 }));
      const r = await generateWithRetry('prompt', facts());
      expect(r.ok).toBe(true);
      expect(h.calls.map((c) => c.model)).toEqual([SOCRATIC_PRIMARY_MODEL.id, SOCRATIC_FALLBACK_MODEL.id]);
      expect(h.calls[1].prompt).toContain('YOUR PREVIOUS ANSWER WAS REJECTED');
      expect(CORRECTED_RETRY_ON_PRIMARY_MIN_MS).toBeGreaterThan(7500 - 4400);
    } finally {
      spy.mockRestore();
    }
  });

  it('an auth failure is not retried (the key is the same for both models)', async () => {
    h.answers.push(async () => { throw apiError(403, 'permission denied'); });
    const r = await generateWithRetry('prompt', facts());
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(1);
  });
});

describe('the monitoring counters are nested maps the console reads', () => {
  it('totals, daily and by_model are maps, not dotted field names', async () => {
    resetAiMonitoringState();
    h.sets = [];
    recordAiCall({ feature: 'socratic', outcome: 'ok', latency_ms: 2300, model_id: 'gemini-3.8-flash' });
    // Written after the answer has left (setImmediate), never before it.
    expect(h.sets).toHaveLength(0);
    await new Promise((r) => setImmediate(r));
    const v = h.sets[0];
    expect(Object.keys(v).some((k) => k.includes('.'))).toBe(false);
    expect(v.totals.socratic.calls).toEqual({ __inc: 1 });
    expect(v.totals.socratic.ok).toEqual({ __inc: 1 });
    expect(v.by_model.gemini_3_8_flash.socratic.latency_sum_ms).toEqual({ __inc: 2300 });
    expect(Object.keys(v.daily)).toHaveLength(1);
  });
});

describe('the reports are written in Hebrew only', () => {
  it('a line with Latin letters or a non-Ministry term is refused; Hebrew lines are kept', () => {
    expect(reportTextViolation(['בתרגיל s4_g_t1 נרשמה שגיאה'])).toMatch(/Hebrew only/);
    expect(reportTextViolation(['The learner forgot the carry'])).toMatch(/Hebrew only/);
    expect(reportTextViolation(['אי-הוספת השארית מההמרה'])).toMatch(/Ministry/);
    expect(reportTextViolation(['בתרגיל 1,245 + 328 נשכחה העשרת שעברה לטור העשרות.'])).toBeNull();
    expect(keepHebrewLines({ knowledge_gaps: ['שורה בעברית', 'Latin line'], teaching_recommendations: ['המלצה'] }))
      .toEqual({ knowledge_gaps: ['שורה בעברית'], teaching_recommendations: ['המלצה'] });
  });

  it('ordinary Hebrew that only looks like a forbidden term is kept (review of 1.10.2026)', () => {
    for (const t of [
      'מומלץ ללוות את הלומד בתרגול ההקבצה בטור העשרות.',
      'הלומד התקשה בנושאים של ערך המקום.',
      'הסברים מלווים בהדגמה בלבנים עזרו לו.',
      'נושא אחד שחזר: המרה בטור המאות.',
      'הלומד עבד בשלווה.',
    ]) expect(reportTextViolation([t]), t).toBeNull();
  });

  it('the forbidden terms themselves are refused, with word boundaries and context', () => {
    for (const t of [
      'הלומד שכח את השארית מההמרה.',
      'בחיסור הלומד ביצע הלוואה מטור העשרות.',
      'יש לתרגל לווים עשרת מהטור השכן.',
      'מומלץ ללוות עשרת מטור העשרות.',
      'הלומד נושאים את ה-1 לטור הבא.',
      'בעיה בנשיאה בטור העשרות.',
      'שבירת עשרת ליחידות.',
    ]) expect(reportTextViolation([t]), t).toMatch(/Ministry/);
  });
});

describe('a report analysis is counted as what it is', () => {
  const keys = ['knowledge_gaps', 'teaching_recommendations'] as const;
  it('nothing to report is "empty", not "schema_reject"', () => {
    expect(isEmptyAnalysis('{"knowledge_gaps":[],"teaching_recommendations":[]}', keys)).toBe(true);
    expect(isEmptyAnalysis('{"knowledge_gaps":["  "],"teaching_recommendations":[]}', keys)).toBe(true);
    expect(isEmptyAnalysis('{"knowledge_gaps":[]}', keys)).toBe(false);
    expect(isEmptyAnalysis('not json', keys)).toBe(false);
    expect(reportAnalysisOutcome(false, false, '{"knowledge_gaps":[],"teaching_recommendations":[]}', keys).outcome).toBe('empty');
    expect(reportAnalysisOutcome(false, false, '{"knowledge_gaps":[]}', keys).outcome).toBe('schema_reject');
    expect(reportAnalysisOutcome(false, true, '{"knowledge_gaps":["Latin"],"teaching_recommendations":[]}', keys).outcome).toBe('language_reject');
    expect(reportAnalysisOutcome(true, true, null, keys)).toEqual({ outcome: 'ok', detail: 'lines dropped: not Hebrew-only' });
  });
  it('"empty" is not written as the last failure', async () => {
    resetAiMonitoringState();
    h.sets = [];
    recordAiCall({ feature: 'report_analysis', outcome: 'empty', latency_ms: 3000, model_id: 'gemini-3.8-flash' });
    await new Promise((r) => setImmediate(r));
    expect(h.sets[0].last_failure).toBeUndefined();
    expect(h.sets[0].totals.report_analysis.empty).toEqual({ __inc: 1 });
  });
});

describe('the admin live test: a click while a test runs is not a failed engine', () => {
  it('the second click gets in_progress, not "the engine did not answer"', async () => {
    h.calls = [];
    h.answers = [];
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'AQ.test-key-of-the-new-shape-1234567890';
    let release: (v: { text: string; latency_ms: number }) => void = () => {};
    h.answers.push(() => new Promise((resolve) => { release = resolve; }));
    const staff = { auth: { uid: 'a', token: { role: 'admin' } }, data: { test_call: true } } as any;
    try {
      const first = (getAiServiceStatus as any).run(staff);
      await new Promise((r) => setTimeout(r, 10));
      const second = await (getAiServiceStatus as any).run(staff);
      expect(second.test.in_progress).toBe(true);
      expect(second.test.rate_limited).toBe(true);
      release({ text: '{"ok": true}', latency_ms: 900 });
      const done = await first;
      expect(done.test.ok).toBe(true);
      expect(done.test.in_progress).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prev;
    }
  });
});

describe('the research export tells an AI card from a static one', () => {
  it('source, model and frame of SOCRATIC_CARD_SHOWN have typed columns', () => {
    expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_source: 'ai', model_id: 'gemini-3.8-flash', card_situation: 'borrow_check', card_level: 1 }))
      .toMatchObject({ card_source: 'ai', card_model_id: 'gemini-3.8-flash', card_situation: 'borrow_check', card_level: 1 });
    expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_source: 'static', model_id: null }))
      .toMatchObject({ card_source: 'static', card_model_id: '', card_situation: '', card_level: '' });
    // Free text never reaches the dataset.
    expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_source: 'gpt', model_id: 'my name is Dana', card_situation: 'Dana', card_level: 9 }))
      .toMatchObject({ card_source: '', card_model_id: '', card_situation: '', card_level: '' });
    expect(researchDetailsColumns('DIGIT_ENTERED', { card_source: 'ai' }).card_source).toBe('');
  });
});

/**
 * 7.10.2026, owner: the measurement counts what the child saw. The server's
 * "ok" is a model answer it validated; the learner may still have seen the
 * static card (the answer came after the 8 s, the learner's rules refused it,
 * or the board changed under the hourglass).
 */
describe('what the children saw, not what the server sent (7.10.2026)', () => {
  it('the server budget leaves a full second of the 8 s on the learner side for the trip there and back', () => {
    expect(SOCRATIC_TOTAL_BUDGET_MS).toBeLessThanOrEqual(8000 - 1000);
  });

  it('counts the shown cards from the learner events: AI, static by reason, unknown before 1.10', () => {
    const today = '2026-10-07';
    const at = (iso: string) => Date.parse(iso);
    const ev = (details: Record<string, unknown>, ts = at('2026-10-07T08:00:00Z')) => ({ event_type: 'SOCRATIC_CARD_SHOWN', client_timestamp: ts, details });
    const s = summarizeShownCards([
      ev({ card_source: 'ai' }),
      ev({ card_source: 'ai' }, at('2026-10-05T08:00:00Z')),
      ev({ card_source: 'static', card_fallback_reason: 'timeout' }),
      ev({ card_source: 'static', card_fallback_reason: 'rule_rejected', card_fallback_detail: 'hidden_number_leaked' }),
      ev({ card_source: 'static' }, at('2026-10-02T08:00:00Z')), // before the reason existed
      ev({ card_source: 'static', card_fallback_reason: 'my name is Dana' }),
      ev({}, at('2026-09-20T08:00:00Z')), // before card_source existed
      { event_type: 'DIGIT_ENTERED', client_timestamp: at('2026-10-07T08:00:00Z'), details: { card_source: 'ai' } },
    ], today);
    expect(s.total).toEqual({ shown: 7, ai: 2, static: 4, unknown: 1, static_reasons: { timeout: 1, rule_rejected: 1, unrecorded: 2 } });
    expect(s.today).toEqual({ shown: 4, ai: 1, static: 3, unknown: 0, static_reasons: { timeout: 1, rule_rejected: 1, unrecorded: 1 } });
  });

  it('the research export has the reason, its code and the wait — closed lists and numbers only', () => {
    expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_source: 'static', card_fallback_reason: 'timeout', card_fallback_detail: 'deadline-exceeded', card_wait_ms: 8003 }))
      .toMatchObject({ card_fallback_reason: 'timeout', card_fallback_detail: 'deadline-exceeded', card_wait_ms: 8003 });
    expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_source: 'ai', card_wait_ms: 2400 }))
      .toMatchObject({ card_fallback_reason: '', card_fallback_detail: '', card_wait_ms: 2400 });
    expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_fallback_reason: 'Dana', card_fallback_detail: 'my name is Dana', card_wait_ms: 'x' }))
      .toMatchObject({ card_fallback_reason: '', card_fallback_detail: '', card_wait_ms: '' });
    expect(researchDetailsColumns('DIGIT_ENTERED', { card_fallback_reason: 'timeout' }).card_fallback_reason).toBe('');
  });

  it('how a card was delivered never reaches the model as the work of the child', () => {
    const v = validateSocraticRequest({
      student_id: 5, session_id: 'session_4_student_5', exercise_id: 's4_r_t2', active_column_index: 0,
      workspace_state: { ones_count: 13, tens_count: 5, hundreds_count: 1, memory_circles: {} },
      recent_actions: [{ event_type: 'SOCRATIC_CARD_SHOWN', column_index: 0, details: { trigger_reason: 'hesitation_45s', card_source: 'static', card_fallback_reason: 'timeout', card_fallback_detail: 'x', card_wait_ms: 8000 } }],
      exercise_context: { operation: 'addition', number_a: 128, number_b: 35, session_id: 's', session_topic: '', active_column: 'units', active_column_index: 0, target_sub_problem: '8 + 5' },
    });
    if (!v.ok) throw new Error(v.reason);
    expect(v.value.recent_actions[0].details).toEqual({ trigger_reason: 'hesitation_45s', card_source: 'static' });
  });
});
