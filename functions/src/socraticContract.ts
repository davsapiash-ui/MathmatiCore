/**
 * PRD Module 13 — the Socratic engine's request/response contract, prompt
 * builder and response validator, as pure functions.
 *
 * This file deliberately imports nothing: it is exercised both by the Cloud
 * Function (geminiProxy.ts) and by the frontend test-suite, which reads it
 * straight from source. Anything that needs Firebase or the Gemini SDK lives
 * in geminiProxy.ts.
 *
 * The three things it guarantees, in PRD terms:
 *   1. Rigid schema validation of GeminiSocraticRequest (Appendix A §6).
 *   2. A prompt that always weaves the Holistic Pedagogical Triad — exercise
 *      + live board + the learner's monitored steps — and never carries the
 *      final answer to the model in a way it could echo back.
 *   3. Rigid schema validation of GeminiSocraticResponse: exactly three closed
 *      options, exactly one correct, a valid error_category, Hebrew text, no
 *      final-answer leak, and no forbidden (non-digital / non-curricular)
 *      terminology. Anything that fails falls back to the static hint.
 */

import { cardFormViolation, languageViolation, socraticLanguageSpec } from "./socraticLanguage";

export type SocraticOperation = "addition" | "subtraction";
export type SocraticColumn = "units" | "tens" | "hundreds" | "thousands";
export type SocraticErrorCategory = "calculation" | "procedural" | "conceptual";
export type SocraticTriggerReason =
  | "hesitation_45s"
  | "consecutive_errors_4"
  | "consecutive_undos_3"
  | "conversion_not_performed"
  | "repeated_errors";

export const SOCRATIC_COLUMNS: SocraticColumn[] = ["units", "tens", "hundreds", "thousands"];
export const SOCRATIC_ERROR_CATEGORIES: SocraticErrorCategory[] = ["calculation", "procedural", "conceptual"];
export const SOCRATIC_TRIGGER_REASONS: SocraticTriggerReason[] = [
  "hesitation_45s",
  "consecutive_errors_4",
  "consecutive_undos_3",
  "conversion_not_performed",
  "repeated_errors",
];

/** Hebrew names of the columns, indexed like active_column_index. */
export const COLUMN_NAME_HE: Record<SocraticColumn, string> = {
  units: "טור היחידות",
  tens: "טור העשרות",
  hundreds: "טור המאות",
  thousands: "טור האלפים",
};

/** Hebrew plural noun for the blocks of a column ("4 מאות"). */
export const BLOCK_NOUN_HE: Record<SocraticColumn, string> = {
  units: "יחידות",
  tens: "עשרות",
  hundreds: "מאות",
  thousands: "אלפים",
};

/** One block of a column: "מאה אחת", never "1 מאות". "אלף" is masculine. */
const ONE_BLOCK_HE: Record<SocraticColumn, string> = {
  units: "יחידה אחת",
  tens: "עשרת אחת",
  hundreds: "מאה אחת",
  thousands: "אלף אחד",
};

/** "4 מאות", "מאה אחת". */
function countHe(n: number, column: SocraticColumn): string {
  return n === 1 ? ONE_BLOCK_HE[column] : `${n} ${BLOCK_NOUN_HE[column]}`;
}

/** "חסרות 4 עשרות", "חסרה עשרת אחת", "חסרים 2 אלפים", "חסר אלף אחד". */
function missingHe(n: number, column: SocraticColumn): string {
  const masculine = column === "thousands";
  const verb = n === 1 ? (masculine ? "חסר" : "חסרה") : masculine ? "חסרים" : "חסרות";
  return `${verb} ${countHe(n, column)}`;
}

/** A number as the child's screen writes it: "1,245", "328". */
export function formatNumberHe(n: number): string {
  const str = String(Math.abs(n));
  return str.length > 3 ? `${str.slice(0, -3)},${str.slice(-3)}` : str;
}

/** A number with its hidden digits shown as the skeleton shows them: "2,▢3▢". */
export function maskedNumberHe(n: number, hidden: SocraticColumn[] = []): string {
  const cols: SocraticColumn[] = ["units", "tens", "hundreds", "thousands"];
  const len = Math.max(1, String(Math.abs(n)).length);
  const str = cols.slice(0, len).reverse().map((c) => (hidden.includes(c) ? "▢" : String(digitAt(n, c)))).join("");
  return str.length > 3 ? `${str.slice(0, -3)},${str.slice(-3)}` : str;
}

const TRIGGER_HE: Record<SocraticTriggerReason, string> = {
  hesitation_45s: "השהיה של 45 שניות ומעלה ללא פעולה בטור הפעיל",
  consecutive_errors_4: "ארבע שגיאות רצופות בהקלדה",
  consecutive_undos_3: "שלוש לחיצות ביטול רצופות",
  conversion_not_performed: "הקלדה בטור שדורש הקבצה או פריטה לפני שבוצעה ההמרה בלבנים",
  repeated_errors: "תשובה שגויה שנייה ברצף באותו תרגיל",
};

/**
 * Hard cap on blocks per column the proxy will accept — anything larger is not
 * a real board. The same number as the board's own column limit (client
 * core/placeValue.ts MAX_VISIBLE_BLOCKS): station 3 asks for 45 tens (s3_r_t3)
 * and 45 hundreds (s3_g_t3), and a cap of 40 refused every such request, so
 * the child always got the static card and the engine was never asked.
 */
export const MAX_BLOCKS_PER_COLUMN = 50;
export const MAX_RECENT_ACTIONS = 30;
export const MAX_OPERAND = 9999;

export interface SocraticExerciseContext {
  operation: SocraticOperation;
  number_a: number;
  number_b: number;
  session_id: string;
  session_topic: string;
  active_column: SocraticColumn;
  active_column_index: number;
  target_sub_problem: string;
  /**
   * Digits the exercise hides on the screen (a skeleton: "31▢ + 254 = 568").
   * The learner is finding them, so the prompt never shows them and a card
   * that names the whole hidden operand is refused.
   */
  hidden_places?: { a: SocraticColumn[]; b: SocraticColumn[] };
}

export interface SocraticWorkspaceState {
  ones_count: number;
  tens_count: number;
  hundreds_count: number;
  thousands_count: number;
  memory_circles: Record<string, number>;
  is_regrouped_in_canvas?: boolean;
  /** Columns whose conversion is done with the blocks (or written, without blocks) — per column, not exercise-wide. */
  conversions_done?: SocraticColumn[];
}

export interface SocraticRecentAction {
  event_type: string;
  column_index?: number | null;
  details?: Record<string, unknown>;
  timestamp?: number;
}

export interface SocraticProgressState {
  completed_columns: string[];
  current_column_input: string | null;
  memory_circles_state: Record<string, number>;
  trigger_reason: SocraticTriggerReason;
  consecutive_errors_count: number;
  recent_actions: SocraticRecentAction[];
  /** Seconds without an action before a hesitation card. */
  hesitation_seconds?: number;
  /** The owner's static card kinds already shown in this exercise (client StaticCardKind). */
  earlier_card_kinds?: string[];
}

/**
 * What kind of exercise is on the screen. The screen differs by kind — a
 * vertical exercise has a result box per column and memory circles; station
 * 3's representations have ONE answer box and no circles — and the card may
 * name only what is on that screen.
 */
export type SocraticTaskKind =
  | "addition"
  | "subtraction"
  | "skeleton"
  | "missing_result_digit"
  | "error_analysis"
  | "read_write"
  | "compose_break"
  | "decompose"
  | "compose_group"
  | "representation"
  | "flexible"
  | "missing_element"
  | "small_change";
export const SOCRATIC_TASK_KINDS: SocraticTaskKind[] = [
  "addition", "subtraction", "skeleton", "missing_result_digit", "error_analysis",
  "read_write", "compose_break", "decompose", "compose_group", "representation",
  "flexible", "missing_element", "small_change",
];

export type SocraticCounts = Partial<Record<SocraticColumn, number>>;

/**
 * Extension of Appendix A §6 (1.10.2026) for the exercises that are not an
 * addition or a subtraction, where exercise_context is absent and the model
 * used to get only the exercise id. Every field is validated; nothing here is
 * free text from the child.
 */
export interface SocraticTaskContext {
  kind: SocraticTaskKind;
  /** The instruction as the screen shows it (exercise bank text, never the child's). */
  instruction_he: string;
  /** The board the instruction asks for, when it asks for one — compared with the board, never written into the prompt. */
  required_counts?: SocraticCounts;
  /** A break / grouping exercise: the board the instruction builds BEFORE the conversion. */
  start_counts?: SocraticCounts;
  /** A break / grouping exercise: are the conversions the instruction names done? */
  conversion_done?: boolean;
  /** Numbers the card must never show (what the child is asked to find). Used by the leak check only, never sent to the model. */
  secret_numbers?: number[];
  /** A result digit the screen leaves for the child to find (s4_r_t7's tens): never named, for its column. */
  hidden_result_places?: SocraticColumn[];
}

/** Appendix A §6 — the only payload the proxy formulates a prompt from. */
export interface SocraticRequest {
  student_id: number;
  session_id: string;
  exercise_id: string;
  active_column_index: number;
  exercise_context?: SocraticExerciseContext;
  task_context?: SocraticTaskContext;
  card_frame?: SocraticCardFrame;
  workspace_state: SocraticWorkspaceState;
  student_progress_state?: SocraticProgressState;
  recent_actions: SocraticRecentAction[];
}

/**
 * The card frame (owner, 1.10.2026: "the static cards are the base and the
 * boundaries"): derived on the client from the static card the selection
 * picks for this situation. The model keeps its intent and level, uses only
 * the screen's terms and actions, follows the exemplar's form (the anchor),
 * and writes its own wording for this exercise and this child. The validator
 * checks the level.
 */
export interface SocraticCardFrame {
  /** Which situation the selection recognised (a static card's id: "borrow_check", "stray_blocks", …). */
  situation: string;
  /** 1: general — names no column and no action; 2: names the column; 3: names the action on the screen. */
  level: 1 | 2 | 3;
  /** What the child should come to notice, in the owner's words, when the card states it. */
  intent_he?: string;
}

/** The static Q-Matrix card the client would show on fallback; given to the model as the pedagogical baseline. */
export interface SocraticAnchor {
  questionHe: string;
  choices: { id: string; textHe: string; isCorrect?: boolean; feedbackHe?: string }[];
  pedagogical_intent?: string;
}

export interface SocraticOption {
  id: "opt_1" | "opt_2" | "opt_3";
  option_text: string;
  feedback_text: string;
  is_correct: boolean;
}

export interface SocraticResponse {
  error_category: SocraticErrorCategory;
  guiding_question: string;
  options: [SocraticOption, SocraticOption, SocraticOption];
}

export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

