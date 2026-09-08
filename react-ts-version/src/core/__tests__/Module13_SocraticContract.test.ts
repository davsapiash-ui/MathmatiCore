import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  validateSocraticRequest,
  deriveSocraticFacts,
  buildSocraticPrompt,
  validateSocraticResponse,
  leaksFinalAnswer,
  findForbiddenTerm,
  toLegacyIntervention,
  SOCRATIC_SYSTEM_INSTRUCTION,
  SOCRATIC_RESPONSE_SCHEMA,
  type SocraticRequest,
} from '../../../../functions/src/socraticContract';
import { SocraticEngine, socraticTextViolation, completedColumnsFrom, inferIsSubtraction, SOCRATIC_PROXY_TIMEOUT_MS } from '@/infrastructure/services/SocraticEngine';

/**
 * PRD Module 13 — the Socratic engine's server contract.
 *
 * functions/src/socraticContract.ts is import-free on purpose, so these tests
 * exercise the real functions the Cloud Function runs (not a copy), while the
 * proxy and the credential module are pinned from source the way
 * Module23_ReportAnalysis does, because they import the Functions SDK.
 */
const fnSrc = (rel: string) => readFileSync(resolve(__dirname, '../../../../functions/src/', rel), 'utf-8');

const subtraction425_162: SocraticRequest = {
  student_id: 3,
  session_id: 'session_4_student_3',
  exercise_id: 's4_t2',
  active_column_index: 1,
  exercise_context: {
    operation: 'subtraction',
    number_a: 425,
    number_b: 162,
    session_id: 'session_4',
    session_topic: 'חיסור עם פריטת עשרות',
    active_column: 'tens',
    active_column_index: 1,
    target_sub_problem: '2 - 6',
  },
  workspace_state: { ones_count: 3, tens_count: 2, hundreds_count: 4, thousands_count: 0, memory_circles: {} },
  student_progress_state: {
    completed_columns: ['units'],
    current_column_input: null,
    memory_circles_state: {},
    trigger_reason: 'hesitation_45s',
    consecutive_errors_count: 0,
    recent_actions: [{ event_type: 'DIGIT_ENTERED', column_index: 0, details: { digit_value: 3, is_correct: true } }],
  },
  recent_actions: [],
};

const goodResponse = {
  error_category: 'procedural',
  guiding_question: 'בתרגיל 425 פחות 162, בטור העשרות יש 2 עשרות וצריך להחסיר 6. מאיפה נביא עוד עשרות לבית המספרים?',
  options: [
    { id: 'opt_1', option_text: 'נפרוט מאה אחת מטור המאות ל-10 עשרות', feedback_text: 'נכון מאוד! לחצו על בלוק המאה כדי לפרוט אותו.', is_correct: true },
    { id: 'opt_2', option_text: 'נחסיר הפוך: 6 פחות 2', feedback_text: 'רמז: בחיסור גורעים רק מהכמות הקיימת.', is_correct: false },
    { id: 'opt_3', option_text: 'נמחק עשרות לפח האשפה', feedback_text: 'רמז: מחיקה משנה את ערך המספר.', is_correct: false },
  ],
};

