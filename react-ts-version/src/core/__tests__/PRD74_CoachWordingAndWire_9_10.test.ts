import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD 7.4 (8.10.2026), checked against the code on 9.10.2026:
 *  - Module 13 §א: the card "המספר שחיסרנו" answers in the PRD's words, and the
 *    server's language rules do not refuse them.
 *  - Module 13 §א / Module 7 §א: no "שארית", and a column is "טור", not "עמודה" —
 *    refused on the client as on the server.
 *  - Module 7 §א: sentences call the undo button "כפתור ביטול הפעולה ↺"; the
 *    server accepts the symbol after that name, and the narration drops it.
 *  - Appendix A §6: exercise_context.active_column is 'ones' | 'tens' |
 *    'hundreds' | 'thousands' on the wire.
 */

vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async () => undefined) };
});

import { SocraticEngine, socraticTextViolation, FORBIDDEN_TERMS_HE, PRD_WIRE_COLUMN, TASK_HINTS } from '@/infrastructure/services/SocraticEngine';
import { tts } from '@/infrastructure/services/TTSService';
import { validateSocraticRequest, validateSocraticResponse, deriveSocraticFacts } from '../../../../functions/src/socraticContract';
import { languageViolation } from '../../../../functions/src/socraticLanguage';

const SRC = resolve(__dirname, '../..');
const code = (p: string) => readFileSync(resolve(SRC, p), 'utf-8').replace(/\r\n/g, '\n');

describe('PRD Module 13 §א — the card "המספר שחיסרנו"', () => {
  it('answers in the PRD\'s words, and the server\'s language rules pass them', () => {
    const engine = code('infrastructure/services/SocraticEngine.ts');
    const answer = 'מהמספר שממנו מחסרים מורידים את התוצאה, ומקבלים את המספר שחיסרנו';
    expect(engine).toContain(`textHe: "${answer}"`);
    expect(languageViolation([answer, 'כיצד מוצאים את המספר שחיסרנו?'])).toBeNull();
  });
});

describe('PRD Module 13 §א and Module 7 §א — no "שארית", and "טור" not "עמודה"', () => {
  it('the client refuses an engine card that says them, like the server', () => {
    for (const term of ['שארית', 'שאריות', 'עמודה', 'עמודות', 'עמודת']) expect(FORBIDDEN_TERMS_HE).toContain(term);
    for (const bad of ['מה עושים עם השארית?', 'כמה לבנים יש בעמודה של העשרות?', 'כמה לבנים יש בעמודת היחידות?']) {
      expect(socraticTextViolation([bad], null), bad).toMatch(/^forbidden term/);
    }
    expect(socraticTextViolation(['כמה לבנים יש בטור העשרות?'], null)).toBeNull();
  });

  it('no static card or fallback says them', () => {
    for (const f of ['infrastructure/services/SocraticEngine.ts', 'infrastructure/services/staticSocraticCards.ts']) {
      const text = code(f).replace(/^\s*(?:\/\/|\*).*$/gm, '').replace(/^\s*'(?:שארית|שאריות|עמודה|עמודות|עמודת)'.*$/gm, '');
      expect(text, f).not.toMatch(/שארית|שאריות|עמודה|עמודות|עמודת/);
    }
  });
});