function isInt(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A memory circle holds up to two digits (register gap טו, closed 23.9.2026:
 * "כי יש גם המרה שצריך לרשום" — 12 above the units after a decomposition).
 * Keeping only 0–9 dropped that 12, and the prompt then said the circles were
 * empty although the child had written the conversion down.
 */
function cleanMemoryCircles(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isPlainObject(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === "string" ? parseInt(v, 10) : v;
    if (typeof k === "string" && k.length <= 16 && isInt(n, 0, 99)) out[k] = n;
  }
  return out;
}

/**
 * The instruction text of the exercise bank. It is the screen's own text, not
 * the child's, but it still reaches the model, so only what an instruction
 * can contain passes: Hebrew, digits, spaces and punctuation. Anything else —
 * Latin letters, an email, a URL — and the request is refused.
 */
function cleanInstruction(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t || t.length > 400 || !/[א-ת]/.test(t)) return null;
  if (!/^[֐-׿0-9\s.,:;!?"'()\-–—−+=×▢↺/״׳%]+$/.test(t)) return null;
  return t;
}

function cleanRecentActions(raw: unknown): SocraticRecentAction[] {
  if (!Array.isArray(raw)) return [];
  const out: SocraticRecentAction[] = [];
  for (const a of raw.slice(-MAX_RECENT_ACTIONS)) {
    if (!isPlainObject(a) || typeof a.event_type !== "string") continue;
    const action: SocraticRecentAction = { event_type: a.event_type.slice(0, 40) };
    if (isInt(a.column_index, 0, 3)) action.column_index = a.column_index;
    if (isPlainObject(a.details)) {
      // Details are whitelisted to the scalar fields the PRD schema defines —
      // nothing free-text ever reaches the model from here.
      const details: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(a.details)) {
        if ((typeof v === "number" || typeof v === "boolean" || v === null) && k.length <= 32) details[k] = v;
        else if (typeof v === "string" && v.length <= 32 && /^[a-z0-9_]+$/i.test(v)) details[k] = v;
      }
      action.details = details;
    }
    if (typeof a.timestamp === "number") action.timestamp = a.timestamp;
    out.push(action);
  }
  return out;
}

/**
 * Rigid validation of the incoming GeminiSocraticRequest. Everything the
 * prompt is built from passes through here, so the model can never be handed
 * a student name, a free-text field, or a board that cannot exist.
 */
export function validateSocraticRequest(raw: unknown): Validation<SocraticRequest> {
  if (!isPlainObject(raw)) return { ok: false, reason: "socratic_request must be an object" };

  if (!isInt(raw.student_id, 1, 12)) return { ok: false, reason: "student_id must be an integer 1-12" };
  if (typeof raw.session_id !== "string" || !raw.session_id || raw.session_id.length > 64) {
    return { ok: false, reason: "session_id must be a non-empty string" };
  }
  if (typeof raw.exercise_id !== "string" || !raw.exercise_id || raw.exercise_id.length > 64) {
    return { ok: false, reason: "exercise_id must be a non-empty string" };
  }
  if (!isInt(raw.active_column_index, 0, 3)) return { ok: false, reason: "active_column_index must be 0-3" };

  const ws = raw.workspace_state;
  if (!isPlainObject(ws)) return { ok: false, reason: "workspace_state is required" };
  const rawCounts: Record<string, unknown> = {
    ones_count: ws.ones_count ?? 0,
    tens_count: ws.tens_count ?? 0,
    hundreds_count: ws.hundreds_count ?? 0,
    thousands_count: ws.thousands_count ?? 0,
  };
  const counts = { ones_count: 0, tens_count: 0, hundreds_count: 0, thousands_count: 0 };
  for (const k of Object.keys(counts) as (keyof typeof counts)[]) {
    const v = rawCounts[k];
    if (!isInt(v, 0, MAX_BLOCKS_PER_COLUMN)) return { ok: false, reason: `workspace_state.${k} must be an integer 0-${MAX_BLOCKS_PER_COLUMN}` };
    counts[k] = v;
  }

  let exercise_context: SocraticExerciseContext | undefined;
  if (raw.exercise_context !== undefined && raw.exercise_context !== null) {
    const ec = raw.exercise_context;
    if (!isPlainObject(ec)) return { ok: false, reason: "exercise_context must be an object" };
    if (ec.operation !== "addition" && ec.operation !== "subtraction") return { ok: false, reason: "exercise_context.operation invalid" };
    if (!isInt(ec.number_a, 0, MAX_OPERAND) || !isInt(ec.number_b, 0, MAX_OPERAND)) {
      return { ok: false, reason: "exercise_context operands must be integers 0-9999" };
    }
    if (ec.operation === "subtraction" && ec.number_b > ec.number_a) {
      return { ok: false, reason: "exercise_context: subtrahend larger than minuend" };
    }
    const activeColumn = ec.active_column;
    if (typeof activeColumn !== "string" || !SOCRATIC_COLUMNS.includes(activeColumn as SocraticColumn)) {
      return { ok: false, reason: "exercise_context.active_column invalid" };
    }
    exercise_context = {
      operation: ec.operation,
      number_a: ec.number_a,
      number_b: ec.number_b,
      session_id: typeof ec.session_id === "string" ? ec.session_id.slice(0, 64) : String(raw.session_id),
      session_topic: typeof ec.session_topic === "string" ? ec.session_topic.slice(0, 120) : "",
      active_column: activeColumn as SocraticColumn,
      active_column_index: isInt(ec.active_column_index, 0, 3) ? ec.active_column_index : raw.active_column_index,
      target_sub_problem: typeof ec.target_sub_problem === "string" ? ec.target_sub_problem.slice(0, 40) : "",
    };
    if (ec.hidden_places !== undefined && ec.hidden_places !== null) {
      const hp = ec.hidden_places;
      const cols = (v: unknown): SocraticColumn[] | null =>
        Array.isArray(v) && v.every((c) => typeof c === "string" && SOCRATIC_COLUMNS.includes(c as SocraticColumn)) ? (v as SocraticColumn[]) : null;
      const ha = isPlainObject(hp) ? cols(hp.a ?? []) : null;
      const hb = isPlainObject(hp) ? cols(hp.b ?? []) : null;
      if (!ha || !hb) return { ok: false, reason: "exercise_context.hidden_places invalid" };
      if (ha.length || hb.length) exercise_context.hidden_places = { a: ha, b: hb };
    }
  }

  let task_context: SocraticTaskContext | undefined;
  if (raw.task_context !== undefined && raw.task_context !== null) {
    const tc = raw.task_context;
    if (!isPlainObject(tc)) return { ok: false, reason: "task_context must be an object" };
    if (typeof tc.kind !== "string" || !SOCRATIC_TASK_KINDS.includes(tc.kind as SocraticTaskKind)) {
      return { ok: false, reason: "task_context.kind invalid" };
    }
    const instruction = cleanInstruction(tc.instruction_he);
    if (instruction === null) return { ok: false, reason: "task_context.instruction_he must be Hebrew exercise text up to 400 characters" };
    const counts = (v: unknown): SocraticCounts | null | undefined => {
      if (v === undefined || v === null) return undefined;
      if (!isPlainObject(v)) return null;
      const out: SocraticCounts = {};
      for (const [k, n] of Object.entries(v)) {
        if (!SOCRATIC_COLUMNS.includes(k as SocraticColumn) || !isInt(n, 0, MAX_BLOCKS_PER_COLUMN)) return null;
        if (n > 0) out[k as SocraticColumn] = n;
      }
      return out;
    };
    const required = counts(tc.required_counts);
    const start = counts(tc.start_counts);
    if (required === null || start === null) return { ok: false, reason: "task_context counts must be column → integer 0-50" };
    let secrets: number[] | undefined;
    if (tc.secret_numbers !== undefined && tc.secret_numbers !== null) {
      if (!Array.isArray(tc.secret_numbers) || tc.secret_numbers.length > 4 || !tc.secret_numbers.every((n) => isInt(n, 0, 99999))) {
        return { ok: false, reason: "task_context.secret_numbers must be up to 4 integers 0-99999" };
      }
      secrets = tc.secret_numbers as number[];
    }
    const hiddenResult = Array.isArray(tc.hidden_result_places)
      ? tc.hidden_result_places.filter((c): c is SocraticColumn => typeof c === "string" && SOCRATIC_COLUMNS.includes(c as SocraticColumn))
      : [];
    task_context = {
      ...(hiddenResult.length ? { hidden_result_places: hiddenResult } : {}),
      kind: tc.kind as SocraticTaskKind,
      instruction_he: instruction,
      ...(required ? { required_counts: required } : {}),
      ...(start ? { start_counts: start } : {}),
      ...(typeof tc.conversion_done === "boolean" ? { conversion_done: tc.conversion_done } : {}),
      ...(secrets && secrets.length ? { secret_numbers: secrets } : {}),
    };
  }

  let card_frame: SocraticCardFrame | undefined;
  if (raw.card_frame !== undefined && raw.card_frame !== null) {
    const cf = raw.card_frame;
    if (!isPlainObject(cf) || typeof cf.situation !== "string" || !/^[a-z0-9_]{1,40}$/.test(cf.situation) || (cf.level !== 1 && cf.level !== 2 && cf.level !== 3)) {
      return { ok: false, reason: "card_frame invalid" };
    }
    const intent = cf.intent_he === undefined || cf.intent_he === null ? undefined : cleanInstruction(cf.intent_he);
    if (intent === null || (intent !== undefined && intent.length > 200)) return { ok: false, reason: "card_frame.intent_he invalid" };
    card_frame = { situation: cf.situation, level: cf.level, ...(intent ? { intent_he: intent } : {}) };
  }

  let student_progress_state: SocraticProgressState | undefined;
  if (raw.student_progress_state !== undefined && raw.student_progress_state !== null) {
    const ps = raw.student_progress_state;
    if (!isPlainObject(ps)) return { ok: false, reason: "student_progress_state must be an object" };
    const trigger = ps.trigger_reason;
    if (typeof trigger !== "string" || !SOCRATIC_TRIGGER_REASONS.includes(trigger as SocraticTriggerReason)) {
      return { ok: false, reason: "student_progress_state.trigger_reason invalid" };
    }
    const completed = Array.isArray(ps.completed_columns)
      ? ps.completed_columns.filter((c): c is string => typeof c === "string" && SOCRATIC_COLUMNS.includes(c as SocraticColumn))
      : [];
    const input = ps.current_column_input;
    student_progress_state = {
      completed_columns: completed,
      current_column_input: typeof input === "string" && /^\d{0,4}$/.test(input) ? input : null,
      memory_circles_state: cleanMemoryCircles(ps.memory_circles_state),
      trigger_reason: trigger as SocraticTriggerReason,
      consecutive_errors_count: isInt(ps.consecutive_errors_count, 0, 99) ? ps.consecutive_errors_count : 0,
      recent_actions: cleanRecentActions(ps.recent_actions),
      ...(isInt(ps.hesitation_seconds, 0, 3600) ? { hesitation_seconds: ps.hesitation_seconds } : {}),
      ...(Array.isArray(ps.earlier_card_kinds)
        ? { earlier_card_kinds: ps.earlier_card_kinds.filter((k): k is string => typeof k === "string" && /^[a-z_]{1,24}$/.test(k)).slice(0, 8) }
        : {}),
    };
  }

  return {
    ok: true,
    value: {
      student_id: raw.student_id,
      session_id: raw.session_id,
      exercise_id: raw.exercise_id,
      active_column_index: raw.active_column_index,
      exercise_context,
      ...(task_context ? { task_context } : {}),
      ...(card_frame ? { card_frame } : {}),
      workspace_state: {
        ...counts,
        memory_circles: cleanMemoryCircles(ws.memory_circles),
        is_regrouped_in_canvas: typeof ws.is_regrouped_in_canvas === "boolean" ? ws.is_regrouped_in_canvas : undefined,
        ...(Array.isArray(ws.conversions_done)
          ? { conversions_done: ws.conversions_done.filter((c): c is SocraticColumn => typeof c === "string" && SOCRATIC_COLUMNS.includes(c as SocraticColumn)) }
          : {}),
      },
      student_progress_state,
      recent_actions: cleanRecentActions(raw.recent_actions),
    },
  };
}

export function validateSocraticAnchor(raw: unknown): SocraticAnchor | undefined {
  if (!isPlainObject(raw) || typeof raw.questionHe !== "string" || !Array.isArray(raw.choices)) return undefined;
  const choices = raw.choices
    .filter((c): c is Record<string, unknown> => isPlainObject(c) && typeof c.textHe === "string")
    .slice(0, 3)
    .map((c) => ({
      id: typeof c.id === "string" ? c.id.slice(0, 16) : "opt",
      textHe: (c.textHe as string).slice(0, 200),
      isCorrect: typeof c.isCorrect === "boolean" ? c.isCorrect : undefined,
      // The feedback too: the anchor is the reference of the card's FORM ("רמז:" + a question).
      ...(typeof c.feedbackHe === "string" && c.feedbackHe.trim() ? { feedbackHe: (c.feedbackHe as string).slice(0, 200) } : {}),
    }));
  if (choices.length === 0) return undefined;
  return {
    questionHe: raw.questionHe.slice(0, 300),
    choices,
    pedagogical_intent: typeof raw.pedagogical_intent === "string" ? raw.pedagogical_intent.slice(0, 20) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Derived facts — the "monitoring" half of the triad, computed, not guessed
// ---------------------------------------------------------------------------

export interface ColumnFact {
  column: SocraticColumn;
  digit_a: number;
  digit_b: number;
  /** The digits as the screen shows them — "▢" where the exercise hides one. Only these go into the prompt. */
  shown_a: string;
  shown_b: string;
  blocks_on_board: number;
  /** From the exercise: addition reaches 10 with what came from the right; subtraction's top digit (after the borrow to its right) is smaller than the bottom. */
  needs_conversion: boolean;
  /** The client reports this column's conversion done with the blocks (or written, without blocks). */
  conversion_done: boolean;
  /** addition: the ten the column on the right sends in (0 or 1), from the exercise. */
  carry_in: number;
  /** subtraction only, while the first number stands whole on the board: blocks missing to take the bottom digit away. */
  board_deficit: number;
  /**
   * addition only: the most blocks this column can ever hold while the
   * exercise is solved correctly — its two digits and the one block a
   * grouping on its right sends in. null when unknown (subtraction, skeleton).
   */
  max_needed: number | null;
  /** More blocks than the exercise can need in this column: blocks dragged by mistake. */
  stray: boolean;
  /**
   * 10 or more blocks that the exercise really has to group into the next
   * column: never a column holding stray blocks, never where ten or more is
   * the goal (a representation, a subtraction after a borrow).
   */
  board_overcrowded: boolean;
  /** subtraction: everything is taken away, yet the column holds 10 or more — one break too many. */
  group_back: boolean;
  completed: boolean;
}

/** Board column against the board the task asks for. */
export type BoardVsTask = "match" | "more" | "less";

/** Which screen the child sees: decides which controls a card may name. */
export type SocraticScreen =
  | "vertical_blocks"
  | "vertical_no_blocks"
  | "representation_one_box"
  | "representation_boxes"
  | "missing_part"
  | "choice"
  | "flexible"
  | "unknown";

export interface TypedDigit {
  column: SocraticColumn;
  digit: number;
  /** true / false as the client judged it; null where the client does not judge (memory circles, skeleton boxes). */
  is_correct: boolean | null;
}

export interface EarlierCard {
  trigger_reason: string | null;
  error_category: string | null;
  /** The option the child chose on it: right or wrong, or null when none was chosen. */
  chose_correct: boolean | null;
}

export interface SocraticFacts {
  /** The meeting, read from session_id ("session_8_student_12" → 8), or null. */
  meeting: number | null;
  /**
   * PRD Module 14 §ב: in meetings 2 and 8 no blocks, no trash and no number
   * house are on the screen. The prompt then describes the memory circles and
   * the result row only, and a card that names an absent aid is refused
   * (Module 13 §א: no aids that do not exist in the interface).
   */
  blocks_on_screen: boolean;
  screen: SocraticScreen;
  /** Memory circles are on the screen: vertical exercises only. */
  memory_circles_on_screen: boolean;
  task_kind: SocraticTaskKind | null;
  /** The instruction the screen shows (exercise text), or null. */
  instruction_he: string | null;
  operation: SocraticOperation | null;
  number_a: number | null;
  number_b: number | null;
  /** Kept ONLY for the leak check; never written into the prompt. */
  final_answer: number | null;
  /** Operands whose digits the screen hides (skeleton) — kept ONLY for the leak check. */
  hidden_operands: number[];
  /** Numbers the child is asked to find (representation tasks) — kept ONLY for the leak check. */
  secret_numbers: number[];
  /** Result digits the screen hides, by column — kept ONLY for the leak check. */
  hidden_result_digits: { column: SocraticColumn; digit: number }[];
  active_column: SocraticColumn;
  board_value: number;
  /** Where the board stands against the exercise (arithmetic with blocks), or null. */
  board_stage: BoardStage | null;
  /** The board holds more than the whole exercise can use: addition above a + b, subtraction above a. */
  board_value_over: boolean;
  /** subtraction: the first number and one more block from the toolbox, instead of a break. */
  added_from_toolbox: boolean;
  columns: ColumnFact[];
  active: ColumnFact | null;
  /** Representation tasks: each column against the board the instruction asks for (at this stage). */
  board_vs_task: Partial<Record<SocraticColumn, BoardVsTask>> | null;
  /** Representation tasks: the board is the instruction's board before its conversion. */
  built_before_conversion: boolean;
  /** Representation tasks: the board is exactly the board the instruction asks for. */
  board_matches_task: boolean;
  trigger_reason: SocraticTriggerReason | null;
  consecutive_errors: number;
  hesitation_seconds: number | null;
  memory_circles: Record<string, number>;
  current_input: string | null;
  completed_columns: SocraticColumn[];
  recent_event_types: string[];
  /** The learner's recent actions, repeated runs collapsed: "BLOCK_DRAG_COMPLETE ×12 (טור המאות)". */
  actions_summary: string[];
  /** What the learner typed in the result row, oldest first, with the client's verdict. */
  typed_digits: TypedDigit[];
  /** addition: memory circles that hold more than the one ten a column can pass on (13 above the tens). */
  wrong_carry_circles: SocraticColumn[];
  /** What the wrong digits say (no digit given): the carry forgotten, a subtraction reversed. */
  typing_pattern: "carry_forgotten" | "reversed_subtraction" | "tens_digit_typed" | null;
  /** Cards already opened in this exercise, oldest first. */
  earlier_cards: EarlierCard[];
  /** The kinds of the owner's static cards already shown in this exercise (STATIC_CARD_KINDS). */
  earlier_card_kinds: string[];
  /** The card frame the client's static selection set, or null (an older client). */
  card_frame: SocraticCardFrame | null;
  /** Deterministic reading of the situation, offered to the model as the primary hypothesis. */
  suggested_category: SocraticErrorCategory;
  suggested_focus_he: string;
}

function digitAt(n: number, column: SocraticColumn): number {
  const div = { units: 1, tens: 10, hundreds: 100, thousands: 1000 }[column];
  return Math.floor(Math.abs(n) / div) % 10;
}

const NEXT_COLUMN: Record<SocraticColumn, SocraticColumn | null> = { units: "tens", tens: "hundreds", hundreds: "thousands", thousands: null };

function screenFor(ec: SocraticExerciseContext | undefined, tc: SocraticTaskContext | undefined, blocksOnScreen: boolean): SocraticScreen {
  if (ec) return blocksOnScreen ? "vertical_blocks" : "vertical_no_blocks";
  switch (tc?.kind) {
    case "read_write":
    case "compose_break":
    case "decompose":
    case "compose_group":
      return "representation_one_box";
    case "representation":
      return "representation_boxes";
    case "missing_element":
      return "missing_part";
    case "small_change":
      return "choice";
    case "flexible":
      return "flexible";
    default:
      return blocksOnScreen ? "unknown" : "vertical_no_blocks";
  }
}

/** Repeated identical actions collapsed: 12 drags of a hundred become one line with ×12. */
function summarizeActions(actions: SocraticRecentAction[]): string[] {
  const label = (a: SocraticRecentAction) => {
    const col = typeof a.column_index === "number" ? ` (${COLUMN_NAME_HE[SOCRATIC_COLUMNS[a.column_index]]})` : "";
    const d = a.details ?? {};
    if (a.event_type === "DIGIT_ENTERED" && typeof d.digit_value === "number") {
      const verdict = d.is_correct === true ? ", נכון" : d.is_correct === false ? ", שגוי" : "";
      return `הקליד ${d.digit_value}${col}${verdict}`;
    }
    if (a.event_type === "DIGIT_DELETED") return `מחק ספרה${col}`;
    if (a.event_type === "REGROUPING_SUCCESS") return `${d.regrouping_type === "decomposition" ? "פרט" : "קיבץ"}${col}`;
    if (a.event_type === "REGROUPING_TRIGGERED") return "";
    if (a.event_type === "UNDO_EXECUTED") return "ביטל פעולה";
    if (a.event_type === "HESITATION_DETECTED") return "השתהה";
    if (a.event_type === "KEYBOARD_LOCK_BLOCKED") return `ניסה להקליד לפני ההמרה${col}`;
    if (a.event_type === "BLOCK_DRAG_COMPLETE") return `גרר לבנה${col}`;
    if (a.event_type === "PROBLEM_LOAD") return "פתח את התרגיל";
    if (a.event_type === "SOCRATIC_CARD_SHOWN") return "נפתח כרטיס חניכה";
    if (a.event_type === "SOCRATIC_OPTION_SELECTED") return `בחר אפשרות בכרטיס (${d.is_correct === true ? "נכונה" : "שגויה"})`;
    if (a.event_type === "BOARD_CLEARED") return "ניקה את בית המספרים";
    if (a.event_type === "CHAT_HELP_REQUESTED") return "ביקש עזרה בצ'אט";
    if (a.event_type === "HELP_REQUESTED") return "קרא למורה";
    return a.event_type;
  };
  const out: { text: string; n: number }[] = [];
  for (const a of actions) {
    const text = label(a);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.text === text) last.n++;
    else out.push({ text, n: 1 });
  }
  return out.map((x) => (x.n > 1 ? `${x.text} ×${x.n}` : x.text));
}

function typedDigitsOf(actions: SocraticRecentAction[]): TypedDigit[] {
  const out: TypedDigit[] = [];
  for (const a of actions) {
    if (a.event_type !== "DIGIT_ENTERED" || typeof a.column_index !== "number") continue;
    const d = a.details ?? {};
    if (typeof d.digit_value !== "number") continue;
    out.push({
      column: SOCRATIC_COLUMNS[a.column_index],
      digit: d.digit_value,
      is_correct: d.is_correct === true ? true : d.is_correct === false ? false : null,
    });
  }
  return out.slice(-8);
}

function earlierCardsOf(actions: SocraticRecentAction[]): EarlierCard[] {
  const out: EarlierCard[] = [];
  for (const a of actions) {
    const d = a.details ?? {};
    if (a.event_type === "SOCRATIC_CARD_SHOWN") {
      out.push({
        trigger_reason: typeof d.trigger_reason === "string" ? d.trigger_reason : null,
        error_category: typeof d.error_category === "string" ? d.error_category : null,
        chose_correct: null,
      });
    } else if (a.event_type === "SOCRATIC_OPTION_SELECTED" && out.length > 0) {
      out[out.length - 1].chose_correct = d.is_correct === true;
    }
  }
  return out.slice(-3);
}

const sameCounts = (a: SocraticCounts, b: Record<SocraticColumn, number>) =>
  SOCRATIC_COLUMNS.every((c) => (a[c] ?? 0) === (b[c] ?? 0));

/** Where the board stands against the exercise (arithmetic with blocks only). */
export type BoardStage =
  | "empty"
  | "partial"
  | "one_number"
  | "both_numbers"
  | "minuend"
  | "taking_away"
  | "result"
  | "below_result"
  | "beyond";

function boardStageOf(ec: SocraticExerciseContext, v: number): BoardStage {
  const a = ec.number_a;
  const b = ec.number_b;
  if (v === 0) return "empty";
  if (ec.operation === "addition") {
    if (v === a + b) return "both_numbers";
    if (v > a + b) return "beyond";
    if (v === a || v === b) return "one_number";
    return "partial";
  }
  if (v === a) return "minuend";
  if (v > a) return "beyond";
  if (v === a - b) return "result";
  if (v > a - b) return "taking_away";
  return "below_result";
}

const STAGE_HE: Record<BoardStage, string> = {
  empty: "בית המספרים ריק",
  partial: "רק חלק מהלבנים בנוי",
  one_number: "רק אחד משני המספרים בנוי",
  both_numbers: "שני המספרים בנויים (ערך בית המספרים שווה לסכום)",
  minuend: "המספר הראשון בנוי בשלמותו, ועוד לא הוציאו ממנו",
  taking_away: "הלומד באמצע ההוצאה לפח: חלק ממה שמחסרים כבר יצא",
  result: "כל מה שמחסרים כבר יצא: בבית המספרים נשארה התוצאה",
  below_result: "בבית המספרים פחות מהתוצאה: יצא יותר ממה שמחסרים, או שהמספר הראשון עוד לא נבנה עד הסוף",
  beyond: "בבית המספרים יותר ממה שהתרגיל יכול לצרוך",
};
export function boardStageHe(stage: BoardStage): string {
  return STAGE_HE[stage];
}

export function deriveSocraticFacts(req: SocraticRequest): SocraticFacts {
  const ec = req.exercise_context;
  const tc = req.task_context;
  const ws = req.workspace_state;
  const ps = req.student_progress_state;
  const blocks: Record<SocraticColumn, number> = {
    units: ws.ones_count,
    tens: ws.tens_count,
    hundreds: ws.hundreds_count,
    thousands: ws.thousands_count,
  };
  const completed = (ps?.completed_columns ?? []) as SocraticColumn[];
  const memory = { ...(ws.memory_circles ?? {}), ...(ps?.memory_circles_state ?? {}) };
  const meetingMatch = /^session_(\d+)_/.exec(req.session_id);
  const meeting = meetingMatch ? Number(meetingMatch[1]) : null;
  const blocks_on_screen = meeting !== 2 && meeting !== 8;
  const skeleton = Boolean(ec?.hidden_places);
  const board_value = blocks.units + blocks.tens * 10 + blocks.hundreds * 100 + blocks.thousands * 1000;
  const conversionsDone = new Set<SocraticColumn>(ws.conversions_done ?? []);

  // Which columns convert, and what each one receives from its right — from
  // the EXERCISE, never from a typed memory circle (a child's wrong circle
  // misread 85 + 17 and the chained borrow of 512 − 13; mirrors the client's
  // columnRequiresConversion).
  const needsConv: Record<SocraticColumn, boolean> = { units: false, tens: false, hundreds: false, thousands: false };
  const carryIn: Record<SocraticColumn, number> = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
  if (ec) {
    let carry = 0;
    for (const c of SOCRATIC_COLUMNS) {
      carryIn[c] = carry;
      const da = digitAt(ec.number_a, c);
      const db = digitAt(ec.number_b, c);
      const needs = ec.operation === "subtraction" ? da - carry < db : da + db + carry >= 10;
      needsConv[c] = needs;
      carry = needs ? 1 : 0;
    }
  }
  const stage: BoardStage | null = ec && blocks_on_screen && !skeleton ? boardStageOf(ec, board_value) : null;

  // The board against what the exercise needs (audit of 1.10.2026: 12
  // hundreds where 456 + 281 needs 7 were read as "group them into a
  // thousand"). An addition column can hold at most its two digits and the
  // one block a grouping on its right sends in; the whole board at most a + b.
  // A subtraction board at most the first number. A skeleton is built in
  // different ways (the result, or the known number), so it is not judged.
  const judgeAddition = Boolean(ec && ec.operation === "addition" && stage !== null);
  const board_value_over = stage === "beyond";
  // A block dragged in from the toolbox instead of breaking one: the first
  // number and exactly one more block of some column (53 − 18 built as 63).
  const added_from_toolbox = Boolean(ec && ec.operation === "subtraction" && stage === "beyond" &&
    [10, 100, 1000].includes(board_value - ec.number_a));

  // Without exercise_context the exercise is a representation, a "different
  // ways" task or a missing part (client NON_ARITHMETIC_TYPES), and ten or more
  // blocks in a column can be exactly what it asks for: 45 hundreds in s3_g_t3,
  // 14 tens after a break. The client's static cards never call that a column
  // to group (SocraticEngine.analyzeLiveBoardState, crowdingIsTheGoal; owner,
  // 28.9.2026). A subtraction after a borrow is the same case (61 − 24 as 5
  // tens and 11 units): "group them back" would undo the step — except once
  // everything is taken away, when a column of 10 or more is a break too many.
  const crowdingMayBeTheGoal = !ec || ec.operation === "subtraction";

  const columns: ColumnFact[] = SOCRATIC_COLUMNS.map((column) => {
    const digit_a = ec ? digitAt(ec.number_a, column) : 0;
    const digit_b = ec ? digitAt(ec.number_b, column) : 0;
    // A deficit is real only for the column whose turn it is: while the first
    // number stands whole on the board, or — taking away under way — once every
    // column to its right already shows its result digit (425 − 162 with 4
    // hundreds, 2 tens and 3 units: the units are done, the tens lack). After
    // a column is taken, "5 units and 8 to take" pushed a second borrow (53 − 18).
    const lowerDone = ec && ec.operation === "subtraction"
      ? SOCRATIC_COLUMNS.slice(0, SOCRATIC_COLUMNS.indexOf(column)).every((c) => blocks[c] === digitAt(ec.number_a - ec.number_b, c))
      : false;
    const ownDone = ec && ec.operation === "subtraction" ? blocks[column] === digitAt(ec.number_a - ec.number_b, column) : false;
    const columnsTurn = stage === "minuend" || (stage === "taking_away" && lowerDone && !ownDone);
    const board_deficit = ec && ec.operation === "subtraction" && columnsTurn && needsConv[column] && !conversionsDone.has(column)
      ? Math.max(0, digit_b - blocks[column])
      : 0;
    const max_needed = judgeAddition ? digit_a + digit_b + carryIn[column] : null;
    const stray = max_needed !== null && blocks[column] > max_needed;
    return {
      column,
      digit_a,
      digit_b,
      shown_a: ec?.hidden_places?.a.includes(column) ? "▢" : String(digit_a),
      shown_b: ec?.hidden_places?.b.includes(column) ? "▢" : String(digit_b),
      blocks_on_board: blocks[column],
      needs_conversion: needsConv[column],
      conversion_done: conversionsDone.has(column),
      carry_in: carryIn[column],
      board_deficit,
      max_needed,
      stray,
      board_overcrowded: blocks_on_screen && !crowdingMayBeTheGoal && !stray && !board_value_over && blocks[column] >= 10,
      group_back: blocks_on_screen && Boolean(ec && ec.operation === "subtraction") && stage === "result" && blocks[column] >= 10,
      completed: completed.includes(column),
    };
  });

  // The column the card is about. The client sends the focused box, the
  // streak's column or the units. When the child idles and that column is
  // already solved, the card is about the first column still open: with the
  // first number built whole in a subtraction, the first column short of
  // blocks; otherwise the first unsolved column from the units.
  const trigger = ps?.trigger_reason ?? null;
  let active_column: SocraticColumn = ec?.active_column ?? SOCRATIC_COLUMNS[req.active_column_index] ?? "units";
  if (ec && trigger !== "consecutive_errors_4" && trigger !== "conversion_not_performed") {
    const places = SOCRATIC_COLUMNS.slice(0, Math.max(1, String(ec.operation === "subtraction" ? ec.number_a : ec.number_a + ec.number_b).length));
    const shortCol = stage === "minuend" || stage === "taking_away" ? columns.find((c) => c.board_deficit > 0) : undefined;
    if (shortCol) active_column = shortCol.column;
    else if (completed.includes(active_column)) active_column = places.find((c) => !completed.includes(c)) ?? active_column;
  }

  // A representation task: the board against the board the instruction asks
  // for, at this stage — before its break / grouping, the board it builds
  // first; after it, the final one.
  let board_vs_task: SocraticFacts["board_vs_task"] = null;
  let built_before_conversion = false;
  let board_matches_task = false;
  if (!ec && tc?.required_counts && blocks_on_screen) {
    built_before_conversion = Boolean(tc.start_counts && sameCounts(tc.start_counts, blocks) && !sameCounts(tc.required_counts, blocks));
    board_matches_task = sameCounts(tc.required_counts, blocks);
    const target = tc.conversion_done === false && tc.start_counts ? tc.start_counts : tc.required_counts;
    board_vs_task = {};
    for (const c of SOCRATIC_COLUMNS) {
      const want = target[c] ?? 0;
      const have = blocks[c];
      if (want === 0 && have === 0) continue;
      board_vs_task[c] = have === want ? "match" : have > want ? "more" : "less";
    }
  }

  const active = columns.find((c) => c.column === active_column) ?? null;
  // The client sends the same list in both places; joining them showed every
  // action twice (undos looked doubled). One list: the top-level one, else the
  // progress-state copy.
  const actions = (req.recent_actions.length > 0 ? req.recent_actions : ps?.recent_actions ?? []).slice(-MAX_RECENT_ACTIONS);
  const recent_event_types = actions.map((a) => a.event_type);
  const typed_digits = typedDigitsOf(actions);

  // In addition a memory circle holds the one ten the column on its right
  // passes on: a "13" above the tens is a wrong record, never a carry to add.
  const wrong_carry_circles = ec && ec.operation === "addition"
    ? SOCRATIC_COLUMNS.filter((c) => (memory[c] ?? 0) > 1)
    : [];

  // What the child's wrong digits say, without the right one: a column that
  // receives a carry typed as if it did not (forgot the ten in the memory
  // circle), or a subtraction column typed bottom-minus-top.
  let typing_pattern: SocraticFacts["typing_pattern"] = null;
  if (ec && active) {
    const wrongHere = typed_digits.filter((t) => t.column === active.column && t.is_correct === false).map((t) => t.digit);
    if (wrongHere.length) {
      const last = wrongHere[wrongHere.length - 1];
      if (ec.operation === "addition" && active.carry_in === 1 && last === (active.digit_a + active.digit_b) % 10) typing_pattern = "carry_forgotten";
      else if (ec.operation === "subtraction" && active.digit_a < active.digit_b && last === active.digit_b - active.digit_a) typing_pattern = "reversed_subtraction";
      else if (ec.operation === "addition" && active.digit_a + active.digit_b + active.carry_in >= 10 && last >= 0 && wrongHere.some((d) => d === 1)) typing_pattern = "tens_digit_typed";
    }
  }

  // Deterministic first reading of the difficulty, in PRD Module 13's three
  // categories. The trigger and the typing come first, as the system
  // instruction defines them ("typing before converting" is procedural, a
  // wrong fact in a column that needs no conversion is calculation); the
  // board's crowding is read after them (audit of 1.10.2026, root cause 8).
  // A focus never gives a count that the card may not give: in meeting 1 it
  // names no column and no count; in stations 3–7 no count.
  let suggested_category: SocraticErrorCategory = "procedural";
  let suggested_focus_he = "";
  const meeting1 = meeting === 1;
  const noCounts = meeting1 || (meeting !== null && meeting >= 3 && meeting <= 7);
  const inCol = (c: SocraticColumn) => (meeting1 ? "באחד הטורים" : `ב${COLUMN_NAME_HE[c]}`);
  const overcrowded = columns.find((c) => c.board_overcrowded);
  const strayCols = columns.filter((c) => c.stray);
  const groupBack = columns.find((c) => c.group_back);
  // A skeleton shows its result, so whether a hidden column converts is known on the screen too:
  // read from the full exercise (3▢6 + 271 = 657 converts in the tens).
  const activeNeedsConversion = Boolean(active && active.needs_conversion);
  // The conversion of the active column is done (blocks) or written (no blocks):
  //  - subtraction: the active column's own circle holds the new top number (12 above the units);
  //  - addition: the circle above the NEXT column holds the converted ten.
  const nextCol = active ? NEXT_COLUMN[active.column] : null;
  const conversionWritten = Boolean(ec && active && (active.conversion_done || (ec.operation === "subtraction"
    ? memory[active.column] !== undefined && memory[active.column] >= active.digit_b
    : nextCol !== null && (memory[nextCol] ?? 0) > 0)));
  const sub = ec?.operation === "subtraction" ? "−" : "+";
  const subProblemHe = active ? `${active.shown_a} ${sub} ${active.shown_b}` : "";
  const carryHe = ec && ec.operation === "addition" && active && active.carry_in > 0 ? " ועוד העשרת שעברה מהטור שמימין (רשומה בעיגול הזיכרון)" : "";
  const solvedHe = completed.length ? ` (${completed.map((c) => COLUMN_NAME_HE[c]).join(", ")} כבר נפתר)` : "";

  if (wrong_carry_circles.length && ec) {
    suggested_category = "conceptual";
    suggested_focus_he = `בעיגול הזיכרון שמעל ${COLUMN_NAME_HE[wrong_carry_circles[0]]} רשום מספר גדול מ-1. בחיבור עוברת לטור הבא עשרת אחת בלבד, ולכן זה רישום שגוי — כוון לבדוק מה רושמים בעיגול הזיכרון, בלי לומר את הספרה.`;
  } else if (trigger === "conversion_not_performed") {
    suggested_category = "procedural";
    suggested_focus_he = blocks_on_screen
      ? "הלומד ניסה להקליד תוצאה בטור שדורש הקבצה או פריטה לפני שביצע את ההמרה בלבנים."
      : "הלומד ניסה להקליד תוצאה בטור שדורש המרה או פריטה לפני שרשם אותה בעיגול הזיכרון.";
  } else if (typing_pattern === "carry_forgotten" && active) {
    suggested_category = "procedural";
    suggested_focus_he = `${inCol(active.column)} הספרה שהלומד הקליד מתאימה לחיבור בלי העשרת שעברה מהטור שמימין: הוא שכח את מה שרשום בעיגול הזיכרון.`;
  } else if (typing_pattern === "reversed_subtraction" && active) {
    suggested_category = "procedural";
    suggested_focus_he = `${inCol(active.column)} הספרה שהלומד הקליד היא חיסור הפוך — הספרה העליונה מהתחתונה — במקום פריטה.`;
  } else if (trigger === "consecutive_errors_4" && active && ec && (!activeNeedsConversion || conversionWritten)) {
    suggested_category = "calculation";
    suggested_focus_he = activeNeedsConversion
      ? `${inCol(active.column)} ההמרה כבר ${blocks_on_screen ? "בוצעה" : "רשומה בעיגול הזיכרון"}, והלומד טעה בהקלדה ארבע פעמים — הטעות בחישוב הטור עצמו${meeting1 ? "" : ` (${subProblemHe}${ec.operation === "subtraction" ? " אחרי הפריטה" : ""})`}.`
      : `${meeting1 ? "הטור" : `הטור הפעיל (${COLUMN_NAME_HE[active.column]}, ${subProblemHe}${carryHe})`} אינו דורש המרה, והלומד טעה בהקלדה ארבע פעמים — כנראה טעות בעובדת החשבון של הטור.`;
  } else if (trigger === "consecutive_undos_3" && !blocks_on_screen && ec && active) {
    suggested_category = "conceptual";
    suggested_focus_he = `הלומד ביטל שלוש פעולות ברצף ב${COLUMN_NAME_HE[active.column]} (תת-תרגיל ${subProblemHe}${carryHe})${solvedHe} — סימן לניחוש או לחוסר ביטחון. כוון לפתור את הטור הזה בעצמם, בלי לנחש, ובלי לומר את הספרה.`;
  } else if (!blocks_on_screen && ec && active && activeNeedsConversion && !active.completed) {
    suggested_category = "procedural";
    suggested_focus_he = conversionWritten
      ? ec.operation === "subtraction"
        ? `ב${COLUMN_NAME_HE[active.column]} הפריטה כבר רשומה בעיגול הזיכרון. הצעד הבא: לחסר ${active.shown_b} מהמספר שבעיגול הזיכרון ולכתוב את התוצאה בתיבה של הטור — אל תשאל שוב על הפריטה.`
        : `ב${COLUMN_NAME_HE[active.column]} ההמרה כבר רשומה בעיגול הזיכרון שמעל הטור הבא. הצעד הבא: לכתוב בתיבה של הטור רק את ספרת היחידות של הסכום — אל תשאל שוב על ההמרה.`
      : ec.operation === "subtraction"
        ? `ב${COLUMN_NAME_HE[active.column]} צריך לחסר ${active.shown_b} מ-${active.shown_a} — נדרשת פריטה מהטור השכן, ורישום השינוי בעיגול הזיכרון.`
        : `ב${COLUMN_NAME_HE[active.column]} החיבור ${subProblemHe}${carryHe} עובר את 9 — נדרשת המרה, ורישום שלה בעיגול הזיכרון שמעל הטור הבא.`;
  } else if (!blocks_on_screen && ec && active && !active.completed) {
    suggested_category = trigger === "repeated_errors" ? "calculation" : "procedural";
    suggested_focus_he = `ב${COLUMN_NAME_HE[active.column]} התרגיל הוא ${subProblemHe}${carryHe}${solvedHe}. כוון לחישוב בטור הזה, בלי לומר את הספרה.`;
  } else if (ec && skeleton && blocks_on_screen && board_value === 0) {
    suggested_category = "procedural";
    suggested_focus_he = ec.operation === "subtraction" && ec.hidden_places?.a.length
      ? "בתרגיל מוסתרות ספרות של המספר הראשון, ואי אפשר לבנות אותו. מגלים אותן מהסוף להתחלה: מה היה בטור אם אחרי שהוציאו ממנו את הספרה התחתונה נשארה ספרת התוצאה? טור אחר טור, מטור היחידות, וזוכרים פריטה."
      : "בתרגיל מוסתרות ספרות, ואי אפשר לבנות את המספר המוסתר. בונים את המספר הידוע, ומגלים טור אחר טור, מטור היחידות, כמה לבנים חסרות בטור כדי להגיע לספרת התוצאה — וזוכרים המרה כשעוברים את 10.";
  } else if (ec && stage === "empty") {
    suggested_category = "procedural";
    suggested_focus_he = ec.operation === "subtraction"
      ? `בית המספרים ריק. הצעד הראשון בחיסור הוא לבנות רק את המספר הראשון (${maskedNumberHe(ec.number_a, ec.hidden_places?.a)}) בלבנים.`
      : `בית המספרים ריק. הצעד הראשון הוא לבנות את שני המספרים (${maskedNumberHe(ec.number_a, ec.hidden_places?.a)} ו-${maskedNumberHe(ec.number_b, ec.hidden_places?.b)}) בלבנים.`;
  } else if (ec && added_from_toolbox) {
    suggested_category = "conceptual";
    suggested_focus_he = "בבית המספרים יש המספר הראשון ועוד לבנה אחת שנגררה מארגז הכלים — במקום לפרוט לבנה מהטור השכן. כוון לשאלה מאיפה הגיעה הלבנה החדשה, ומה עושים כשבטור אין מספיק לבנים.";
  } else if (ec && (strayCols.length > 0 || board_value_over)) {
    suggested_category = "procedural";
    const where = strayCols.length && !meeting1 ? ` (${strayCols.map((c) => COLUMN_NAME_HE[c.column]).join(", ")})` : "";
    suggested_focus_he = ec.operation === "subtraction"
      ? `בבית המספרים יש יותר לבנים מהמספר הראשון. בחיסור בונים רק את המספר הראשון (${maskedNumberHe(ec.number_a, ec.hidden_places?.a)}) ואחר כך מוציאים ממנו — לא מקבצים ולא בונים את המספר השני.`
      : `בבית המספרים יש יותר לבנים ממה שהתרגיל צריך${where} — כנראה נגררו לבנים בטעות. הצעד הנכון: לבדוק כמה לבנים צריך בכל טור לפי שני המספרים ולהוציא לפח האשפה את המיותרות. אסור להציע לקבץ את הלבנים המיותרות.`;
  } else if (ec && stage === "one_number") {
    suggested_category = "procedural";
    suggested_focus_he = "בבית המספרים בנוי רק אחד משני המספרים. כוון לבדוק איזה מספר עוד לא בבית המספרים.";
  } else if (groupBack) {
    suggested_category = "procedural";
    suggested_focus_he = `כל מה שמחסרים כבר יצא, אבל ${inCol(groupBack.column)} יש 10 לבנים או יותר: נפרטה לבנה אחת יותר מהדרוש. כוון לקבץ אותן בחזרה בכפתור "קבצו 10" לפני שכותבים את התוצאה.`;
  } else if (board_vs_task && Object.values(board_vs_task).some((v) => v !== "match")) {
    suggested_category = "procedural";
    const more = SOCRATIC_COLUMNS.filter((c) => board_vs_task![c] === "more").map((c) => COLUMN_NAME_HE[c]);
    const less = SOCRATIC_COLUMNS.filter((c) => board_vs_task![c] === "less").map((c) => COLUMN_NAME_HE[c]);
    suggested_focus_he = built_before_conversion
      ? "הלבנים בנויות כמו שההנחיה מבקשת בהתחלה, וההמרה שההנחיה מבקשת (פריטה או הקבצה) עוד לא נעשתה."
      : `בית המספרים עוד לא מראה את מה שההנחיה מבקשת${meeting1 ? "" : `${more.length ? `: ב${more.join(" וב")} יש יותר לבנים ממה שצריך` : ""}${less.length ? `${more.length ? "," : ":"} ב${less.join(" וב")} יש פחות לבנים ממה שצריך` : ""}`}. כוון לקרוא שוב את ההנחיה ולבדוק מה עוד לא נעשה — לא לספור ולכתוב את מה שבנוי עכשיו.`;
  } else if (board_matches_task && trigger === "repeated_errors") {
    suggested_category = "conceptual";
    suggested_focus_he = "בית המספרים מראה בדיוק את מה שההנחיה מבקשת, אבל התשובה שנכתבה שגויה — כוון לקרוא את המספר מהלבנים: כמה שווה כל טור.";
  } else if (overcrowded) {
    suggested_category = "conceptual";
    suggested_focus_he = noCounts
      ? `${inCol(overcrowded.column)} יש 10 לבנים או יותר, וכולן חלק מהתרגיל, ולכן נדרשת הקבצה של 10 ללבנה אחת בטור הבא (הכפתור "קבצו 10" בראש הטור).`
      : `ב${COLUMN_NAME_HE[overcrowded.column]} יש ${overcrowded.blocks_on_board} ${BLOCK_NOUN_HE[overcrowded.column]} — יותר מ-9, וכולן חלק מהתרגיל, ולכן נדרשת הקבצה של 10 ללבנה אחת בטור הבא (הכפתור "קבצו 10" בראש הטור).`;
  } else if (ec && active && ec.operation === "subtraction" && activeNeedsConversion && active.board_deficit > 0) {
    suggested_category = "procedural";
    suggested_focus_he = noCounts
      ? `${inCol(active.column)} אין מספיק לבנים כדי לחסר ${meeting1 ? "" : active.shown_b + " "}— נדרשת פריטה של לבנה מהטור השכן הגדול יותר.`
      : `ב${COLUMN_NAME_HE[active.column]} צריך לחסר ${active.shown_b} אבל בבית המספרים יש רק ${countHe(active.blocks_on_board, active.column)} — נדרשת פריטה מהטור השכן הגדול יותר.`;
  } else if (ec && ec.operation === "subtraction" && (stage === "taking_away" || stage === "minuend")) {
    suggested_category = trigger === "repeated_errors" || trigger === "consecutive_errors_4" ? "calculation" : "procedural";
    suggested_focus_he = stage === "minuend"
      ? "המספר הראשון בנוי, ובכל טור יש מספיק לבנים. הצעד הבא: להוציא לפח האשפה את מה שמחסרים, טור אחר טור."
      : "הלומד באמצע ההוצאה לפח. הצעד הבא: לבדוק בכל טור כמה כבר יצא וכמה עוד צריך להוציא — לא לפרוט שוב ולא לקבץ בחזרה.";
  } else if (ec && ec.operation === "subtraction" && stage === "result") {
    suggested_category = trigger === "repeated_errors" ? "calculation" : "procedural";
    suggested_focus_he = "כל מה שמחסרים כבר יצא. הצעד הבא: לכתוב בכל תיבה בשורת התוצאה כמה לבנים נשארו בטור שלה.";
  } else if (ec && ec.operation === "addition" && stage === "both_numbers" && !overcrowded) {
    suggested_category = trigger === "repeated_errors" ? "calculation" : "procedural";
    suggested_focus_he = "שני המספרים בנויים וכל ההקבצות נעשו. הצעד הבא: לכתוב בכל תיבה בשורת התוצאה כמה לבנים יש בטור שלה.";
  } else if (ec && active && ec.operation === "addition" && activeNeedsConversion && !active.completed && !active.conversion_done) {
    suggested_category = "procedural";
    suggested_focus_he = `${inCol(active.column)} החיבור${meeting1 ? "" : ` ${subProblemHe}${carryHe}`} עובר את 9 — נדרשת הקבצה של 10 לבנים ללבנה אחת בטור הבא.`;
  } else if (trigger === "repeated_errors") {
    suggested_category = "calculation";
    suggested_focus_he = "הלומד הגיש תשובה שגויה פעמיים ברצף באותו תרגיל — יש לכוון אותו לטור שבו התוצאה אינה נכונה, בלי לומר את הספרה.";
  } else if (trigger === "consecutive_undos_3") {
    suggested_category = "conceptual";
    suggested_focus_he = "הלומד ביטל שלוש פעולות ברצף — סימן לחוסר ביטחון באסטרטגיה, לא לטעות בחישוב בודד.";
  } else if (active && ec) {
    suggested_category = "procedural";
    suggested_focus_he = meeting1
      ? "הלומד השתהה ללא פעולה; יש לכוון אותו לצעד הבא בתרגיל, בלי לומר באיזה טור."
      : `הלומד השתהה ב${COLUMN_NAME_HE[active.column]} ללא פעולה; יש לכוון אותו לצעד המדויק הבא באותו טור.`;
  } else {
    suggested_category = "procedural";
    suggested_focus_he = "הלומד השתהה ללא פעולה; יש לכוון אותו לצעד הבא שההנחיה מבקשת.";
  }

  return {
    meeting,
    blocks_on_screen,
    screen: screenFor(ec, tc, blocks_on_screen),
    memory_circles_on_screen: Boolean(ec),
    task_kind: tc?.kind ?? (ec ? (skeleton ? "skeleton" : ec.operation) : null),
    instruction_he: tc?.instruction_he ?? null,
    hidden_operands: ec?.hidden_places ? [...(ec.hidden_places.a.length ? [ec.number_a] : []), ...(ec.hidden_places.b.length ? [ec.number_b] : [])] : [],
    secret_numbers: tc?.secret_numbers ?? [],
    hidden_result_digits: ec && tc?.hidden_result_places
      ? tc.hidden_result_places.map((c) => ({ column: c, digit: digitAt(ec.operation === "subtraction" ? ec.number_a - ec.number_b : ec.number_a + ec.number_b, c) }))
      : [],
    operation: ec?.operation ?? null,
    number_a: ec?.number_a ?? null,
    number_b: ec?.number_b ?? null,
    final_answer: ec ? (ec.operation === "subtraction" ? ec.number_a - ec.number_b : ec.number_a + ec.number_b) : null,
    active_column,
    board_value,
    board_stage: stage,
    board_value_over,
    added_from_toolbox,
    columns,
    active,
    board_vs_task,
    built_before_conversion,
    board_matches_task,
    trigger_reason: trigger,
    // The "four errors" streak is zeroed when its card opens (שהB.2): the trigger itself says four.
    consecutive_errors: trigger === "consecutive_errors_4" ? Math.max(4, ps?.consecutive_errors_count ?? 0) : ps?.consecutive_errors_count ?? 0,
    hesitation_seconds: ps?.hesitation_seconds ?? null,
    memory_circles: memory,
    current_input: ps?.current_column_input ?? null,
    completed_columns: completed,
    recent_event_types,
    actions_summary: summarizeActions(actions),
    typed_digits,
    wrong_carry_circles,
    typing_pattern,
    earlier_cards: earlierCardsOf(actions),
    earlier_card_kinds: ps?.earlier_card_kinds ?? [],
    card_frame: req.card_frame ?? null,
    suggested_category,
    suggested_focus_he,
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const LANGUAGE_SLOT = "{{LANGUAGE_SPEC}}";

const SOCRATIC_SYSTEM_CORE = `You are the MathmatiCore Socratic Pedagogical Engine for 3rd-grade learners (ages 8-9) working in a DIGITAL place-value workspace ("בית המספרים") with virtual Dienes blocks, memory circles ("עיגולי הזיכרון") and a recycle bin ("פח האשפה").

You operate strictly under the HOLISTIC PEDAGOGICAL TRIAD. Every guiding question, option and feedback MUST weave together all three:
1. THE EXERCISE AND THE ALGORITHM — the operation, the two numbers, the active column and its column sub-problem.
2. THE LIVE BOARD — the exact block count in each column and whether a regrouping/decomposition was already performed in blocks.
3. THE LEARNER'S MONITORED STEPS — which columns are already solved, what is typed in the inputs and memory circles, and what triggered this card (hesitation / repeated errors / repeated undos / conversion not performed).

FIT THE CARD TO THIS CHILD. The question addresses what THIS child did — the digits typed (and whether they were right), the blocks dragged, the step skipped, the earlier cards — never a generic step. When the board holds MORE blocks than the exercise needs, the next step is to check how many blocks are needed and take the extra ones out; NEVER tell the child to group blocks that are not part of the exercise. When a conversion is already done or already written, never ask about it again: ask about the next step.

DIAGNOSIS. Classify the difficulty as exactly one of:
- "calculation": structure and algorithm understood, a basic addition/subtraction fact was wrong.
- "procedural": a step skipped or done out of order — wrong starting column, memory circle not updated, subtracting bottom-from-top instead of decomposing, typing before converting, building more or less than the exercise needs.
- "conceptual": place value not understood — two digits in one cell, blocks deleted without preserving the total, 10 or more blocks left in one column.

THE SCREEN. The prompt's section "המסך" lists what is on THIS child's screen. Name only those places, controls and actions, with exactly those names. Never invent an action or a place.

THE REFERENCE CARD. The prompt includes the static card this child would otherwise see, written and approved by the product owner. It sets the card's LEVEL, TERMS and FORM: keep its level (a first-level card that asks what to check stays a question about what to check — do not name the column or give the step it leaves the child to find); use its terms and the screen's actions only; keep its form. Tailor the question to THIS exercise and THIS child's actions, and never contradict the reference card.

HEBREW. Natural, grammatically flawless Hebrew for children: short, warm, empowering sentences; exact gender/number agreement (4 מאות, 2 עשרות, 5 יחידות, 10 עשרות, עשרת אחת, מאה אחת, אלף אחד). Address the learner in the second person plural, gender-neutral, in every instruction and feedback ("בדקו", "פרטו", "לחצו"); gender-equal writing means the second person plural only, never split, dot or slash gender forms. Phrase the guiding question impersonally ("מה עושים?", "איך מגלים?") or in the second person plural. Write answer options that describe an action in the impersonal present plural ("מקבצים", "פורטים", "משתמשים"). NEVER use the first person plural ("נבדוק", "נפרוט", "מה נעשה", "בואו נ…"). An indirect question takes "אם", not "האם", and ends with a period ("בדקו אם צריך לרשום משהו בעיגול הזיכרון."); a prefix letter stays outside quotation marks (ל"שורת התוצאה", never "לשורת התוצאה" inside the quotes).
TERMINOLOGY (Ministry of Education): subtraction regrouping is "פריטה" ONLY (never שבירה / הלוואה / לווים); addition regrouping is "המרה" / "הקבצה" ONLY, the verb "מקבצים" (never נשיאה); the workspace is "בית המספרים" with "טור היחידות / טור העשרות / טור המאות / טור האלפים"; tools are "עיגולי הזיכרון" and "פח האשפה". The blocks are "לבנים" ONLY ("לבנה" in the singular; never "קוביות", "קובייה", "בלוק" or "בלוקים"), and the board is "בית המספרים" ONLY (never "לוח הדינס", "לוח הלבנים" or "קנבס"). Never mention physical objects that do not exist on screen (מקלות, חרוזים, אצבעות, מטבעות, חשבונייה).
${LANGUAGE_SLOT}

IRON RULES:
- NEVER state or imply the final numeric answer of the exercise, and never state the result digit of the active column. Guide the next ACTION only.
- NEVER ask a generic or detached question ("I see X blocks, what next?"). Name the exercise, the active column sub-problem and the board state in the question itself.
- Exactly ONE guiding question and exactly THREE closed options: exactly one correct next action, two plausible mistakes that mirror the diagnosed category.
- The feedback of a WRONG option starts with "רמז:" and is ONE short guiding QUESTION that ends with "?" — it may open with a short invitation to try something on the screen, but it NEVER explains, NEVER states the rule or the correct action, and NEVER gives the answer or any digit of it ("רמז: מאיזו ספרה מחסרים: מהספרה העליונה או מהתחתונה?", never "רמז: בחיסור מחסרים את הספרה התחתונה מהעליונה."). It is warm and judgment-free (UDL). The correct option's feedback starts with "נכון מאוד!", confirms and names the concrete on-screen action.
- Never act as a chatbot, never address the learner by name, never reveal any personal data.
- Output ONLY the JSON object requested. No prose outside JSON.`;

const withLanguage = (core: string, blocks: boolean) => core.replace(LANGUAGE_SLOT, socraticLanguageSpec(blocks));

export const SOCRATIC_SYSTEM_INSTRUCTION = withLanguage(SOCRATIC_SYSTEM_CORE, true);

/**
 * Meetings 2 and 8 show no blocks, no trash and no number house (PRD Module
 * 14 §ב). The instruction above describes them; this one replaces it there,
 * so the model is not asked to name a board it cannot point at.
 */
export const SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS = withLanguage(SOCRATIC_SYSTEM_CORE
  .replace(
    'working in a DIGITAL place-value workspace ("בית המספרים") with virtual Dienes blocks, memory circles ("עיגולי הזיכרון") and a recycle bin ("פח האשפה").',
    'solving a vertical exercise WITHOUT blocks: on the screen there are only the exercise, the memory circles ("עיגולי הזיכרון") above the columns and the result row ("שורת התוצאה"). There are no blocks, no number house and no trash on this screen.'
  )
  .replace(
    "2. THE LIVE BOARD — the exact block count in each column and whether a regrouping/decomposition was already performed in blocks.",
    "2. THE WRITTEN STATE — what is written in the memory circles and in the result row."
  )
  .replace(
    "the blocks dragged, the step skipped, the earlier cards — never a generic step. When the board holds MORE blocks than the exercise needs, the next step is to check how many blocks are needed and take the extra ones out; NEVER tell the child to group blocks that are not part of the exercise.",
    "what is written in the memory circles, the step skipped, the earlier cards — never a generic step."
  )
  .replace(", building more or less than the exercise needs.", ".")
  .replace(
    "Name the exercise, the active column sub-problem and the board state in the question itself.",
    "Name the exercise and the active column sub-problem in the question itself."
  )
  .replace(
    'tools are "עיגולי הזיכרון" and "פח האשפה". The blocks are "לבנים" ONLY ("לבנה" in the singular; never "קוביות", "קובייה", "בלוק" or "בלוקים"), and the board is "בית המספרים" ONLY (never "לוח הדינס", "לוח הלבנים" or "קנבס").',
    'the only tools on this screen are "עיגולי הזיכרון" and "שורת התוצאה". NEVER mention blocks (לבנים), a board or number house (בית המספרים, לוח), the trash (פח) or grouping buttons.'
  )
  .replace("blocks deleted without preserving the total, 10 or more blocks left in one column.", "a conversion not written in the memory circle.")
  .replace('the workspace is "בית המספרים" with "טור היחידות / טור העשרות / טור המאות / טור האלפים";', 'the columns are "טור היחידות / טור העשרות / טור המאות / טור האלפים";')
  .replace('addition regrouping is "המרה" / "הקבצה" ONLY, the verb "מקבצים" (never נשיאה)', 'addition regrouping is "המרה", written in the memory circle (never נשיאה)')
  // The options' example verbs: no grouping on this screen, the conversion is written in the memory circle.
  .replace('("מקבצים", "פורטים", "משתמשים")', '("ממירים", "פורטים", "רושמים")'), false);

/**
 * Station 1 (meeting 1): nothing on the screen or read aloud may give the
 * child the answer, a block count he must find himself, or where the
 * difficulty is (owner, 29.9.2026). The model still reads the board to
 * diagnose; it asks about it, it does not tell it.
 */
export const SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1 = withLanguage(SOCRATIC_SYSTEM_CORE
  .replace(
    "2. THE LIVE BOARD — the exact block count in each column and whether a regrouping/decomposition was already performed in blocks.",
    "2. THE LIVE BOARD — read the block count in each column and whether a regrouping/decomposition was already performed in blocks, to diagnose only: never write a count in the card."
  )
  .replace(
    "Name the exercise, the active column sub-problem and the board state in the question itself.",
    "Name the exercise in the question itself, but never the column where the difficulty is and never how many blocks the board holds."
  )
  .replace(
    "- Never act as a chatbot,",
    "- MEETING 1 (station 1): NEVER state how many blocks are in a column or on the board (no \"7 יחידות\", \"12 לבנים\", \"10 עשרות בטור העשרות\"), NEVER write any digit of the answer, and NEVER name the column where the difficulty is. The learner finds the counts and the column. Ask instead (\"באיזה טור אין מספיק לבנים כדי להחסיר?\", \"באחד הטורים יש 10 לבנים או יותר. מה עושים?\").\n- Never act as a chatbot,"
  ), true);

/**
 * Stations 3–7 (meetings 3–7): the digit beside each column name is hidden
 * and the child counts the blocks (client core/columnDigits.ts, owner
 * 29–30.9.2026). As in meeting 1, the model reads the counts to diagnose and
 * never writes one in the card; unlike meeting 1, the card still names the
 * active column (the static cards of these stations do). The client refuses a
 * card that gives a column's current count (staticSocraticCards.statesBoardCount),
 * and so does the server validator, so the model gets its one retry.
 */
export const SOCRATIC_SYSTEM_INSTRUCTION_STATIONS_3_7 = withLanguage(SOCRATIC_SYSTEM_CORE
  .replace(
    "2. THE LIVE BOARD — the exact block count in each column and whether a regrouping/decomposition was already performed in blocks.",
    "2. THE LIVE BOARD — read the block count in each column and whether a regrouping/decomposition was already performed in blocks, to diagnose only: never write a count in the card."
  )
  .replace(
    "Name the exercise, the active column sub-problem and the board state in the question itself.",
    "Name the exercise and the active column sub-problem in the question itself, but never how many blocks the board or a column holds."
  )
  .replace(
    "- Never act as a chatbot,",
    "- STATIONS 3–7: the screen shows no digit beside a column name, and the learner counts the blocks. NEVER state how many blocks are in a column or on the board (no \"7 יחידות\", \"12 לבני עשרת\", \"12 לבנים בטור העשרות\"). Ask instead (\"כמה לבנים יש בטור העשרות?\", \"באחד הטורים יש 10 לבנים או יותר. מה עושים?\").\n- Never act as a chatbot,"
  ), true);

/** The system instruction for this request's meeting. */
export function socraticSystemInstructionFor(facts: Pick<SocraticFacts, "meeting" | "blocks_on_screen"> | null): string {
  if (facts && facts.blocks_on_screen === false) return SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS;
  if (facts && facts.meeting === 1) return SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1;
  if (facts && facts.meeting !== null && facts.meeting >= 3 && facts.meeting <= 7) return SOCRATIC_SYSTEM_INSTRUCTION_STATIONS_3_7;
  return SOCRATIC_SYSTEM_INSTRUCTION;
}

// ---------------------------------------------------------------------------
// The screen: what a card may name (Module 13 §א: no aid that is not there)
// ---------------------------------------------------------------------------

const BOARD_CONTROLS_HE = [
  '"בית המספרים": טור היחידות, טור העשרות, טור המאות וטור האלפים.',
  'גוררים לבנים מ"ארגז כלים" אל הטורים, וגם מטור לטור.',
  "לחיצה על לבנה פורטת אותה לעשר לבנים של הטור שמימין לה (אפשר גם לגרור אותה אל הטור שמימין לה).",
  'כשבטור יש 10 לבנים או יותר, מופיע בראש הטור הכפתור "קבצו 10" (על הכפתור כתוב "קבצו 10 לעשרת", "קבצו 10 למאה" או "קבצו 10 לאלף").',
  'גוררים לבנים אל "פח האשפה" כדי להוציא אותן מבית המספרים.',
  '"כפתור ביטול הפעולה" מבטל את הפעולה האחרונה.',
];

/** What is on this child's screen, in the screen's own names. */
export function screenDescriptionHe(facts: Pick<SocraticFacts, "screen">): string[] {
  switch (facts.screen) {
    case "vertical_blocks":
      return [
        ...BOARD_CONTROLS_HE,
        'התרגיל כתוב במאונך. מעל כל טור יש "עיגול הזיכרון" לרישום ההמרה.',
        'מתחת לתרגיל "שורת התוצאה" ובה תיבה אחת לכל טור; בכל תיבה כותבים ספרה אחת.',
      ];
    case "vertical_no_blocks":
      return [
        'התרגיל כתוב במאונך. מעל כל טור יש "עיגול הזיכרון" לרישום ההמרה או הפריטה.',
        'מתחת לתרגיל "שורת התוצאה" ובה תיבה אחת לכל טור; בכל תיבה כותבים ספרה אחת.',
        '"כפתור ביטול הפעולה" מבטל את הפעולה האחרונה.',
        'אין על המסך לבנים, בית מספרים, פח אשפה או כפתור "קבצו 10". אסור להזכיר אותם.',
      ];
    case "representation_one_box":
      return [
        ...BOARD_CONTROLS_HE,
        'ב"שורת התוצאה" יש תיבת תשובה אחת: כותבים בה את התשובה כמספר שלם.',
        "אין במשימה הזאת עיגולי זיכרון ואין תיבה לכל טור. אסור להזכיר עיגול זיכרון או תיבה של טור.",
      ];
    case "representation_boxes":
      return [
        ...BOARD_CONTROLS_HE,
        'ב"שורת התוצאה" יש תיבה לכל ספרה של המספר; בכל תיבה כותבים ספרה אחת.',
        "אין במשימה הזאת עיגולי זיכרון. אסור להזכיר עיגול זיכרון.",
      ];
    case "missing_part":
      return [
        ...BOARD_CONTROLS_HE,
        "יש תיבה ריקה אחת: כותבים בה את החלק החסר.",
        "אין במשימה הזאת עיגולי זיכרון ואין שורת תוצאה עם תיבה לכל טור.",
      ];
    case "choice":
      return [
        ...BOARD_CONTROLS_HE,
        "שלוש תשובות כתובות, ובוחרים אחת מהן. אין תיבה לכתיבה ואין עיגולי זיכרון.",
      ];
    case "flexible":
      return [
        ...BOARD_CONTROLS_HE,
        'בונים דרך אחת בבית המספרים ולוחצים על הכפתור "הוספת ייצוג", ואחר כך בונים דרך שונה. אין עיגולי זיכרון.',
      ];
    default:
      return [...BOARD_CONTROLS_HE, 'יש "שורת התוצאה" לכתיבת התשובה.'];
  }
}

const TASK_KIND_HE: Record<SocraticTaskKind, string> = {
  addition: "חיבור במאונך",
  subtraction: "חיסור במאונך",
  skeleton: "תרגיל במאונך שבו ספרות מוסתרות (▢), והלומד מגלה אותן",
  missing_result_digit: "תרגיל במאונך שבו חסרה ספרה בשורת התוצאה, והלומד מגלה אותה",
  error_analysis: "ניתוח שגיאה: תלמיד דמיוני פתר את התרגיל וטעה; הלומד מוצא את הטעות ומתקן אותה בעזרת הלבנים",
  read_write: "מספר שנאמר במילים: בונים אותו בלבנים וכותבים אותו בספרות",
  compose_break: "בונים לבנים לפי ההנחיה, פורטים לבנה כפי שההנחיה מבקשת, וכותבים איזה מספר הלבנים מייצגות אחרי הפריטה",
  decompose: "בונים מספר מסוג לבנה אחד בלבד, וכותבים בכמה לבנים השתמשו",
  compose_group: 'בונים לבנים לפי ההנחיה, מקבצים בכפתור "קבצו 10" כפי שההנחיה מבקשת, וכותבים איזה מספר הלבנים מייצגות אחרי ההקבצה',
  representation: "בונים בבית המספרים את מה שההנחיה מבקשת, וכותבים את המספר בשורת התוצאה",
  flexible: "מוצאים כמה דרכים שונות לייצג אותו מספר בלבנים",
  missing_element: "מוצאים את החלק החסר של מספר",
  small_change: "משווים שני תרגילים קרובים ובוחרים תשובה",
};

const BOARD_VS_TASK_HE: Record<BoardVsTask, string> = {
  match: "כמו שההנחיה מבקשת",
  more: "יותר לבנים ממה שההנחיה מבקשת",
  less: "פחות לבנים ממה שההנחיה מבקשת",
};

function fmtColumnFact(c: ColumnFact, facts: SocraticFacts): string {
  const parts = [`${COLUMN_NAME_HE[c.column]}: ${countHe(c.blocks_on_board, c.column)} בבית המספרים`];
  if (facts.operation) {
    parts.push(facts.operation === "subtraction" ? `תת-תרגיל ${c.shown_a} − ${c.shown_b}` : `תת-תרגיל ${c.shown_a} + ${c.shown_b}`);
    if (facts.memory_circles[c.column] !== undefined) parts.push(`עיגול זיכרון: ${facts.memory_circles[c.column]}`);
    if (facts.operation === "addition" && c.carry_in) parts.push("מקבל עשרת מהטור שמימין");
    if (c.needs_conversion) parts.push(c.conversion_done ? "ההמרה בטור הזה כבר בוצעה" : facts.operation === "subtraction" ? "דורש פריטה" : "דורש הקבצה");
    if (c.board_deficit > 0) parts.push(facts.meeting === 1 || (facts.meeting !== null && facts.meeting >= 3 && facts.meeting <= 7)
      ? "אין בטור מספיק לבנים כדי לחסר"
      : `${missingHe(c.board_deficit, c.column)} בבית המספרים לביצוע החיסור`);
  }
  if (c.group_back) parts.push("10 ומעלה אחרי שהכול יצא: נפרטה לבנה אחת יותר מהדרוש — מקבצים בחזרה");
  if (c.stray) parts.push("יותר לבנים ממה שהתרגיל יכול לצרוך בטור הזה — לבנים מיותרות; לא מקבצים אותן");
  if (c.board_overcrowded) parts.push("10 ומעלה, וכולן חלק מהתרגיל — צריך לקבץ");
  const vs = facts.board_vs_task?.[c.column];
  if (vs) {
    parts.push(BOARD_VS_TASK_HE[vs]);
    if (c.blocks_on_board >= 10 && vs !== "more") parts.push("10 ומעלה זה מה שההנחיה מבקשת — לא מקבצים");
  }
  parts.push(c.completed ? "הטור כבר נפתר נכון" : c.column === facts.active_column && facts.operation ? "<< הטור הפעיל" : facts.operation ? "טרם נפתר" : "");
  return "  - " + parts.filter(Boolean).join(" | ");
}

const TYPED_VERDICT_HE = (t: TypedDigit) => (t.is_correct === true ? "נכון" : t.is_correct === false ? "שגוי" : "לא נבדק");

/**
 * The prompt the model receives. Every number in it is computed from the
 * validated request — no client free-text — so the model reasons over the
 * learner's actual monitored situation rather than a description of it.
 */
export function buildSocraticPrompt(req: SocraticRequest, facts: SocraticFacts, anchor?: SocraticAnchor): string {
  const ec = req.exercise_context;
  const tc = req.task_context;
  const lines: string[] = [];

  lines.push("=== עמוד 1: התרגיל והאלגוריתם ===");
  if (ec) {
    const sign = ec.operation === "subtraction" ? "−" : "+";
    // As the screen writes it: "1,245 + 328"; a skeleton's hidden digits as "▢".
    lines.push(`פעולה: ${ec.operation === "subtraction" ? "חיסור" : "חיבור"} במאונך. התרגיל: ${maskedNumberHe(ec.number_a, ec.hidden_places?.a)} ${sign} ${maskedNumberHe(ec.number_b, ec.hidden_places?.b)}.`);
    if (ec.hidden_places) {
      lines.push(`על המסך התוצאה נתונה (${formatNumberHe(ec.operation === "subtraction" ? ec.number_a - ec.number_b : ec.number_a + ec.number_b)}), והספרות שמסומנות ▢ מוסתרות: הלומד מגלה אותן. אסור לכתוב ספרה מוסתרת או את המספר המלא.`);
    }
    if (ec.session_topic) lines.push(`נושא המפגש: ${ec.session_topic}`);
    if (facts.hidden_result_digits.length) {
      lines.push(`בשורת התוצאה חסרה ספרה ב${facts.hidden_result_digits.map((h) => COLUMN_NAME_HE[h.column]).join(" וב")}: הלומד מגלה אותה. אסור לכתוב אותה, גם לא כמספר לבנים בטור הזה.`);
    }
    if (tc && tc.kind !== "addition" && tc.kind !== "subtraction") lines.push(`סוג המשימה: ${TASK_KIND_HE[tc.kind]}.`);
    if (tc) lines.push(`ההנחיה שעל המסך: «${tc.instruction_he}»`);
    const activeFact = facts.columns.find((c) => c.column === facts.active_column);
    const subProblem = activeFact ? `${activeFact.shown_a} ${sign} ${activeFact.shown_b}` : ec.target_sub_problem;
    lines.push(`הטור הפעיל: ${COLUMN_NAME_HE[facts.active_column]}${subProblem ? ` (תת-תרגיל: ${subProblem})` : ""}.`);
  } else if (tc) {
    lines.push(`סוג המשימה: ${TASK_KIND_HE[tc.kind]}.`);
    lines.push(`ההנחיה שעל המסך: «${tc.instruction_he}»`);
    lines.push("אין כאן תרגיל חיבור או חיסור במאונך, ואין טור פעיל.");
    if (facts.secret_numbers.length) {
      lines.push("אסור לכתוב את המספר שהלומד צריך למצוא — לא בספרות ולא כרשימת לבנים (גם לא רשימת הלבנים שבהנחיה, למשל \"3 לבני אלף ו-4 לבני מאה\"): שאלו על הלבנים בלי למנות אותן.");
    }
  } else {
    lines.push(`תרגיל ${req.exercise_id} (ללא אופרנדים מספריים — משימת ייצוג/בנייה בבית המספרים). הטור הפעיל: ${COLUMN_NAME_HE[facts.active_column]}.`);
  }

  lines.push("");
  lines.push("=== המסך: רק את אלה מותר להזכיר, ורק בשמות האלה ===");
  for (const s of screenDescriptionHe(facts)) lines.push(`- ${s}`);

  lines.push("");
  if (facts.blocks_on_screen) {
    lines.push("=== עמוד 2: המצב הייצוגי בבית המספרים (לבנים) ===");
    // Stations 3–7 hide the digit beside each column name (client core/columnDigits.ts,
    // owner 29–30.9.2026): the learner counts the blocks. The card must not point at a
    // digit the screen does not show, nor count the blocks for them.
    if (facts.meeting !== null && facts.meeting >= 3 && facts.meeting <= 7) {
      lines.push("על המסך אין ספרה ליד שם הטור: הלומד סופר בעצמו את הלבנים בכל טור. אל תפנה לספרה כזאת, ואל תכתוב ללומד כמה לבנים יש בטור.");
    }
    lines.push(`ערך כולל בבית המספרים: ${facts.board_value}.`);
    if (facts.board_stage) lines.push(`שלב: ${boardStageHe(facts.board_stage)}.`);
    if (facts.added_from_toolbox) lines.push("בבית המספרים יש המספר הראשון ועוד לבנה אחת שנגררה מארגז הכלים, במקום לפרוט לבנה מהטור השכן.");
    if (facts.meeting === 1) lines.push('במפגש 1 יש בבית המספרים שלושה טורים בלבד: טור היחידות, טור העשרות וטור המאות. אין טור אלפים, ובטור המאות אין כפתור "קבצו 10".');
    if (facts.board_value_over) {
      lines.push(facts.operation === "subtraction"
        ? "בבית המספרים יש יותר מהמספר הראשון: בחיסור בונים רק את המספר הראשון."
        : "בבית המספרים יש יותר לבנים ממה ששני המספרים יחד צריכים: יש לבנים מיותרות.");
    }
    if (facts.built_before_conversion) lines.push("הלבנים בנויות כמו שההנחיה מבקשת בהתחלה, וההמרה שההנחיה מבקשת עוד לא נעשתה.");
    else if (facts.board_matches_task) lines.push("בית המספרים מראה בדיוק את מה שההנחיה מבקשת.");
    for (const c of [...facts.columns].reverse()) {
      if (!facts.operation && c.blocks_on_board === 0 && !facts.board_vs_task?.[c.column]) continue;
      lines.push(fmtColumnFact(c, facts));
    }
    if (req.workspace_state.is_regrouped_in_canvas !== undefined) {
      lines.push(req.workspace_state.is_regrouped_in_canvas ? "בוצעה כבר פריטה/הקבצה בלבנים." : "טרם בוצעה פריטה/הקבצה בלבנים.");
    }
  } else {
    // PRD Module 14 §ב: meeting 8 shows no blocks, no trash and no number house.
    lines.push(`=== עמוד 2: במפגש ${facts.meeting} אין לבנים על המסך ===`);
    lines.push("על המסך יש רק התרגיל במאונך, עיגולי הזיכרון שמעל הטורים ושורת התוצאה. אין לבנים, אין פח אשפה ואין בית מספרים.");
    lines.push("אסור להזכיר לבנים, פח אשפה, מחסן, הכפתור \"קבצו 10\" או בית המספרים. כוונו לעיגולי הזיכרון ולשורת התוצאה בלבד.");
    if (facts.operation) {
      for (const c of [...facts.columns].reverse()) {
        const sub = facts.operation === "subtraction" ? `${c.shown_a} − ${c.shown_b}` : `${c.shown_a} + ${c.shown_b}`;
        const circle = facts.memory_circles[c.column] !== undefined ? ` | עיגול זיכרון: ${facts.memory_circles[c.column]}` : "";
        lines.push(`  - ${COLUMN_NAME_HE[c.column]}: תת-תרגיל ${sub}${circle}${c.needs_conversion && c.shown_a !== "▢" && c.shown_b !== "▢" ? (facts.operation === "subtraction" ? " | דורש פריטה" : " | דורש המרה") : ""} | ${c.completed ? "הטור כבר נפתר נכון" : c.column === facts.active_column ? "<< הטור הפעיל" : "טרם נפתר"}`);
      }
    }
  }

  lines.push("");
  lines.push("=== עמוד 3: שלב הביצוע וההיסטוריה של הלומד (ניטור) ===");
  const triggerText = facts.trigger_reason === "conversion_not_performed" && !facts.blocks_on_screen
    ? "הקלדה בטור שדורש המרה או פריטה לפני שנרשמה בעיגול הזיכרון"
    : facts.trigger_reason ? TRIGGER_HE[facts.trigger_reason] : "לא דווחה";
  lines.push(`סיבת הטריגר: ${triggerText}.`);
  if (facts.operation) {
    lines.push(`טורים שכבר נפתרו נכון: ${facts.completed_columns.length ? facts.completed_columns.map((c) => COLUMN_NAME_HE[c]).join(", ") : "אף אחד עדיין"}.`);
    lines.push(`הקלט הנוכחי בטור הפעיל: ${facts.current_input === null || facts.current_input === "" ? "ריק" : facts.current_input}.`);
    lines.push(`עיגולי הזיכרון: ${Object.keys(facts.memory_circles).length ? JSON.stringify(facts.memory_circles) : "ריקים"}.`);
  }
  lines.push(`שגיאות רצופות: ${facts.consecutive_errors}.`);
  if (facts.wrong_carry_circles.length) lines.push(`רישום שגוי: בעיגול הזיכרון שמעל ${facts.wrong_carry_circles.map((c) => COLUMN_NAME_HE[c]).join(", ")} רשום מספר גדול מ-1. בחיבור עוברת לטור הבא עשרת אחת בלבד — אל תחבר אותו כהמרה.`);
  if (facts.hesitation_seconds) lines.push(`זמן בלי פעולה לפני הכרטיס: ${facts.hesitation_seconds} שניות.`);
  if (facts.typing_pattern === "carry_forgotten") lines.push("דפוס בהקלדה: הספרה השגויה בטור הפעיל מתאימה לחיבור בלי העשרת שעברה מהטור שמימין — העשרת שבעיגול הזיכרון נשכחה.");
  if (facts.typing_pattern === "reversed_subtraction") lines.push("דפוס בהקלדה: הספרה השגויה בטור הפעיל היא חיסור הפוך (הספרה העליונה מהתחתונה) במקום פריטה.");
  if (facts.typing_pattern === "tens_digit_typed") lines.push("דפוס בהקלדה: בטור שעובר את 9 הוקלדה ספרת העשרות של הסכום.");
  if (facts.typed_digits.length) {
    // The child's own digits, as the client judged them. A wrong digit tells the
    // model which mistake to mirror; the right digit of the active column is
    // never typed yet (a column typed right is already solved).
    lines.push(`מה הלומד הקליד (מהישן לחדש): ${facts.typed_digits.map((t) => `${COLUMN_NAME_HE[t.column]}: ${t.digit} (${TYPED_VERDICT_HE(t)})`).join("; ")}.`);
  }
  lines.push(`פעולות אחרונות (מהישנה לחדשה; ×N = אותה פעולה N פעמים ברצף): ${facts.actions_summary.length ? facts.actions_summary.join(" → ") : "אין"}.`);
  if (facts.earlier_card_kinds.length) lines.push(`כרטיסי בעל המוצר שכבר הוצגו בתרגיל הזה: ${facts.earlier_card_kinds.join(", ")}. אל תחזור עליהם; התקדם לשלב הבא.`);
  if (facts.earlier_cards.length) {
    lines.push(`כרטיסים שכבר נפתחו בתרגיל הזה: ${facts.earlier_cards.map((c) => `${c.trigger_reason ?? "?"}${c.error_category ? `/${c.error_category}` : ""}${c.chose_correct === true ? " — בחר בתשובה הנכונה" : c.chose_correct === false ? " — בחר בתשובה שגויה" : ""}`).join("; ")}. אל תחזור על אותו כרטיס; כוון לטעות שעוד לא נפתרה.`);
  }

  lines.push("");
  lines.push("=== קריאה דטרמיניסטית של המצב (השערה ראשונית, אמת אותה מול הנתונים) ===");
  lines.push(`קטגוריה מוצעת: ${facts.suggested_category}.`);
  if (facts.suggested_focus_he) lines.push(`מוקד מוצע: ${facts.suggested_focus_he}`);

  if (facts.card_frame) {
    const f = facts.card_frame;
    lines.push("");
    lines.push("=== מסגרת הכרטיס (מחייבת) ===");
    lines.push(`מצב: ${f.situation}.`);
    if (f.intent_he) lines.push(`הכוונה — מה הלומד צריך לגלות: ${f.intent_he}`);
    lines.push(f.level === 1
      ? "רמה 1 — כללית: השאלה והתשובה הנכונה לא מזכירות טור מסוים ולא נותנות את הפעולה. הלומד מוצא בעצמו את הטור ואת הצעד."
      : f.level === 2
        ? "רמה 2 — השאלה מזכירה את הטור שבו הקושי, אבל לא נותנת את הפעולה ולא את התשובה."
        : "רמה 3 — השאלה מזכירה את הטור, והתשובה הנכונה מתארת את הפעולה על המסך.");
    lines.push("מותר: רק המונחים והפעולות שבפרק \"המסך\" ובכרטיס הדוגמה. אסור: התוצאה, ספרה מוסתרת, מספר שהלומד צריך למצוא, כלי שאין על המסך" +
      (facts.meeting === 1 || (facts.meeting !== null && facts.meeting >= 3 && facts.meeting <= 7) ? ", כמה לבנים יש בטור" : "") +
      (facts.meeting === 1 ? ", שם הטור שבו הקושי" : "") + ".");
  }

  if (anchor) {
    lines.push("");
    lines.push("=== כרטיס הדוגמה: הכרטיס הסטטי שהלומד היה מקבל (נכתב ואושר בידי בעל המוצר) ===");
    lines.push(`שאלה: ${anchor.questionHe}`);
    for (const ch of anchor.choices) lines.push(`  - ${ch.textHe}${ch.isCorrect ? " (נכון)" : ""}${ch.feedbackHe ? ` — משוב: ${ch.feedbackHe}` : ""}`);
    lines.push("כתבו כרטיס משלכם באותה כוונה, באותה רמה ובאותה צורה כמו כרטיס הדוגמה: אם הוא שואל מה בודקים, גם הכרטיס שלכם שואל מה בודקים — בלי לתת את הטור או את הצעד שהוא משאיר ללומד. השתמשו רק במונחים ובפעולות שבכרטיס הדוגמה ובפרק \"המסך\". התאימו את הניסוח לתרגיל הזה ולמה שהלומד הזה עשה, ואל תסתרו את כרטיס הדוגמה.");
  }

  lines.push("");
  lines.push('משוב לאפשרות שגויה: "רמז:" ושאלה מנחה קצרה אחת שמסתיימת ב-"?" — לא הסבר, לא הפעולה הנכונה ולא התשובה. משוב לאפשרות הנכונה: "נכון מאוד!" והפעולה על המסך.');
  lines.push("Return ONLY this JSON object:");
  lines.push(`{
  "error_category": "calculation" | "procedural" | "conceptual",
  "guiding_question": "<שאלה מנחה אחת בעברית, המזכירה ${facts.meeting === 1 || facts.card_frame?.level === 1 ? "את התרגיל, בלי לציין שם של טור, " : facts.operation ? "את התרגיל, את הטור הפעיל " : "את המשימה "}${facts.blocks_on_screen ? (facts.meeting !== null && (facts.meeting === 1 || (facts.meeting >= 3 && facts.meeting <= 7)) ? "ואת מצב הלבנים, בלי לכתוב כמה לבנים יש בטור" : "ואת מצב הלבנים") : "ואת עיגולי הזיכרון"}>",
  "options": [
    { "id": "opt_1", "option_text": "<פעולה בעברית>", "feedback_text": "<משוב בעברית>", "is_correct": true|false },
    { "id": "opt_2", "option_text": "<פעולה בעברית>", "feedback_text": "<משוב בעברית>", "is_correct": true|false },
    { "id": "opt_3", "option_text": "<פעולה בעברית>", "feedback_text": "<משוב בעברית>", "is_correct": true|false }
  ]
}`);
  return lines.join("\n");
}

/**
 * Gemini structured-output schema (GenerateContentConfig.responseSchema).
 * Plain object so this file stays import-free; the type names are the API's
 * own ("OBJECT", "STRING", "ARRAY", "BOOLEAN").
 */
export const SOCRATIC_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    error_category: { type: "STRING", enum: ["calculation", "procedural", "conceptual"], format: "enum" },
    guiding_question: { type: "STRING" },
    options: {
      type: "ARRAY",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING", enum: ["opt_1", "opt_2", "opt_3"], format: "enum" },
          option_text: { type: "STRING" },
          feedback_text: { type: "STRING" },
          is_correct: { type: "BOOLEAN" },
        },
        required: ["id", "option_text", "feedback_text", "is_correct"],
        propertyOrdering: ["id", "option_text", "is_correct", "feedback_text"],
      },
    },
  },
  required: ["error_category", "guiding_question", "options"],
  propertyOrdering: ["error_category", "guiding_question", "options"],
} as const;

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