describe('Module 13: GeminiSocraticRequest rigid validation (Appendix A §6)', () => {
  it('accepts the PRD-shaped request and normalises it', () => {
    const v = validateSocraticRequest(subtraction425_162);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.student_id).toBe(3);
      expect(v.value.exercise_context?.active_column).toBe('tens');
      expect(v.value.student_progress_state?.completed_columns).toEqual(['units']);
    }
  });

  it('rejects student ids outside 1-12 (Zero-PII policy)', () => {
    expect(validateSocraticRequest({ ...subtraction425_162, student_id: 13 }).ok).toBe(false);
    expect(validateSocraticRequest({ ...subtraction425_162, student_id: 0 }).ok).toBe(false);
    expect(validateSocraticRequest({ ...subtraction425_162, student_id: 'דניאל' }).ok).toBe(false);
  });

  it('rejects a board that cannot exist and a subtraction with a larger subtrahend', () => {
    expect(validateSocraticRequest({ ...subtraction425_162, workspace_state: { ...subtraction425_162.workspace_state, tens_count: -1 } }).ok).toBe(false);
    expect(validateSocraticRequest({ ...subtraction425_162, workspace_state: { ...subtraction425_162.workspace_state, ones_count: 99 } }).ok).toBe(false);
    expect(validateSocraticRequest({
      ...subtraction425_162,
      exercise_context: { ...subtraction425_162.exercise_context!, number_a: 162, number_b: 425 },
    }).ok).toBe(false);
  });

  it('rejects an unknown trigger reason and strips free text from recent actions', () => {
    expect(validateSocraticRequest({
      ...subtraction425_162,
      student_progress_state: { ...subtraction425_162.student_progress_state!, trigger_reason: 'teacher_said_so' },
    }).ok).toBe(false);

    const v = validateSocraticRequest({
      ...subtraction425_162,
      recent_actions: [{ event_type: 'DIGIT_ENTERED', details: { digit_value: 3, note: 'שמי דניאל כהן ואני גר ברחוב הרצל' } }],
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(JSON.stringify(v.value)).not.toContain('דניאל');
      expect(v.value.recent_actions[0].details).toEqual({ digit_value: 3 });
    }
  });
});

describe('Module 13: monitored facts and the triad prompt', () => {
  it('reads the tens deficit of 425 − 162 off the live board', () => {
    const facts = deriveSocraticFacts(subtraction425_162);
    expect(facts.active?.column).toBe('tens');
    expect(facts.active?.digit_a).toBe(2);
    expect(facts.active?.digit_b).toBe(6);
    expect(facts.active?.needs_conversion).toBe(true);
    expect(facts.active?.board_deficit).toBe(4);
    expect(facts.final_answer).toBe(263);
    expect(facts.suggested_category).toBe('procedural');
    expect(facts.suggested_focus_he).toContain('פריטה');
  });

  it('classifies four wrong digits in a column that needs no conversion as a calculation error', () => {
    const facts = deriveSocraticFacts({
      ...subtraction425_162,
      active_column_index: 0,
      exercise_context: { ...subtraction425_162.exercise_context!, operation: 'addition', number_a: 123, number_b: 45, active_column: 'units', active_column_index: 0, target_sub_problem: '3 + 5' },
      workspace_state: { ones_count: 8, tens_count: 6, hundreds_count: 1, thousands_count: 0, memory_circles: {} },
      student_progress_state: { ...subtraction425_162.student_progress_state!, completed_columns: [], trigger_reason: 'consecutive_errors_4', consecutive_errors_count: 4 },
    });
    expect(facts.suggested_category).toBe('calculation');
  });

  it('treats 10 or more blocks left in a column as a conceptual place-value gap', () => {
    const facts = deriveSocraticFacts({
      ...subtraction425_162,
      exercise_context: { ...subtraction425_162.exercise_context!, operation: 'addition', number_a: 27, number_b: 15, active_column: 'units', active_column_index: 0, target_sub_problem: '7 + 5' },
      workspace_state: { ones_count: 12, tens_count: 3, hundreds_count: 0, thousands_count: 0, memory_circles: {} },
    });
    expect(facts.suggested_category).toBe('conceptual');
    expect(facts.suggested_focus_he).toContain('קיבוץ');
  });

  it('weaves all three pillars into the prompt and never writes the final answer into it', () => {
    const facts = deriveSocraticFacts(subtraction425_162);
    const prompt = buildSocraticPrompt(subtraction425_162, facts, {
      questionHe: 'חסרות לנו עשרות בלוח לחיסור — מה עושים?',
      choices: [{ id: 'opt_1', textHe: 'פורטים מאה אחת ל-10 עשרות', isCorrect: true }],
    });
    // Pillar 1
    expect(prompt).toContain('425 − 162');
    expect(prompt).toContain('טור העשרות');
    // Pillar 2
    expect(prompt).toContain('4 מאות בלוח');
    expect(prompt).toContain('2 עשרות בלוח');
    expect(prompt).toContain('חסרות 4 עשרות');
    // Pillar 3
    expect(prompt).toContain('השהיה של 45 שניות');
    expect(prompt).toContain('טורים שכבר נפתרו נכון: טור היחידות');
    expect(prompt).toContain('DIGIT_ENTERED');
    // Static anchor rides along as the baseline
    expect(prompt).toContain('פורטים מאה אחת ל-10 עשרות');
    // Iron rule 1: the answer (263) is never handed to the model
    expect(prompt).not.toMatch(/(^|[^0-9])263(?![0-9])/);
    // The system instruction carries the triad and the curriculum terminology
    expect(SOCRATIC_SYSTEM_INSTRUCTION).toContain('HOLISTIC PEDAGOGICAL TRIAD');
    expect(SOCRATIC_SYSTEM_INSTRUCTION).toContain('פריטה');
    expect(SOCRATIC_SYSTEM_INSTRUCTION).toContain('קיבוץ');
    expect(SOCRATIC_SYSTEM_INSTRUCTION).toContain('עיגולי הזיכרון');
  });

  it('declares a structured-output schema with exactly the PRD response fields', () => {
    expect(SOCRATIC_RESPONSE_SCHEMA.required).toEqual(['error_category', 'guiding_question', 'options']);
    expect(SOCRATIC_RESPONSE_SCHEMA.properties.error_category.enum).toEqual(['calculation', 'procedural', 'conceptual']);
    expect(SOCRATIC_RESPONSE_SCHEMA.properties.options.items.required).toEqual(['id', 'option_text', 'feedback_text', 'is_correct']);
  });
});