describe('PRD Module 7 §א — the undo button is "כפתור ביטול הפעולה ↺" in every card sentence', () => {
  it('every card text that names the button carries the symbol', () => {
    // The frame's intent (frame(…)) is a note to the engine, not a sentence the child reads.
    const lines = code('infrastructure/services/staticSocraticCards.ts').split('\n').filter((l) => /כפתור ביטול הפעולה/.test(l) && !/frame\(/.test(l));
    expect(lines.length).toBeGreaterThan(10);
    for (const l of lines) expect(l.match(/כפתור ביטול הפעולה(?! ↺)/g), l).toBeNull();
  });

  it('the server accepts such a card; the symbol alone is still refused', () => {
    const v = validateSocraticRequest({
      student_id: 3, session_id: 'session_5_student_3', exercise_id: 's5_r_t2', active_column_index: 0,
      workspace_state: { ones_count: 0, tens_count: 0, hundreds_count: 0, memory_circles: {} }, recent_actions: [],
    });
    if (!v.ok) throw new Error(v.reason);
    const card = (feedback: string) => validateSocraticResponse({
      error_category: 'procedural',
      guiding_question: 'נסו לחשוב: בית המספרים לא נראה עכשיו כמו בתחילת התרגיל. מה עושים?',
      options: [
        { option_text: 'מחזירים את הלבנים שהיו בתחילת התרגיל', feedback_text: feedback, is_correct: true },
        { option_text: 'ממשיכים בתרגיל בלי להחזיר את הלבנים', feedback_text: 'רמז: אילו לבנים ההוראה מתארת?', is_correct: false },
        { option_text: 'כותבים מספר בשורת התוצאה', feedback_text: 'רמז: מה ההוראה מבקשת לעשות קודם?', is_correct: false },
      ],
    }, deriveSocraticFacts(v.value));
    expect(card('נכון מאוד! לחצו על כפתור ביטול הפעולה ↺ עד שהלבנים יחזרו להיות כמו בהתחלה.').ok).toBe(true);
    const alone = card('נכון מאוד! לחצו על ↺ עד שהלבנים יחזרו להיות כמו בהתחלה.');
    expect(alone.ok).toBe(false);
    if (!alone.ok) expect(alone.reason).toMatch(/^language: icon_symbol/);
  });

  it('the narration says the name and drops the symbol', () => {
    const spoken = (tts as any).cleanTextForSpeech('נכון מאוד! לחצו על כפתור ביטול הפעולה ↺ עד שהלבנים יחזרו.');
    expect(spoken).toBe('נכון מאוד! לחצו על כפתור ביטול הפעולה עד שהלבנים יחזרו.');
  });
});

describe('PRD Appendix A §6 — exercise_context.active_column on the wire', () => {
  it('the client says "ones", never "units"', () => {
    expect(PRD_WIRE_COLUMN).toEqual({ units: 'ones', tens: 'tens', hundreds: 'hundreds', thousands: 'thousands' });
  });

  it('a request about the ones column carries "ones", and the server takes it', async () => {
    let captured: any = null;
    const proxy = vi.spyOn(SocraticEngine, 'callGeminiProxy').mockImplementation(async (payload: any) => { captured = payload; throw new Error('captured'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await SocraticEngine.fetchGroundedGeminiSocraticQuery({
        currentTask: { id: 's4_r_t2', titleHe: 'חיבור', numberA: 128, numberB: 35, type: 'addition' },
        targetNode: 'regrouping_fluency',
        activeColumnName: 'יחידות',
        counts: { units: 13, tens: 5, hundreds: 1, thousands: 0 },
        qMatrixAnchor: TASK_HINTS.s4_card,
        monitoring: { studentId: 3, sessionNumber: 4, activeColumnIndex: 0, operands: { a: 128, b: 35, isSubtraction: false } },
      });
    } finally {
      proxy.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
    const wire = captured?.socratic_request;
    expect(wire?.exercise_context?.active_column).toBe('ones');
    expect(JSON.stringify(wire.exercise_context)).not.toContain('"active_column":"units"');
    const v = validateSocraticRequest(wire);
    expect(v.ok, !v.ok ? v.reason : '').toBe(true);
    // Inside the server the column keeps its internal name.
    if (v.ok) expect(v.value.exercise_context?.active_column).toBe('units');
  });

  it('the server still takes "units" from a cached client, for one release, and refuses anything else', () => {
    const req = (active_column: unknown) => ({
      student_id: 3, session_id: 'session_4_student_3', exercise_id: 's4_r_t2', active_column_index: 0,
      workspace_state: { ones_count: 3, tens_count: 2, hundreds_count: 1, thousands_count: 0, memory_circles: {} }, recent_actions: [],
      exercise_context: { operation: 'addition', number_a: 128, number_b: 35, session_id: 's', session_topic: '', active_column, active_column_index: 0, target_sub_problem: '8 + 5' },
    });
    for (const c of ['ones', 'units']) {
      const v = validateSocraticRequest(req(c));
      expect(v.ok, c).toBe(true);
      if (v.ok) expect(v.value.exercise_context?.active_column, c).toBe('units');
    }
    for (const c of ['tens', 'hundreds', 'thousands']) {
      const v = validateSocraticRequest(req(c));
      expect(v.ok && v.value.exercise_context?.active_column, c).toBe(c);
    }
    for (const c of ['one', 'unit', 'Ones', '', null, 0]) expect(validateSocraticRequest(req(c)).ok, String(c)).toBe(false);
  });
});