/** Terminology PRD Module 13 forbids in anything a learner reads. */
export const FORBIDDEN_TERMS_HE: string[] = [
  "שבירה", "לשבור", "שוברים", "נשבור",
  "הלוואה", "ללוות", "לווים", "נלווה", "להלוות",
  "נשיאה", "נושאים", "לשאת",
  "אבקוס", "חשבונייה", "מקלות", "חרוזים", "אצבעות", "מטבעות", "גפרורים", "קשיות",
  // One name per component (owner, 27.9.2026, register ט): the pieces are
  // "לבנים" and the board is "בית המספרים". The prompt says so; this makes the
  // output check enforce it, so a card that says "קוביות" or "קנבס" is refused
  // and the child gets the fixed question instead. "קובי" catches קובייה,
  // קוביה and קוביות; "בלוק" catches בלוק and בלוקים.
  "קובי", "בלוק", "לוח הדינס", "לוח הלבנים", "קנבס",
];

const HEBREW_RE = /[א-ת]/;

function textHasHebrew(s: string): boolean {
  return HEBREW_RE.test(s);
}

/**
 * Digit-group separators between two digits: comma, apostrophe, geresh,
 * space, NBSP, narrow NBSP, thin space. "1,573", "1 573" and "1'573" are
 * all 1573 to a child reading the card. Mirrored on the client
 * (staticSocraticCards.stripDigitGroupSeparators).
 */