describe('Module 13: GeminiSocraticResponse rigid validation', () => {
  const facts = deriveSocraticFacts(subtraction425_162);

  it('accepts a well-formed PRD response and normalises option ids', () => {
    const v = validateSocraticResponse(goodResponse, facts);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.options.map((o) => o.id)).toEqual(['opt_1', 'opt_2', 'opt_3']);
      expect(v.value.error_category).toBe('procedural');
      expect(toLegacyIntervention(v.value).options[0].text).toBe(goodResponse.options[0].option_text);
    }
  });

  it('accepts the raw JSON string Gemini returns, and the older final_intervention wrapper', () => {
    expect(validateSocraticResponse(JSON.stringify(goodResponse), facts).ok).toBe(true);
    const legacy = {
      final_intervention: {
        error_category: 'procedural',
        guiding_question: goodResponse.guiding_question,
        options: goodResponse.options.map((o) => ({ id: o.id, text: o.option_text, feedback: o.feedback_text, is_correct: o.is_correct })),
      },
    };
    expect(validateSocraticResponse(legacy, facts).ok).toBe(true);
  });

  it('rejects a missing or invalid error_category (PRD: treat as malformed)', () => {
    const { error_category: _drop, ...noCategory } = goodResponse;
    expect(validateSocraticResponse(noCategory, facts).ok).toBe(false);
    expect(validateSocraticResponse({ ...goodResponse, error_category: 'motivational' }, facts).ok).toBe(false);
  });

  it('rejects anything but exactly three options with exactly one correct', () => {
    expect(validateSocraticResponse({ ...goodResponse, options: goodResponse.options.slice(0, 2) }, facts).ok).toBe(false);
    expect(validateSocraticResponse({ ...goodResponse, options: goodResponse.options.map((o) => ({ ...o, is_correct: true })) }, facts).ok).toBe(false);
    expect(validateSocraticResponse({ ...goodResponse, options: goodResponse.options.map((o) => ({ ...o, is_correct: false })) }, facts).ok).toBe(false);
  });

  it('rejects a leaked final answer (iron rule 1) but not the operands or 10/100/1000', () => {
    const leaked = { ...goodResponse, guiding_question: 'התשובה היא 263, נכון?' };
    const v = validateSocraticResponse(leaked, facts);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain('final answer');

    expect(leaksFinalAnswer(['425 פחות 162'], facts)).toBe(false);
    expect(leaksFinalAnswer(['נקבץ 10 יחידות לעשרת אחת'], { final_answer: 10, number_a: 7, number_b: 3 })).toBe(false);
    expect(leaksFinalAnswer(['המספר 2630 גדול'], facts)).toBe(false); // 263 inside a longer number is not the answer
  });

  it('rejects non-curricular or physical terminology (שבירה / הלוואה / נשיאה / מקלות)', () => {
    expect(findForbiddenTerm(['נשבור עשרת אחת'])).toBe('נשבור');
    expect(findForbiddenTerm(['ניקח הלוואה מהמאות'])).toBe('הלוואה');
    expect(findForbiddenTerm(['נשים מקלות בטור'])).toBe('מקלות');
    expect(findForbiddenTerm(['נפרוט עשרת אחת ל-10 יחידות'])).toBeNull();
    const bad = { ...goodResponse, options: [{ ...goodResponse.options[0], option_text: 'נשבור מאה אחת ל-10 עשרות' }, goodResponse.options[1], goodResponse.options[2]] };
    expect(validateSocraticResponse(bad, facts).ok).toBe(false);
  });

  it('rejects non-Hebrew text and non-JSON', () => {
    expect(validateSocraticResponse({ ...goodResponse, guiding_question: 'What is the next step?' }, facts).ok).toBe(false);
    expect(validateSocraticResponse('not json at all', facts).ok).toBe(false);
  });
});

describe('Module 13: proxy and credential hardening (pinned from source)', () => {
  const proxy = fnSrc('geminiProxy.ts');
  const config = fnSrc('geminiConfig.ts');
  const monitor = fnSrc('aiMonitoring.ts');
  const index = fnSrc('index.ts');

  it('binds the Secret Manager key to the proxy and the status endpoint', () => {
    expect(proxy).toContain('onCall(\n  { ...GEMINI_SECRETS, timeoutSeconds: 30 }');
    expect(monitor).toContain('onCall(GEMINI_SECRETS, async (request)');
    expect(config).toContain('defineSecret("GEMINI_API_KEY")');
  });

  it('refuses placeholder keys and never returns more than a 4-character hint', () => {
    expect(config).toContain('your_api_key_here');
    expect(config).toContain('key_hint: key.slice(-4)');
    expect(config).toContain('GOOGLE_API_KEY_RE');
    // The status object exposes a hint and a source, never the credential itself.
    expect(config).toMatch(/export interface GeminiKeyStatus \{[^}]*key_hint: string \| null;[^}]*\}/s);
    expect(config).not.toMatch(/export interface GeminiKeyStatus \{[^}]*\braw\b[^}]*\}/s);
  });

  it('builds the prompt server-side from the validated contract and structured output', () => {
    expect(proxy).toContain('validateSocraticRequest(socratic_request)');
    expect(proxy).toContain('deriveSocraticFacts(req)');
    expect(proxy).toContain('buildSocraticPrompt(req, facts, safeAnchor)');
    expect(proxy).toContain('responseSchema: SOCRATIC_RESPONSE_SCHEMA');
    expect(proxy).toContain('validateSocraticResponse(raw, facts)');
  });

  it('bounds every model call under the client timeout and retries only validator rejections', () => {
    expect(proxy).toContain('SOCRATIC_AI_TIMEOUT_MS = 6500');
    expect(proxy).toContain('SOCRATIC_TOTAL_BUDGET_MS = 7500');
    expect(SOCRATIC_PROXY_TIMEOUT_MS).toBe(8000);
    expect(proxy).toContain('withGeminiTimeout(model.generateContent(prompt), timeoutMs)');
    expect(proxy).toContain('const retryable = first.outcome === "schema_reject"');
    expect(proxy).toContain('YOUR PREVIOUS ANSWER WAS REJECTED');
  });

  it('records every outcome to the monitoring counters the admin console can read', () => {
    expect(monitor).toContain('collection("store_cache").doc(AI_MONITORING_DOC)');
    expect(monitor).toContain('export const getAiServiceStatus');
    expect(index).toContain('export { getAiServiceStatus } from "./aiMonitoring";');
    for (const outcome of ['"ok"', '"timeout"', '"schema_reject"', '"answer_leak"', '"forbidden_term"', '"misconfigured"', '"invalid_request"']) {
      expect(monitor).toContain(outcome);
    }
    expect(proxy).toContain('recordAiCall({ ...base, outcome: "ok", error_category: attempt.value.error_category })');
  });

  it('keeps the Zero-Chatbot policy and the legacy PII scrub', () => {
    expect(proxy).toContain('Zero-Chatbot Policy Violation');
    expect(proxy).toContain('export function scrubPII');
  });
});