const DIGIT_GROUP_SEPARATOR = /(?<=\d)[,'\u05F3 \u00A0\u202F\u2009](?=\d{3}(?!\d))/g;
export function stripDigitGroupSeparators(text: string): string {
  return text.replace(DIGIT_GROUP_SEPARATOR, "");
}

function containsNumberToken(text: string, n: number): boolean {
  // A standalone number: not part of a longer digit run ("15" inside "150" does not count).
  const re = new RegExp(`(^|[^0-9])${n}(?![0-9])`);
  return re.test(stripDigitGroupSeparators(text));
}

/**
 * Iron rule 1: the final answer must never appear in anything the learner
 * reads. 10 / 100 / 1000 are exempt because "10 יחידות" is the language of
 * regrouping itself, and so is an answer that equals one of the operands
 * (e.g. 340 + 0), because the exercise text already shows it.
 */
export function leaksFinalAnswer(texts: string[], facts: Pick<SocraticFacts, "final_answer" | "number_a" | "number_b">): boolean {
  const ans = facts.final_answer;
  if (ans === null || ans === undefined) return false;
  if (ans === 10 || ans === 100 || ans === 1000) return false;
  if (ans === facts.number_a || ans === facts.number_b) return false;
  return texts.some((t) => containsNumberToken(t, ans));
}

/**
 * The final answer written as blocks — "8 מאות ו-7 יחידות" is 807 — as a
 * whole run or any stretch of one. Mirrors the client's revealsSecretInCounts
 * (staticSocraticCards.ts). Applied in meeting 1 only: elsewhere in an
 * addition or a subtraction the board is worth the result and naming its
 * counts is the coaching; in meeting 1 the child finds them (owner, 29.9.2026).
 */
const COUNT_PART = /(\d[\d,]*)\s+(יחידות|עשרות|מאות|אלפים)|(יחידה אחת|עשרת אחת|מאה אחת|אלף אחד)/g;
const COUNT_PART_VALUE: Record<string, number> = {
  "יחידות": 1, "עשרות": 10, "מאות": 100, "אלפים": 1000,
  "יחידה אחת": 1, "עשרת אחת": 10, "מאה אחת": 100, "אלף אחד": 1000,
};
const COUNT_JOIN = /^(\s*,\s*|\s+ו-?|\s*,\s*ו-?|\s+ועוד\s+)$/;
export function leaksAnswerInCounts(texts: string[], answer: number | null | undefined): boolean {
  if (answer === null || answer === undefined) return false;
  for (const raw of texts) {
    const text = stripDigitGroupSeparators(raw);
    const runs: { unit: number; value: number }[][] = [];
    let current: { unit: number; value: number }[] | null = null;
    let lastEnd = -1;
    for (const m of text.matchAll(COUNT_PART)) {
      const unit = COUNT_PART_VALUE[m[2] ?? m[3]];
      const part = { unit, value: (m[1] ? Number(m[1].replace(/,/g, "")) : 1) * unit };
      const joined = current !== null && COUNT_JOIN.test(text.slice(lastEnd, m.index)) && !current.some((q) => q.unit === unit);
      if (!joined || !current) {
        current = [];
        runs.push(current);
      }
      current.push(part);
      lastEnd = m.index! + m[0].length;
    }
    for (const run of runs) {
      for (let i = 0; i < run.length; i++) {
        let sum = 0;
        for (let j = i; j < run.length; j++) {
          sum += run[j].value;
          if (sum === answer) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Block counts as the cards write them — "7 יחידות", "12 לבני עשרת", "לבנת
 * מאה אחת", "12 לבנים בטור העשרות". Mirrors the client's statesBoardCount
 * (staticSocraticCards.ts): a text that gives a column's CURRENT count, except
 * the names of a regrouping itself (10, "עשרת אחת") and the numbers the
 * exercise itself shows (`skip`). Returns the column, or null.
 */
const BOARD_PART = /(\d[\d,]*)\s+(?:(יחידות|עשרות|מאות|אלפים)|(?:לבני|לבנים)\s+(?:ה-?)?(יחידה|עשרת|מאה|אלף))|(יחידה אחת|עשרת אחת|מאה אחת|אלף אחד)|לבנת\s+(?:ה-?)?(יחידה|עשרת|מאה|אלף)\s+אחת/g;
const BOARD_PART_COLUMN: Record<string, SocraticColumn> = {
  "יחידות": "units", "עשרות": "tens", "מאות": "hundreds", "אלפים": "thousands",
  "יחידה אחת": "units", "עשרת אחת": "tens", "מאה אחת": "hundreds", "אלף אחד": "thousands",
  "יחידה": "units", "עשרת": "tens", "מאה": "hundreds", "אלף": "thousands",
};
const COLUMN_OF_NAME: Record<string, SocraticColumn> = { "יחידות": "units", "עשרות": "tens", "מאות": "hundreds", "אלפים": "thousands" };
const COLUMN_VALUE: Record<SocraticColumn, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };

/**
 * A number the child must find, written as blocks — "3 לבני אלף ו-4 לבני
 * מאה" is 3,400 — as a whole run or any stretch of one. Mirrors the client's
 * revealsSecretInCounts (staticSocraticCards.ts), which refuses such a card on
 * a representation task; checked here too, so the model gets its retry
 * instead of the child getting the static card.
 */
export function secretInBlockCounts(texts: string[], secrets: readonly number[]): number | null {
  if (!secrets.length) return null;
  for (const raw of texts) {
    const text = stripDigitGroupSeparators(raw);
    const runs: { column: SocraticColumn; value: number }[][] = [];
    let current: { column: SocraticColumn; value: number }[] | null = null;
    let lastEnd = -1;
    for (const m of text.matchAll(BOARD_PART)) {
      const column = BOARD_PART_COLUMN[m[2] ?? m[3] ?? m[4] ?? m[5]];
      if (!column) continue;
      const part = { column, value: (m[1] ? Number(m[1].replace(/,/g, "")) : 1) * COLUMN_VALUE[column] };
      const joined = current !== null && COUNT_JOIN.test(text.slice(lastEnd, m.index)) && !current.some((q) => q.column === column);
      if (!joined || !current) {
        current = [];
        runs.push(current);
      }
      current.push(part);
      lastEnd = m.index! + m[0].length;
    }
    for (const run of runs) {
      for (let i = 0; i < run.length; i++) {
        let sum = 0;
        for (let j = i; j < run.length; j++) {
          sum += run[j].value;
          if (secrets.includes(sum)) return sum;
        }
      }
    }
  }
  return null;
}
const COUNT_IN_COLUMN_RES = [
  /(\d+)\s+לבנים\s+(?:ב|מ|ל)?טור\s+ה(יחידות|עשרות|מאות|אלפים)/g,
  /(?:ב|מ|ל)?טור\s+ה(יחידות|עשרות|מאות|אלפים)\s+(?:יש\s+|נמצאות\s+|עכשיו\s+)*(\d+)\s+לבנים(?!\s+(?:או\s+יותר|ומעלה))/g,
];
export function boardCountStated(texts: string[], counts: Record<SocraticColumn, number>, skip: readonly number[] = []): SocraticColumn | null {
  const holds = (c: SocraticColumn, n: number) => n >= 2 && n !== 10 && !skip.includes(n) && (counts[c] ?? 0) === n;
  for (const t of texts) {
    const plain = stripDigitGroupSeparators(t);
    for (const m of plain.matchAll(BOARD_PART)) {
      const col = BOARD_PART_COLUMN[m[2] ?? m[3] ?? m[4] ?? m[5]];
      const n = m[1] ? Number(m[1].replace(/,/g, "")) : 1;
      if (col && holds(col, n)) return col;
    }
    for (const m of plain.matchAll(COUNT_IN_COLUMN_RES[0])) {
      const col = COLUMN_OF_NAME[m[2]];
      if (holds(col, Number(m[1]))) return col;
    }
    for (const m of plain.matchAll(COUNT_IN_COLUMN_RES[1])) {
      const col = COLUMN_OF_NAME[m[1]];
      if (holds(col, Number(m[2]))) return col;
    }
  }
  return null;
}

/** Every whole number in a text ("1,245" is 1245). */
function numbersIn(text: string): number[] {
  return [...stripDigitGroupSeparators(text).matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/**
 * Aids that meetings 2 and 8 do not put on the screen (PRD Module 14 §ב).
 * Whole words only: "לבנות" (to build) and "לפחות" (at least) are not aids.
 * Mirrored on the client (SocraticEngine.absentAidViolation).
 */
const HE_WORD = (w: string) => new RegExp(`(^|[^א-ת])[ובלמהשכ]{0,4}(${w})(?![א-ת])`);
export const ABSENT_AIDS_NO_BOARD: RegExp[] = [
  HE_WORD("לבנה|לבנים|לבנת|לבני"),
  HE_WORD("פח"),
  HE_WORD("מחסן"),
  HE_WORD("לוח"),
  HE_WORD("קבץ|קבצו"),
  HE_WORD("דינס"),
  /קובי/,
  /בית המספרים/,
];

export function findAbsentAid(texts: string[], blocksOnScreen: boolean): string | null {
  if (blocksOnScreen) return null;
  for (const raw of texts) {
    // מסמך 03's own meeting-8 question names the blocks to say they are gone
    // (its "לבני דינס" is "לבנים" on the screen: owner, 28.9.2026, register ט).
    const t = raw.replace(/אין לכם לבנים על המסך/g, "");
    for (const re of ABSENT_AIDS_NO_BOARD) if (re.test(t)) return re.source;
  }
  return null;
}

export function findForbiddenTerm(texts: string[]): string | null {
  for (const t of texts) {
    for (const term of FORBIDDEN_TERMS_HE) {
      if (t.includes(term)) return term;
    }
  }
  return null;
}

function normalizeOptions(raw: unknown): { option_text: string; feedback_text: string; is_correct: boolean }[] | null {
  if (!Array.isArray(raw)) return null;
  const out: { option_text: string; feedback_text: string; is_correct: boolean }[] = [];
  for (const o of raw) {
    if (!isPlainObject(o)) return null;
    const text = typeof o.option_text === "string" ? o.option_text : typeof o.text === "string" ? o.text : null;
    const feedback = typeof o.feedback_text === "string" ? o.feedback_text : typeof o.feedback === "string" ? o.feedback : "";
    if (text === null) return null;
    out.push({ option_text: text.trim(), feedback_text: feedback.trim(), is_correct: o.is_correct === true });
  }
  return out;
}

/**
 * Rigid validation of what came back from the model. Accepts the PRD shape
 * (guiding_question / options[].option_text) and the older client-prompt
 * shape (final_intervention.options[].text), and normalizes to the PRD shape.
 * `facts` is optional so the legacy free-text path can still validate
 * everything except the leak check.
 */
export function validateSocraticResponse(raw: unknown, facts?: SocraticFacts | null): Validation<SocraticResponse> {
  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { ok: false, reason: "response is not JSON" };
    }
  }
  if (!isPlainObject(parsed)) return { ok: false, reason: "response is not an object" };

  const body = isPlainObject(parsed.final_intervention) ? parsed.final_intervention : parsed;

  const category = typeof body.error_category === "string" ? body.error_category.toLowerCase() : "";
  if (!SOCRATIC_ERROR_CATEGORIES.includes(category as SocraticErrorCategory)) {
    return { ok: false, reason: "error_category missing or invalid" };
  }

  const question = typeof body.guiding_question === "string" ? body.guiding_question.trim() : "";
  if (!question || question.length > 400 || !textHasHebrew(question)) {
    return { ok: false, reason: "guiding_question missing, too long, or not Hebrew" };
  }

  const options = normalizeOptions(body.options);
  if (!options || options.length !== 3) return { ok: false, reason: "options must be exactly 3" };
  for (const o of options) {
    if (!o.option_text || o.option_text.length > 300 || !textHasHebrew(o.option_text)) {
      return { ok: false, reason: "option_text missing, too long, or not Hebrew" };
    }
    if (o.feedback_text.length > 400 || (o.feedback_text && !textHasHebrew(o.feedback_text))) {
      return { ok: false, reason: "feedback_text too long or not Hebrew" };
    }
  }
  const correctCount = options.filter((o) => o.is_correct).length;
  if (correctCount !== 1) return { ok: false, reason: `exactly one option must be correct (got ${correctCount})` };

  const texts = [question, ...options.flatMap((o) => [o.option_text, o.feedback_text])];
  const forbidden = findForbiddenTerm(texts);
  if (forbidden) return { ok: false, reason: `forbidden terminology: ${forbidden}` };
  // A skeleton shows its result on the screen; what it hides is checked below.
  if (facts && !(facts.hidden_operands ?? []).length && leaksFinalAnswer(texts, facts)) return { ok: false, reason: "final answer leaked" };
  if (facts && facts.meeting === 1 && leaksAnswerInCounts(texts, facts.final_answer)) {
    return { ok: false, reason: "final answer leaked as block counts" };
  }
  if (facts && (facts.hidden_operands ?? []).some((n) => texts.some((t) => containsNumberToken(t, n) || t.includes(formatNumberHe(n))))) {
    return { ok: false, reason: "hidden digits leaked" };
  }
  if (facts && findAbsentAid(texts, facts.blocks_on_screen !== false)) return { ok: false, reason: "names an aid that is not on the screen" };
  // A skeleton's hidden DIGIT, for its column ("ספרת העשרות החסרה היא 8", "8 עשרות").
  if (facts && facts.columns.length) {
    for (const c of facts.columns) {
      const hiddenHere: [string, number][] = [[c.shown_a, c.digit_a], [c.shown_b, c.digit_b]];
      for (const h of facts.hidden_result_digits ?? []) if (h.column === c.column) hiddenHere.push(["▢", h.digit]);
      for (const [shown, digit] of hiddenHere) {
        if (shown !== "▢") continue;
        const noun = BLOCK_NOUN_HE[c.column];
        const one = ONE_BLOCK_HE[c.column];
        const re = new RegExp(`(^|[^0-9])${digit}\\s+(לבני\\s+)?${noun}|ספרת ה${noun}[^.?!]{0,25}(^|[^0-9])${digit}(?![0-9])${digit === 1 ? `|${one}` : ""}`);
        if (texts.some((t) => re.test(t))) return { ok: false, reason: "hidden digits leaked" };
      }
    }
  }
  // The frame's level: a level-1 card names no column, in its question or in its right option.
  if (facts?.card_frame?.level === 1) {
    const right = options.find((o) => o.is_correct);
    if ([question, right?.option_text ?? ""].some((t) => /טור ה(יחידות|עשרות|מאות|אלפים)/.test(t))) {
      return { ok: false, reason: "frame: this is a level-1 card — the question and the right option must not name a column" };
    }
  }
  // Meeting 1: the child finds the column (owner, 29.9.2026) — the question names none.
  if (facts && facts.meeting === 1 && /טור ה(יחידות|עשרות|מאות|אלפים)/.test(question)) {
    return { ok: false, reason: "counts: meeting 1 — the guiding question must not name a column; the child finds it" };
  }
  // What the child is asked to find on a representation task (s3_r_t3's 45, s7_r_t6's 510).
  const secrets = (facts?.secret_numbers ?? []).filter((n) => n !== 10 && n !== 100 && n !== 1000);
  if (secrets.some((n) => texts.some((t) => containsNumberToken(t, n)))) {
    return { ok: false, reason: "secret number leaked" };
  }
  // …and written as blocks, on a task that is not an addition or a subtraction
  // (where the board, both numbers built, is worth the result and naming it is
  // the coaching — the client draws the same line).
  if (facts && !facts.operation && secretInBlockCounts(texts, secrets) !== null) {
    return { ok: false, reason: "secret number leaked as block counts — even the instruction's own blocks give the number away; ask about the blocks without listing them" };
  }

  // The card's form and language (owner, 30.9 and 1.10.2026): checked here,
  // so a card that breaks them gets the one retry instead of reaching the
  // client and being refused there for good.
  const form = cardFormViolation({ guiding_question: question, options });
  if (form) return { ok: false, reason: form };
  const lang = languageViolation(texts);
  if (lang) return { ok: false, reason: `language: ${lang.id} — ${lang.fix}` };
  if (facts && facts.memory_circles_on_screen === false && texts.some((t) => /עיגול(י)? (ה)?זיכרון/.test(t))) {
    return { ok: false, reason: 'screen: this task has no memory circles — do not mention "עיגול הזיכרון"' };
  }
  // Stations 1 and 3–7: the child counts the blocks; a card that gives a
  // column's current count is refused (the client refuses it too).
  if (facts && facts.blocks_on_screen && facts.meeting !== null && (facts.meeting === 1 || (facts.meeting >= 3 && facts.meeting <= 7))) {
    const counts = Object.fromEntries(facts.columns.map((c) => [c.column, c.blocks_on_board])) as Record<SocraticColumn, number>;
    const skip = [
      ...(facts.active ? [facts.active.digit_a, facts.active.digit_b] : []),
      ...numbersIn(facts.instruction_he ?? ""),
    ];
    const col = boardCountStated(texts, counts, skip);
    if (col) return { ok: false, reason: `counts: the card states how many blocks ${COLUMN_NAME_HE[col]} holds — the child counts them; ask instead` };
  }

  const ids: SocraticOption["id"][] = ["opt_1", "opt_2", "opt_3"];
  return {
    ok: true,
    value: {
      error_category: category as SocraticErrorCategory,
      guiding_question: question,
      options: [0, 1, 2].map((i) => ({
        id: ids[i],
        option_text: options[i].option_text,
        feedback_text: options[i].feedback_text,
        is_correct: options[i].is_correct,
      })) as [SocraticOption, SocraticOption, SocraticOption],
    },
  };
}

/** The shape the pre-contract client parser reads (final_intervention.options[].text). */
export function toLegacyIntervention(res: SocraticResponse) {
  return {
    error_category: res.error_category,
    guiding_question: res.guiding_question,
    options: res.options.map((o, i) => ({
      id: String(i + 1),
      text: o.option_text,
      feedback: o.feedback_text,
      is_correct: o.is_correct,
    })),
  };
}