describe('Module 13: client side of the contract', () => {
  it('mirrors the two content rules so a leaked answer never reaches a card', () => {
    expect(socraticTextViolation(['התשובה היא 263'], { a: 425, b: 162, isSubtraction: true })).toBe('final answer leaked');
    expect(socraticTextViolation(['נשבור עשרת'], null)).toContain('forbidden');
    expect(socraticTextViolation(['נפרוט עשרת אחת ל-10 יחידות'], { a: 425, b: 162, isSubtraction: true })).toBeNull();
  });

  it('derives completed columns from the digits actually typed', () => {
    expect(completedColumnsFrom({ units: '3', tens: '7' }, { a: 425, b: 162, isSubtraction: true })).toEqual(['units']);
    expect(completedColumnsFrom({ units: '3', tens: '6' }, { a: 425, b: 162, isSubtraction: true })).toEqual(['units', 'tens']);
    expect(completedColumnsFrom({}, { a: 425, b: 162, isSubtraction: true })).toEqual([]);
  });

  it('infers subtraction the same way the static board analysis does', () => {
    expect(inferIsSubtraction({ isSubtraction: true })).toBe(true);
    expect(inferIsSubtraction({ requiresUngrouping: true })).toBe(true);
    expect(inferIsSubtraction({ instructionHe: 'חסרו 162 מ-425' })).toBe(true);
    expect(inferIsSubtraction({ numberA: 12, numberB: 3 }, 'regrouping_fluency')).toBe(false);
  });

  it('drops an AI card that leaks the answer and serves the static one instead', async () => {
    const leaking = {
      data: JSON.stringify({
        error_category: 'procedural',
        guiding_question: 'התוצאה של 425 פחות 162 היא 263 — נכון?',
        options: goodResponse.options,
      }),
    };
    const { vi } = await import('vitest');
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValueOnce(leaking);
    const result = await SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: { id: 's4_t2', numberA: 425, numberB: 162, isSubtraction: true },
      targetNode: 'subtraction_regrouping',
      activeColumnName: 'עשרות',
      counts: { units: 3, tens: 2, hundreds: 4, thousands: 0 },
      qMatrixAnchor: { questionHe: 'x', choices: [{ id: 'opt_1', textHe: 'y' }], correctChoiceId: 'opt_1' },
    });
    expect(result).toBeNull();
  });

  it('reads the PRD response shape (option_text / feedback_text)', async () => {
    const { vi } = await import('vitest');
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValueOnce({ data: goodResponse });
    const result = await SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: { id: 's4_t2', numberA: 425, numberB: 162, isSubtraction: true },
      targetNode: 'subtraction_regrouping',
      activeColumnName: 'עשרות',
      counts: { units: 3, tens: 2, hundreds: 4, thousands: 0 },
      qMatrixAnchor: { questionHe: 'x', choices: [{ id: 'opt_1', textHe: 'y' }], correctChoiceId: 'opt_1' },
    });
    expect(result?.questionHe).toBe(goodResponse.guiding_question);
    expect(result?.choices[0].textHe).toBe(goodResponse.options[0].option_text);
    expect(result?.choices[0].feedbackHe).toBe(goodResponse.options[0].feedback_text);
    expect(result?.correctChoiceId).toBe('opt_1');
    expect(result?.error_category).toBe('procedural');
  });
});
