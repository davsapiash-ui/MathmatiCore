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

import { cardFormViolation, cardStyleViolation, languageViolation, socraticLanguageSpec, socraticStyleSpec } from "./socraticLanguage";

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

/** One block of a column with the article: "העשרת", "המאה", "האלף". */
const THE_BLOCK_HE: Record<SocraticColumn, string> = {
  units: "היחידה",
  tens: "העשרת",
  hundreds: "המאה",
  thousands: "האלף",
};

/** What a break of one block of the column on the left gives this column: "עשר יחידות", "עשר עשרות", "עשר מאות". */
const TEN_BLOCKS_HE: Record<SocraticColumn, string> = {
  units: "עשר יחידות",
  tens: "עשר עשרות",
  hundreds: "עשר מאות",
  thousands: "עשרה אלפים",
};

/** "אלף" is masculine; "יחידה", "עשרת", "מאה" are feminine. */
const isMasculine = (c: SocraticColumn) => c === "thousands";

const PREV_COLUMN: Record<SocraticColumn, SocraticColumn | null> = { units: null, tens: "units", hundreds: "tens", thousands: "hundreds" };

/**
 * What an addition's grouping passes INTO a column: one block of THAT column —
 * "העשרת שעברה מטור היחידות", "המאה שעברה מטור העשרות", "האלף שעבר מטור
 * המאות" (review of 1.10.2026: every column used to receive "העשרת").
 */
export function carryIntoHe(column: SocraticColumn): string {
  const from = PREV_COLUMN[column];
  return `${THE_BLOCK_HE[column]} ש${isMasculine(column) ? "עבר" : "עברה"}${from ? ` מ${COLUMN_NAME_HE[from]}` : ""}`;
}

const NEXT_COLUMN_OF: Record<SocraticColumn, SocraticColumn | null> = { units: "tens", tens: "hundreds", hundreds: "thousands", thousands: null };

/** What a subtraction's break in `column` is: "פורטים מאה אחת לעשר עשרות" (the block of the column on its left). */
export function breakIntoHe(column: SocraticColumn): string | null {
  const from = NEXT_COLUMN_OF[column];
  return from ? `פורטים ${ONE_BLOCK_HE[from]} ל${TEN_BLOCKS_HE[column]}` : null;
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
  /**
   * The learner's support settings (phase 2, 1.10.2026): the enhanced
   * cognitive-support profile and the quiet mode. Two booleans — no name, no
   * diagnosis — so the card is written shorter and more concrete.
   */
  learner_profile?: { enhanced?: boolean; quiet?: boolean };
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
        ? { earlier_card_kinds: ps.earlier_card_kinds.filter((k): k is string => typeof k === "string" && /^[a-z0-9_]{1,40}$/.test(k)).slice(0, 8) }
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
      ...(isPlainObject(raw.learner_profile)
        ? { learner_profile: { enhanced: raw.learner_profile.enhanced === true, quiet: raw.learner_profile.quiet === true } }
        : {}),
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
  /** The enhanced profile or the quiet mode is on: shorter, more concrete wording. */
  concise: boolean;
  /** The exercise's id (request.exercise_id) — rules that belong to one exercise read it (s1_target_347). */
  exercise_id?: string | null;
  /** The exercise's title (exercise_context.session_topic): a card never repeats it (owner, 2.10.2026). */
  title_he?: string | null;
  /**
   * addition: what passes into the active column and where it really is — in
   * the memory circle above it, already on the board after the grouping, or
   * nowhere yet ("" when the active column receives nothing). Named with the
   * receiving column's own block: a hundred into the hundreds, a thousand into
   * the thousands (review of 1.10.2026).
   */
  carry_state_he: string;
  /**
   * A two-step representation task ("בנו 340, הוסיפו 2 מאות, ואז הסירו 3
   * עשרות"): the instruction's steps, the value after each, and which of them
   * the board already reflects. null when the instruction has no such steps.
   */
  instruction_steps: InstructionSteps | null;
  /**
   * 10 or more blocks in a column is the intended intermediate state: a break
   * done so that the pending step can take blocks away. A card that tells the
   * child to group them back is refused while this holds.
   */
  crowding_intended: boolean;
  /** Deterministic reading of the situation, offered to the model as the primary hypothesis. */
  suggested_category: SocraticErrorCategory;
  suggested_focus_he: string;
}

/** One step of a representation instruction: build a number, add or remove blocks of one kind. */
export interface InstructionStep {
  kind: "build" | "add" | "remove";
  /** add / remove: the column whose blocks are added or removed. */
  column: SocraticColumn | null;
  /** build: the number; add / remove: how many blocks. */
  amount: number;
  /** The board's value once this step is done. */
  value_after: number;
}

export interface InstructionSteps {
  steps: InstructionStep[];
  /** How many steps the board reflects (0 … steps.length), or null when the board is on none of the instruction's ways. */
  done: number | null;
  /** The pending step is under way (some of the blocks added or removed). */
  partial: boolean;
  /** A remove step is pending and its column holds fewer blocks than it takes: a block of the column on its left must be broken first. */
  needs_break: boolean;
  /** The break for the pending remove step is done: its column holds 10 or more on purpose. */
  break_done: boolean;
  /** The column that holds 10 or more on purpose (break_done), or null. */
  break_column: SocraticColumn | null;
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

const PLACE_VALUE: Record<SocraticColumn, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };
const NOUN_COLUMN: Record<string, SocraticColumn> = {
  "יחידות": "units", "עשרות": "tens", "מאות": "hundreds", "אלפים": "thousands",
  "יחידה": "units", "עשרת": "tens", "מאה": "hundreds", "אלף": "thousands",
};
/** Number words an instruction may use for an amount of blocks ("שתי מאות", "שלושה אלפים"). */
const AMOUNT_WORD: Record<string, number> = {
  "שתי": 2, "שני": 2, "שלוש": 3, "שלושה": 3, "שלושת": 3, "ארבע": 4, "ארבעה": 4, "ארבעת": 4, "חמש": 5, "חמישה": 5, "חמשת": 5,
  "שש": 6, "שישה": 6, "ששת": 6, "שבע": 7, "שבעה": 7, "שבעת": 7, "שמונה": 8, "שמונת": 8, "תשע": 9, "תשעה": 9, "תשעת": 9,
};
const STEP_RE = /(הוסיפו|הסירו|הוציאו)\s+(?:(\d+|שתי|שני|שלוש|שלושה|שלושת|ארבע|ארבעה|ארבעת|חמש|חמישה|חמשת|שש|שישה|ששת|שבע|שבעה|שבעת|שמונה|שמונת|תשע|תשעה|תשעת)\s+(יחידות|עשרות|מאות|אלפים)|(יחידה|עשרת|מאה)\s+אחת|(אלף)\s+אחד)/g;

/**
 * The steps of a representation instruction that builds a number and then
 * adds and removes blocks — "בנו את המספר 340 בבית המספרים. הוסיפו 2 מאות,
 * ואז הסירו 3 עשרות" (s7_r_t6), "בנו את המספר 3,400 … הוסיפו אלף אחד, ואז
 * הסירו 6 מאות" (s7_g_t5). Read from the exercise bank's own text, so the
 * values after each step are derived from the task, never guessed. null when
 * the instruction has no add / remove step, or when its steps do not end on
 * the board the task asks for.
 */
export function instructionStepsOf(instruction: string, required?: SocraticCounts): InstructionStep[] | null {
  const text = stripDigitGroupSeparators(instruction);
  const build = /בנו(?:\s+בבית המספרים)?\s+את המספר\s+(\d+)/.exec(text);
  if (!build) return null;
  const steps: InstructionStep[] = [{ kind: "build", column: null, amount: Number(build[1]), value_after: Number(build[1]) }];
  for (const m of text.slice(build.index + build[0].length).matchAll(STEP_RE)) {
    const column = NOUN_COLUMN[m[3] ?? m[4] ?? m[5]];
    const amount = m[2] ? (/^\d+$/.test(m[2]) ? Number(m[2]) : AMOUNT_WORD[m[2]]) : 1;
    if (!column || !amount) return null;
    const before = steps[steps.length - 1].value_after;
    const kind = m[1] === "הוסיפו" ? "add" : "remove";
    const after = kind === "add" ? before + amount * PLACE_VALUE[column] : before - amount * PLACE_VALUE[column];
    if (after < 0) return null;
    steps.push({ kind, column, amount, value_after: after });
  }
  if (steps.length < 2) return null;
  if (required) {
    const want = SOCRATIC_COLUMNS.reduce((s, c) => s + (required[c] ?? 0) * PLACE_VALUE[c], 0);
    if (want !== steps[steps.length - 1].value_after) return null;
  }
  return steps;
}

/** Where the board stands on the instruction's steps. */
export function instructionStageOf(steps: InstructionStep[], blocks: Record<SocraticColumn, number>): InstructionSteps {
  const v = SOCRATIC_COLUMNS.reduce((s, c) => s + blocks[c] * PLACE_VALUE[c], 0);
  let done: number | null = null;
  let partial = false;
  if (v === 0) done = 0;
  else {
    for (let i = steps.length - 1; i >= 0 && done === null; i--) if (v === steps[i].value_after) done = i + 1;
    for (let i = 1; i < steps.length && done === null; i++) {
      const s = steps[i];
      const before = steps[i - 1].value_after;
      const unit = PLACE_VALUE[s.column!];
      if (v > Math.min(before, s.value_after) && v < Math.max(before, s.value_after) && (v - before) % unit === 0) {
        done = i;
        partial = true;
      }
    }
    if (done === null && v < steps[0].value_after) {
      done = 0;
      partial = true;
    }
  }
  // A remove step needs a break when its column cannot give what it takes
  // from the number as it stands before the step (3,400 + 1,000 has 4
  // hundreds, 6 are removed): while it is pending, 10 or more in that column
  // is the break done on purpose — never "group them back".
  let needs_break = false;
  let break_done = false;
  let break_column: SocraticColumn | null = null;
  if (done !== null && done < steps.length) {
    for (let i = Math.max(1, done); i < steps.length; i++) {
      const s = steps[i];
      if (s.kind !== "remove" || !s.column) continue;
      const before = steps[i - 1].value_after;
      const standard = Math.floor(before / PLACE_VALUE[s.column]) % 10;
      if (standard >= s.amount) continue;
      const left = i === done && partial ? (v - s.value_after) / PLACE_VALUE[s.column] : s.amount;
      if (blocks[s.column] >= 10 && blocks[s.column] >= left) {
        break_done = true;
        break_column = s.column;
      } else if (i === done) needs_break = blocks[s.column] < left;
    }
  }
  return { steps, done, partial, needs_break, break_done, break_column };
}

const STEP_VERB_HE: Record<InstructionStep["kind"], string> = { build: "בונים", add: "מוסיפים", remove: "מסירים" };
/** "מסירים 6 מאות", "מוסיפים אלף אחד", "בונים את המספר 3,400". */
function stepHe(s: InstructionStep): string {
  if (s.kind === "build") return `בונים את המספר ${formatNumberHe(s.amount)}`;
  return `${STEP_VERB_HE[s.kind]} ${countHe(s.amount, s.column!)}`;
}

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
  // A two-step instruction (build, add, remove): the board is read against
  // the step it has reached, not against the final board — after a correct
  // first step the final board "lacks" blocks, and after the break of
  // s7_g_t5 it "has too many" (review of 1.10.2026).
  const stepsList = !ec && tc ? instructionStepsOf(tc.instruction_he, tc.required_counts) : null;
  const instruction_steps = stepsList ? instructionStageOf(stepsList, blocks) : null;
  const stepsPending = Boolean(instruction_steps && instruction_steps.done !== instruction_steps.steps.length);
  if (!ec && tc?.required_counts && blocks_on_screen) {
    built_before_conversion = Boolean(tc.start_counts && sameCounts(tc.start_counts, blocks) && !sameCounts(tc.required_counts, blocks));
    board_matches_task = sameCounts(tc.required_counts, blocks);
    const target = tc.conversion_done === false && tc.start_counts ? tc.start_counts : tc.required_counts;
    if (!stepsPending) {
      board_vs_task = {};
      for (const c of SOCRATIC_COLUMNS) {
        const want = target[c] ?? 0;
        const have = blocks[c];
        if (want === 0 && have === 0) continue;
        board_vs_task[c] = have === want ? "match" : have > want ? "more" : "less";
      }
    }
  }
  const crowding_intended = Boolean(blocks_on_screen && instruction_steps?.break_done);

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
  // What passes into the active column is one block of THAT column (a hundred
  // into the hundreds), and the facts say where it really is: in the memory
  // circle above the column, on the board after the grouping, or nowhere yet
  // (review of 1.10.2026: "written in the memory circle" with the circle empty).
  const carryInto = ec && ec.operation === "addition" && active && active.carry_in > 0 ? active.column : null;
  const carryFrom = carryInto ? PREV_COLUMN[carryInto] : null;
  const carryNounHe = carryInto ? (meeting1 ? `${THE_BLOCK_HE[carryInto]} ש${isMasculine(carryInto) ? "עבר" : "עברה"} מהטור שמימין` : carryIntoHe(carryInto)) : "";
  const carryHe = carryInto ? ` ועוד ${carryNounHe}` : "";
  let carry_state_he = "";
  if (carryInto && carryFrom) {
    const col = meeting1 ? "הטור" : COLUMN_NAME_HE[carryInto];
    const fromHe = meeting1 ? "הטור שמימין" : COLUMN_NAME_HE[carryFrom];
    const circle = memory[carryInto];
    const m = isMasculine(carryInto);
    if (circle === 1) {
      carry_state_he = `${THE_BLOCK_HE[carryInto]} ש${m ? "עבר" : "עברה"} מ${fromHe} ${m ? "רשום" : "רשומה"} בעיגול הזיכרון שמעל ${col}.`;
    } else if (circle !== undefined && circle > 1) {
      carry_state_he = `בעיגול הזיכרון שמעל ${col} רשום ${circle}: רישום שגוי.`;
    } else if (blocks_on_screen && conversionsDone.has(carryFrom)) {
      carry_state_he = `עיגול הזיכרון שמעל ${col} ריק, אבל ההקבצה ב${fromHe} כבר בוצעה: ${THE_BLOCK_HE[carryInto]} ש${m ? "נוצר" : "נוצרה"} בה ${m ? "נמצא" : "נמצאת"} בבית המספרים, ב${col}.`;
    } else if (blocks_on_screen) {
      carry_state_he = `ההקבצה ב${fromHe} עוד לא בוצעה בלבנים, ועיגול הזיכרון שמעל ${col} ריק.`;
    } else {
      carry_state_he = `עיגול הזיכרון שמעל ${col} ריק: ההמרה של ${fromHe} לא נרשמה בו.`;
    }
  }
  const solvedHe = completed.length ? ` (${completed.map((c) => COLUMN_NAME_HE[c]).join(", ")} כבר נפתר)` : "";

  if (wrong_carry_circles.length && ec) {
    suggested_category = "conceptual";
    const w = wrong_carry_circles[0];
    const from = PREV_COLUMN[w];
    suggested_focus_he = from
      ? `בעיגול הזיכרון שמעל ${COLUMN_NAME_HE[w]} רשום ${memory[w]}. בחיבור ${isMasculine(w) ? "עובר" : "עוברת"} מ${COLUMN_NAME_HE[from]} ל${COLUMN_NAME_HE[w]} לכל היותר ${ONE_BLOCK_HE[w]}, ולכן זה רישום שגוי — כוון לבדוק מה רושמים בעיגול הזיכרון, בלי לומר את הספרה.`
      : `בעיגול הזיכרון שמעל טור היחידות רשום ${memory[w]}, אבל בחיבור לא עוברת המרה אל טור היחידות — זה רישום שגוי. כוון לבדוק מה רושמים בעיגול הזיכרון ומעל איזה טור, בלי לומר את הספרה.`;
  } else if (trigger === "conversion_not_performed") {
    suggested_category = "procedural";
    suggested_focus_he = blocks_on_screen
      ? "הלומד ניסה להקליד תוצאה בטור שדורש הקבצה או פריטה לפני שביצע את ההמרה בלבנים."
      : "הלומד ניסה להקליד תוצאה בטור שדורש המרה או פריטה לפני שרשם אותה בעיגול הזיכרון.";
  } else if (typing_pattern === "carry_forgotten" && active && carryInto && carryFrom) {
    suggested_category = "procedural";
    const fromHe = meeting1 ? "הטור שמימין" : COLUMN_NAME_HE[carryFrom];
    const circle = memory[carryInto];
    const base = `${inCol(active.column)} הספרה שהלומד הקליד מתאימה לחיבור בלי ${carryNounHe}.`;
    suggested_focus_he = circle === 1
      ? `${base} ${carry_state_he} כוון להוסיף לחיבור את מה שרשום בעיגול הזיכרון, בלי לומר את הספרה.`
      : blocks_on_screen && conversionsDone.has(carryFrom)
        ? `${base} ${carry_state_he} כוון לבית המספרים: לספור את הלבנים בטור הזה ולשאול מה הגיע אליו מההקבצה ב${fromHe} — לא לעיגול הזיכרון הריק.`
        : blocks_on_screen
          ? `${base} ${carry_state_he} כוון אל ${fromHe}: מה עושים כשיש בו 10 לבנים או יותר.`
          : `${base} ${carry_state_he} כוון לבדוק אם החיבור ב${fromHe} עובר את 9, ומה רושמים אז בעיגול הזיכרון שמעל הטור הזה — בלי לומר את הספרה.`;
  } else if (typing_pattern === "reversed_subtraction" && active) {
    suggested_category = "procedural";
    suggested_focus_he = `${inCol(active.column)} הספרה שהלומד הקליד היא חיסור הפוך — הספרה העליונה מהתחתונה — במקום פריטה.`;
  } else if (trigger === "consecutive_errors_4" && active && ec && (!activeNeedsConversion || conversionWritten)) {
    suggested_category = "calculation";
    suggested_focus_he = activeNeedsConversion
      ? `${inCol(active.column)} ההמרה כבר ${blocks_on_screen ? "בוצעה" : "רשומה בעיגול הזיכרון"}, והלומד טעה בהקלדה ארבע פעמים — הטעות בחישוב הטור עצמו${meeting1 ? "" : ` (${subProblemHe}${ec.operation === "subtraction" ? " אחרי הפריטה" : ""})`}.`
      : `${meeting1 ? "הטור" : `הטור הפעיל (${COLUMN_NAME_HE[active.column]}, ${subProblemHe}${carryHe})`} אינו דורש המרה, והלומד טעה בהקלדה ארבע פעמים — כנראה טעות בעובדת החשבון של הטור.${carry_state_he ? ` ${carry_state_he}` : ""}`;
  } else if (trigger === "consecutive_undos_3" && !blocks_on_screen && ec && active) {
    suggested_category = "conceptual";
    suggested_focus_he = `הלומד ביטל שלוש פעולות ברצף ב${COLUMN_NAME_HE[active.column]} (תת-תרגיל ${subProblemHe}${carryHe})${solvedHe} — סימן לניחוש או לחוסר ביטחון.${carry_state_he ? ` ${carry_state_he}` : ""} כוון לפתור את הטור הזה בעצמם, בלי לנחש, ובלי לומר את הספרה.`;
  } else if (!blocks_on_screen && ec && active && activeNeedsConversion && !active.completed) {
    suggested_category = "procedural";
    suggested_focus_he = conversionWritten
      ? ec.operation === "subtraction"
        ? `ב${COLUMN_NAME_HE[active.column]} הפריטה כבר רשומה בעיגול הזיכרון. הצעד הבא: לחסר ${active.shown_b} מהמספר שבעיגול הזיכרון ולכתוב את התוצאה בתיבה של הטור — אל תשאל שוב על הפריטה.`
        : `ב${COLUMN_NAME_HE[active.column]} ההמרה כבר רשומה בעיגול הזיכרון שמעל הטור הבא. הצעד הבא: לכתוב בתיבה של הטור רק את ספרת היחידות של הסכום — אל תשאל שוב על ההמרה.`
      : ec.operation === "subtraction"
        ? `ב${COLUMN_NAME_HE[active.column]} צריך לחסר ${active.shown_b} מ-${active.shown_a} — נדרשת פריטה (${breakIntoHe(active.column) ?? "מהטור השכן"}), ורישום השינוי בעיגולי הזיכרון.`
        : `ב${COLUMN_NAME_HE[active.column]} החיבור ${subProblemHe}${carryHe} עובר את 9 — נדרשת המרה, ורישום שלה בעיגול הזיכרון שמעל הטור הבא.${carry_state_he ? ` ${carry_state_he}` : ""}`;
  } else if (!blocks_on_screen && ec && active && !active.completed) {
    suggested_category = trigger === "repeated_errors" ? "calculation" : "procedural";
    suggested_focus_he = `ב${COLUMN_NAME_HE[active.column]} התרגיל הוא ${subProblemHe}${carryHe}${solvedHe}.${carry_state_he ? ` ${carry_state_he}` : ""} כוון לחישוב בטור הזה, בלי לומר את הספרה.`;
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
  } else if (instruction_steps && stepsPending) {
    // A two-step instruction, not finished: the next step of the instruction,
    // never "the board lacks / has too many" against its final board.
    suggested_category = "procedural";
    const st = instruction_steps;
    if (st.done === null) {
      suggested_focus_he = `בית המספרים לא נמצא באף שלב של ההנחיה (${st.steps.map(stepHe).join(", ואז ")}). כוון לקרוא שוב את ההנחיה ולבדוק איזה צעד כבר נעשה ועל איזו לבנה — בלי לומר את המספר שיתקבל.`;
    } else {
      const next = st.steps[st.done];
      const doneHe = st.done === 0
        ? (st.partial ? "המספר הראשון שבהנחיה עוד לא בנוי בשלמותו" : "בית המספרים ריק")
        : `בית המספרים מראה ${st.done === 1 ? "את הצעד הראשון של ההנחיה" : `את ${st.done} הצעדים הראשונים של ההנחיה`} (${st.steps.slice(0, st.done).map(stepHe).join(", ")})`;
      const left = next.column ? NEXT_COLUMN[next.column] : null;
      const breakHe = st.needs_break && next.column && left
        ? ` — אבל ב${COLUMN_NAME_HE[next.column]} אין מספיק ${BLOCK_NOUN_HE[next.column]} כדי להסיר: קודם פורטים ${ONE_BLOCK_HE[left]} ל${TEN_BLOCKS_HE[next.column]} (המספר לא משתנה), ואחר כך מסירים`
        : "";
      const crowdedHe = st.break_done && st.break_column
        ? ` הפריטה שההסרה צריכה כבר נעשתה: 10 לבנים או יותר ב${COLUMN_NAME_HE[st.break_column]} הם שלב בדרך, בכוונה. אסור להציע לקבץ אותן בחזרה.`
        : "";
      suggested_focus_he = `${doneHe}. הצעד ${st.partial ? "שבאמצע הביצוע" : "הבא"} בהנחיה: ${stepHe(next)}${breakHe}.${crowdedHe} כוון לצעד הזה בלבד, בלי לומר את המספר שיתקבל.`;
    }
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
      ? `${inCol(active.column)} אין מספיק לבנים כדי לחסר ${meeting1 ? "" : active.shown_b + " "}— נדרשת פריטה ${meeting1 || !breakIntoHe(active.column) ? "של לבנה מהטור השכן הגדול יותר" : `(${breakIntoHe(active.column)})`}.`
      : `ב${COLUMN_NAME_HE[active.column]} צריך לחסר ${active.shown_b} אבל בבית המספרים יש רק ${countHe(active.blocks_on_board, active.column)} — נדרשת פריטה (${breakIntoHe(active.column) ?? "מהטור השכן הגדול יותר"}).`;
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
    title_he: ec?.session_topic || null,
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
    carry_state_he,
    instruction_steps,
    crowding_intended,
    earlier_card_kinds: ps?.earlier_card_kinds ?? [],
    card_frame: req.card_frame ?? null,
    concise: Boolean(req.learner_profile?.enhanced || req.learner_profile?.quiet),
    exercise_id: req.exercise_id ?? null,
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

HEBREW. Natural, grammatically flawless Hebrew for children: short, warm, empowering sentences; exact gender/number agreement (4 מאות, 2 עשרות, 5 יחידות, 10 עשרות, עשרת אחת, מאה אחת, אלף אחד). A grouping passes ONE block of the receiving column (into the hundreds "מאה אחת", into the thousands "אלף אחד"); a break gives ten blocks of the column on its right ("פורטים מאה אחת לעשר עשרות"). Address the learner in the second person plural, gender-neutral, in every instruction and feedback ("בדקו", "פרטו", "לחצו"); gender-equal writing means the second person plural only, never split, dot or slash gender forms. Phrase the guiding question impersonally ("מה עושים?", "איך מגלים?") or in the second person plural. Write answer options that describe an action in the impersonal present plural ("מקבצים", "פורטים", "משתמשים"). NEVER use the first person plural ("נבדוק", "נפרוט", "מה נעשה", "בואו נ…") and never the second person singular ("שים לב", "בדוק", "בדקי"). The guiding question and every hint are DIRECT questions that end with "?". An indirect question inside a sentence takes "אם", not "האם", and ends with a period, not "?" ("בדקו אם צריך לרשום משהו בעיגול הזיכרון.") — use it only inside the correct option's feedback; a prefix letter stays outside quotation marks (ל"שורת התוצאה", never "לשורת התוצאה" inside the quotes).
TERMINOLOGY (Ministry of Education): subtraction regrouping is "פריטה" ONLY (never שבירה / הלוואה / לווים); addition regrouping is "המרה" / "הקבצה" ONLY, the verb "מקבצים" (never נשיאה); the workspace is "בית המספרים" with "טור היחידות / טור העשרות / טור המאות / טור האלפים"; tools are "עיגולי הזיכרון" and "פח האשפה". The blocks are "לבנים" ONLY ("לבנה" in the singular; never "קוביות", "קובייה", "בלוק" or "בלוקים"), and the board is "בית המספרים" ONLY (never "לוח הדינס", "לוח הלבנים" or "קנבס"). Never mention physical objects that do not exist on screen (מקלות, חרוזים, אצבעות, מטבעות, חשבונייה).
${LANGUAGE_SLOT}

IRON RULES:
- NEVER state or imply the final numeric answer of the exercise, and never state the result digit of the active column. Guide the next ACTION only.
- NEVER ask a generic or detached question ("I see X blocks, what next?"). Name the exercise, the active column sub-problem and the board state in the question itself — the exercise by its numbers, never by its title.
- Exactly ONE guiding question and exactly THREE closed options: exactly one correct next action, two plausible mistakes that mirror the diagnosed category.
- The feedback of a WRONG option starts with "רמז:" and is ONE short guiding QUESTION that ends with "?" — it may open with a short invitation to try something on the screen, but it NEVER explains, NEVER states the rule or the correct action, and NEVER gives the answer or any digit of it ("רמז: מאיזו ספרה מחסרים: מהספרה העליונה או מהתחתונה?", never "רמז: בחיסור מחסרים את הספרה התחתונה מהעליונה."). It is warm and judgment-free (UDL). The correct option's feedback starts with "נכון מאוד!", confirms and names the concrete on-screen action.
- Never act as a chatbot, never address the learner by name, never reveal any personal data.
- Output ONLY the JSON object requested. No prose outside JSON.`;

// The language rules, then the style: correctness and clarity first, static cards as examples, the ✗ → ✓ faults (2.10.2026). Meeting 1 gets examples that name no column.
const withLanguage = (core: string, blocks: boolean, meeting1 = false) => core.replace(LANGUAGE_SLOT, `${socraticLanguageSpec(blocks)}\n${socraticStyleSpec(blocks, meeting1)}`);

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
    "Name the exercise, the active column sub-problem and the board state in the question itself —",
    "Name the exercise and the active column sub-problem in the question itself —"
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
    "Name the exercise, the active column sub-problem and the board state in the question itself —",
    "Name the exercise in the question itself, but never the column where the difficulty is and never how many blocks the board holds —"
  )
  .replace(
    "- Never act as a chatbot,",
    "- MEETING 1 (station 1): NEVER state how many blocks are in a column or on the board (no \"7 יחידות\", \"12 לבנים\", \"10 עשרות בטור העשרות\"), NEVER write any digit of the answer, and NEVER name the column where the difficulty is. The learner finds the counts and the column. Ask instead (\"באיזה טור אין מספיק לבנים כדי לחסר?\", \"באחד הטורים יש 10 לבנים או יותר. מה עושים?\").\n- Never act as a chatbot,"
  ), true, true);

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
    "Name the exercise, the active column sub-problem and the board state in the question itself —",
    "Name the exercise and the active column sub-problem in the question itself, but never how many blocks the board or a column holds —"
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

const BOARD_CONTROLS_TAIL_HE = [
  'גוררים לבנים מ"ארגז כלים" אל הטורים, וגם מטור לטור.',
  "לחיצה על לבנה פורטת אותה לעשר לבנים של הטור שמימין לה (אפשר גם לגרור אותה אל הטור שמימין לה).",
];
const BOARD_CONTROLS_END_HE = [
  'גוררים לבנים אל "פח האשפה" כדי להוציא אותן מבית המספרים.',
  '"כפתור ביטול הפעולה" מבטל את הפעולה האחרונה.',
];
const BOARD_CONTROLS_ALL_HE = [
  '"בית המספרים": טור היחידות, טור העשרות, טור המאות וטור האלפים.',
  ...BOARD_CONTROLS_TAIL_HE,
  'כשבטור יש 10 לבנים או יותר, מופיע בראש הטור הכפתור "קבצו 10" (על הכפתור כתוב "קבצו 10 לעשרת", "קבצו 10 למאה" או "קבצו 10 לאלף").',
  ...BOARD_CONTROLS_END_HE,
];
/**
 * Meeting 1 (station 1): three columns only — no thousands column, so no
 * "קבצו 10" button on the hundreds (client Module08_GroupButtonNeedsLeftColumn).
 */
const BOARD_CONTROLS_MEETING_1_HE = [
  '"בית המספרים": טור היחידות, טור העשרות וטור המאות בלבד. אין טור אלפים ואין לבנת אלף.',
  ...BOARD_CONTROLS_TAIL_HE,
  'כשבטור היחידות או בטור העשרות יש 10 לבנים או יותר, מופיע בראש הטור הכפתור "קבצו 10" (על הכפתור כתוב "קבצו 10 לעשרת" או "קבצו 10 למאה"). בטור המאות אין כפתור כזה.',
  ...BOARD_CONTROLS_END_HE,
];

/** What is on this child's screen, in the screen's own names. */
export function screenDescriptionHe(facts: Pick<SocraticFacts, "screen"> & Partial<Pick<SocraticFacts, "meeting">>): string[] {
  const BOARD_CONTROLS_HE = facts.meeting === 1 ? BOARD_CONTROLS_MEETING_1_HE : BOARD_CONTROLS_ALL_HE;
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
    const from = PREV_COLUMN[c.column];
    // What a column receives or gives, with the block of the right column: a hundred into the hundreds, a ten broken into ten units.
    if (facts.operation === "addition" && c.carry_in && from) parts.push(`מקבל ${ONE_BLOCK_HE[c.column]} מההמרה ב${COLUMN_NAME_HE[from]}`);
    if (facts.operation === "subtraction" && c.carry_in && from) parts.push(`נותן ${ONE_BLOCK_HE[c.column]} לפריטה ב${COLUMN_NAME_HE[from]}`);
    // The circle as it is: its number, or empty where something should be written above this column.
    if (facts.memory_circles[c.column] !== undefined) parts.push(`עיגול הזיכרון שמעליו: ${facts.memory_circles[c.column]}`);
    else if (c.carry_in || (facts.operation === "subtraction" && c.needs_conversion)) parts.push("עיגול הזיכרון שמעליו: ריק");
    if (c.needs_conversion) {
      parts.push(c.conversion_done
        ? "ההמרה בטור הזה כבר בוצעה"
        : facts.operation === "subtraction"
          ? `דורש פריטה (${breakIntoHe(c.column) ?? "מהטור השכן"})`
          : `דורש הקבצה (10 ${BLOCK_NOUN_HE[c.column]} ל${ONE_BLOCK_HE[NEXT_COLUMN[c.column] ?? c.column]})`);
    }
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
  if (facts.crowding_intended && c.blocks_on_board >= 10) parts.push("10 ומעלה בכוונה: הפריטה נעשתה כדי שאפשר יהיה להסיר — לא מקבצים בחזרה");
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
    // The conversion state is per column (fmtColumnFact: "ההמרה בטור הזה כבר
    // בוצעה"); the exercise-wide "a break was done" next to it contradicted
    // the column that still needs one (review of 1.10.2026), so it is gone.
    // A representation task says whether ITS conversion — the one its
    // instruction names — is done.
    if (!facts.operation && tc && typeof tc.conversion_done === "boolean" && tc.start_counts) {
      lines.push(tc.conversion_done ? "ההמרה שההנחיה מבקשת כבר נעשתה בלבנים." : "ההמרה שההנחיה מבקשת עוד לא נעשתה בלבנים.");
    }
    const st = facts.instruction_steps;
    if (st) {
      // The steps, without the value they end on: that is the number the child finds.
      const mark = (i: number) => (st.done === null ? "" : i < st.done ? " ✓ נעשה" : i === st.done ? (st.partial ? " ← באמצע הביצוע" : " ← הצעד הבא") : "");
      lines.push(`שלבי ההנחיה: ${st.steps.map((s, i) => `${i + 1}. ${stepHe(s)}${mark(i)}`).join("; ")}.`);
      if (st.done === null) lines.push("בית המספרים לא נמצא באף שלב של ההנחיה.");
      if (st.needs_break) lines.push("לצעד הבא אין מספיק לבנים בטור שממנו מסירים: קודם פורטים לבנה מהטור שמשמאלו (המספר לא משתנה), ואחר כך מסירים.");
      if (st.break_done && st.break_column) lines.push(`הפריטה שהצעד צריך כבר נעשתה: 10 לבנים או יותר ב${COLUMN_NAME_HE[st.break_column]} הם שלב בדרך, בכוונה. אסור להציע לקבץ אותן בחזרה.`);
    }
    for (const c of [...facts.columns].reverse()) {
      if (!facts.operation && c.blocks_on_board === 0 && !facts.board_vs_task?.[c.column]) continue;
      lines.push(fmtColumnFact(c, facts));
    }
  } else {
    // PRD Module 14 §ב: meeting 8 shows no blocks, no trash and no number house.
    lines.push(`=== עמוד 2: במפגש ${facts.meeting} אין לבנים על המסך ===`);
    lines.push("על המסך יש רק התרגיל במאונך, עיגולי הזיכרון שמעל הטורים ושורת התוצאה. אין לבנים, אין פח אשפה ואין בית מספרים.");
    lines.push("אסור להזכיר לבנים, פח אשפה, מחסן, הכפתור \"קבצו 10\" או בית המספרים. כוונו לעיגולי הזיכרון ולשורת התוצאה בלבד.");
    if (facts.operation) {
      for (const c of [...facts.columns].reverse()) {
        const sub = facts.operation === "subtraction" ? `${c.shown_a} − ${c.shown_b}` : `${c.shown_a} + ${c.shown_b}`;
        const from = PREV_COLUMN[c.column];
        const flow = c.carry_in && from
          ? facts.operation === "subtraction"
            ? ` | נותן ${ONE_BLOCK_HE[c.column]} לפריטה ב${COLUMN_NAME_HE[from]}`
            : ` | מקבל ${ONE_BLOCK_HE[c.column]} מההמרה ב${COLUMN_NAME_HE[from]}`
          : "";
        const circle = facts.memory_circles[c.column] !== undefined
          ? ` | עיגול הזיכרון שמעליו: ${facts.memory_circles[c.column]}`
          : c.carry_in || (facts.operation === "subtraction" && c.needs_conversion) ? " | עיגול הזיכרון שמעליו: ריק" : "";
        const conv = c.needs_conversion && c.shown_a !== "▢" && c.shown_b !== "▢"
          ? facts.operation === "subtraction" ? ` | דורש פריטה (${breakIntoHe(c.column) ?? "מהטור השכן"})` : " | דורש המרה"
          : "";
        lines.push(`  - ${COLUMN_NAME_HE[c.column]}: תת-תרגיל ${sub}${flow}${circle}${conv} | ${c.completed ? "הטור כבר נפתר נכון" : c.column === facts.active_column ? "<< הטור הפעיל" : "טרם נפתר"}`);
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
    // The circles as they are, in the screen's names: "מעל טור העשרות: 1".
    const circles = SOCRATIC_COLUMNS.filter((c) => facts.memory_circles[c] !== undefined).reverse();
    lines.push(`עיגולי הזיכרון: ${circles.length ? circles.map((c) => `מעל ${COLUMN_NAME_HE[c]}: ${facts.memory_circles[c]}`).join("; ") : "כולם ריקים"}.`);
    if (facts.carry_state_he) lines.push(`ההמרה שנכנסת לטור הפעיל: ${facts.carry_state_he}`);
  }
  lines.push(`שגיאות רצופות: ${facts.consecutive_errors}.`);
  for (const w of facts.wrong_carry_circles) {
    const from = PREV_COLUMN[w];
    lines.push(from
      ? `רישום שגוי: בעיגול הזיכרון שמעל ${COLUMN_NAME_HE[w]} רשום ${facts.memory_circles[w]}, אבל בחיבור ${isMasculine(w) ? "עובר" : "עוברת"} מ${COLUMN_NAME_HE[from]} ל${COLUMN_NAME_HE[w]} לכל היותר ${ONE_BLOCK_HE[w]} — אל תחבר את המספר הזה כהמרה.`
      : `רישום שגוי: בעיגול הזיכרון שמעל טור היחידות רשום ${facts.memory_circles[w]}, אבל בחיבור לא עוברת המרה אל טור היחידות.`);
  }
  if (facts.hesitation_seconds) lines.push(`זמן בלי פעולה לפני הכרטיס: ${facts.hesitation_seconds} שניות.`);
  if (facts.concise) lines.push("הלומד עובד בפרופיל תמיכה מוגבר או במצב שקט: כתבו קצר ומוחשי במיוחד — שאלה של עד 12 מילים, כל אפשרות עד 6 מילים, כל משוב משפט אחד, ורק פעולות שרואים על המסך.");
  if (facts.typing_pattern === "carry_forgotten") {
    lines.push(`דפוס בהקלדה: הספרה השגויה בטור הפעיל מתאימה לחיבור בלי ${facts.meeting === 1 ? "הלבנה שעברה מהטור שמימין" : carryIntoHe(facts.active_column)}.${facts.carry_state_he ? ` ${facts.carry_state_he}` : ""}`);
  }
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
  "guiding_question": "<שאלה מנחה אחת קצרה בעברית, עד 14 מילים אחרי «נסו לחשוב:», המזכירה ${facts.meeting === 1 || facts.card_frame?.level === 1 ? "את התרגיל, בלי לציין שם של טור, " : facts.operation ? "את התרגיל, את הטור הפעיל " : "את המספר שבהנחיה או את מה שבבית המספרים (לא את כותרת המשימה ולא את משפט ההנחיה) "}${facts.blocks_on_screen ? (facts.meeting !== null && (facts.meeting === 1 || (facts.meeting >= 3 && facts.meeting <= 7)) ? "ואת מצב הלבנים, בלי לכתוב כמה לבנים יש בטור" : "ואת מצב הלבנים") : "ואת עיגולי הזיכרון"}>",
  "options": [
    { "id": "opt_1", "option_text": "<פעולה קצרה בעברית, עד 10 מילים>", "feedback_text": "<משוב בעברית, עד 16 מילים>", "is_correct": true|false },
    { "id": "opt_2", "option_text": "<פעולה קצרה בעברית, עד 10 מילים>", "feedback_text": "<משוב בעברית, עד 16 מילים>", "is_correct": true|false },
    { "id": "opt_3", "option_text": "<פעולה קצרה בעברית, עד 10 מילים>", "feedback_text": "<משוב בעברית, עד 16 מילים>", "is_correct": true|false }
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
  // The child reads "לבנים", never "לבני דינס" (register ט; audit 4.10.2026 A7-018).
  "דינס",
];

/**
 * The board named "לוח" ("הלוח", "בלוח") instead of "בית המספרים" (register ט).
 * A whole word only — "לוחצים" is not it — and "לוח החיבור", the addition
 * grid's own name, is allowed. Mirrored on the client (SocraticEngine.BARE_BOARD_WORD_HE).
 */
export const BARE_BOARD_WORD_HE = /(^|[^א-ת])[ובלמהשכ]{0,4}לוח(?![א-ת])(?!\s+החיבור)/;

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

// ---------------------------------------------------------------------------
// A digit stated for its column (review of 1.10.2026)
// ---------------------------------------------------------------------------

/** A digit as a card may write it: the digit, or its Hebrew number word ("שמונה", "שבע"). */
const DIGIT_WORDS_HE: Record<number, string[]> = {
  0: ["אפס"], 1: ["אחת", "אחד"], 2: ["שתיים", "שתי", "שניים", "שני"], 3: ["שלוש", "שלושה", "שלושת"],
  4: ["ארבע", "ארבעה", "ארבעת"], 5: ["חמש", "חמישה", "חמשת"], 6: ["שש", "שישה", "ששת"],
  7: ["שבע", "שבעה", "שבעת"], 8: ["שמונה", "שמונת"], 9: ["תשע", "תשעה", "תשעת"],
};
/** The singular block noun of a column, as "לבני עשרת" writes it. */
const BLOCK_SINGULAR_HE: Record<SocraticColumn, string> = { units: "יחידה", tens: "עשרת", hundreds: "מאה", thousands: "אלף" };

/**
 * The digit on its own: not inside a longer number ("10", "271", "3▢6"); as a
 * word, only where it ends the statement ("…היא שמונה.", "כותבים שבע בתיבה")
 * or counts blocks ("שמונה עשרות") — "שני המספרים" is not the digit 2.
 */
function digitToken(d: number, wordTail: string): string {
  return `(?:(?<![\\d▢])${d}(?![\\d▢])|(?<![א-ת])(?:${DIGIT_WORDS_HE[d].join("|")})(?![א-ת])${wordTail})`;
}
const WORD_ENDS_STATEMENT = "(?=\\s*(?:[.?!,:;]|$|ב(?:תיבה|טור|שורת)|\\s+ב(?:תיבה|טור|שורת)))";
const WRITE_VERB = "(?:כותבים|רושמים|כתבו|רשמו|לכתוב|לרשום|תכתבו|תרשמו|מקלידים|הקלידו|להקליד)";
/** "▢" and a number that holds one ("3▢6"), as one token. */
const MASKED_TOKEN = /[\d,]*▢[\d▢,]*/g;

export interface DigitSecret {
  column: SocraticColumn;
  digit: number;
  /** hidden: a skeleton's hidden digit or a hidden result digit; result: the expected digit of a result box not yet typed right. */
  kind: "hidden" | "result";
  /** Digits the screen shows in this column — "7 עשרות" may be the second number's 7. */
  visible: number[];
  /**
   * The digit is somewhere on the screen: a shown digit of either number, of a
   * shown result or of the instruction. A hidden digit that is NOT (the 8 of
   * 3▢6 + 271 = 657) may not appear in the card at all, in any wording (final
   * review, 2.10.2026: "מוסיפים 8" passed). Absent: treated as on the screen.
   */
  onScreen?: boolean;
}

type ScreenDigitFacts = Pick<SocraticFacts, "columns" | "hidden_result_digits" | "hidden_operands" | "final_answer"> &
  Partial<Pick<SocraticFacts, "number_a" | "number_b" | "instruction_he" | "task_kind">>;

/** Every digit the screen shows: both numbers without their hidden digits, a shown result, the instruction. */
function screenDigitsOf(facts: ScreenDigitFacts): Set<number> {
  const out = new Set<number>();
  const lenOf = (n: number | null | undefined) => (n === null || n === undefined ? 0 : String(Math.abs(n)).length);
  const lenA = lenOf(facts.number_a);
  const lenB = lenOf(facts.number_b);
  for (const c of facts.columns) {
    const i = SOCRATIC_COLUMNS.indexOf(c.column);
    if (i < lenA && c.shown_a !== "▢") out.add(c.digit_a);
    if (i < lenB && c.shown_b !== "▢") out.add(c.digit_b);
  }
  const skeleton = (facts.hidden_operands ?? []).length > 0;
  const hiddenResult = facts.hidden_result_digits ?? [];
  // A skeleton shows its result; a missing-result-digit task shows the result's other digits.
  if (facts.final_answer !== null && (skeleton || hiddenResult.length > 0 || facts.task_kind === "missing_result_digit")) {
    const answer = facts.final_answer;
    for (const c of SOCRATIC_COLUMNS.slice(0, lenOf(answer))) {
      if (!hiddenResult.some((h) => h.column === c)) out.add(digitAt(answer, c));
    }
  }
  for (const m of stripDigitGroupSeparators(facts.instruction_he ?? "").matchAll(/\d/g)) out.add(Number(m[0]));
  return out;
}

/** The digits a card may never state for their column: hidden ones, and the result digit of every box not yet typed right. */
export function digitSecretsOf(facts: Pick<SocraticFacts, "columns" | "hidden_result_digits" | "hidden_operands" | "final_answer" | "completed_columns" | "task_kind"> & Partial<Pick<SocraticFacts, "number_a" | "number_b" | "instruction_he">>): DigitSecret[] {
  const out: DigitSecret[] = [];
  const onScreen = screenDigitsOf(facts);
  const skeleton = (facts.hidden_operands ?? []).length > 0;
  const resultLen = facts.final_answer !== null ? String(facts.final_answer).length : 0;
  for (const c of facts.columns) {
    const visible = [c.shown_a, c.shown_b].filter((s) => s !== "▢").map(Number);
    if (skeleton && facts.final_answer !== null) visible.push(digitAt(facts.final_answer, c.column));
    if (c.shown_a === "▢") out.push({ column: c.column, digit: c.digit_a, kind: "hidden", visible, onScreen: onScreen.has(c.digit_a) });
    if (c.shown_b === "▢") out.push({ column: c.column, digit: c.digit_b, kind: "hidden", visible, onScreen: onScreen.has(c.digit_b) });
  }
  for (const h of facts.hidden_result_digits ?? []) {
    const c = facts.columns.find((x) => x.column === h.column);
    out.push({ column: h.column, digit: h.digit, kind: "hidden", visible: c ? [c.digit_a, c.digit_b] : [], onScreen: onScreen.has(h.digit) });
  }
  // The iron rule (PRD Module 13): never the final answer — nor its digit in a
  // box the child has not typed right yet ("כותבים 2 בתיבה של טור היחידות" in
  // 85 + 17). A skeleton shows its result; a missing-digit task shows the others.
  if (!skeleton && facts.final_answer !== null && facts.task_kind !== "missing_result_digit") {
    for (const c of SOCRATIC_COLUMNS.slice(0, resultLen)) {
      if ((facts.completed_columns ?? []).includes(c)) continue;
      const col = facts.columns.find((x) => x.column === c);
      out.push({ column: c, digit: digitAt(facts.final_answer, c), kind: "result", visible: col ? [col.digit_a, col.digit_b] : [] });
    }
  }
  return out;
}

/**
 * Does a text state this digit for this column? "ספרת העשרות החסרה היא 8",
 * "הספרה החסרה בטור העשרות היא 8", "במקום ▢ כותבים 8", "חסרות שמונה עשרות",
 * "בטור העשרות כותבים 7", "כותבים 2 בתיבה של טור היחידות". Not: "מקבצים 10
 * יחידות לעשרת אחת" (a grouping), "רושמים 1 בעיגול הזיכרון" (the carry), "7
 * עשרות" when the screen shows that 7 in the column, numbers of the exercise.
 */
export function statesColumnDigit(text: string, s: DigitSecret, question?: string): boolean {
  const noun = BLOCK_NOUN_HE[s.column];
  const plain = stripDigitGroupSeparators(text);
  // A hidden digit the screen shows nowhere: any standalone token of it gives it away —
  // not a count of other things ("שתי ספרות"), nor the answer to a question counting them.
  if (s.kind === "hidden" && s.onScreen === false && mentionsDigitAnywhere(plain, s.digit, question)) return true;
  const D = digitToken(s.digit, WORD_ENDS_STATEMENT);
  const Dcount = digitToken(s.digit, "");
  const mentionsThis = new RegExp(`(?:^|[^א-ת])[בלמו]?(?:של\\s+)?ה?${noun}(?![א-ת])`);
  const mentionsAnyColumn = /(?:^|[^א-ת])[בלמו]?(?:של\s+)?ה?(?:יחידות|עשרות|מאות|אלפים)(?![א-ת])/;
  for (const [whole, clause] of plain.matchAll(/([^.?!;:\n]*)[.?!;:\n]?/g)) {
    if (!clause.trim()) continue;
    const isQuestion = whole.endsWith("?");
    const here = mentionsThis.test(clause);
    // "8 עשרות", "שמונה עשרות", "8 לבני עשרת" — a hidden digit only, and not a digit the column shows.
    if (s.kind === "hidden" && !s.visible.includes(s.digit) &&
      new RegExp(`${Dcount}\\s+(?:לבני\\s+(?:ה-?)?${BLOCK_SINGULAR_HE[s.column]}|${noun})(?![א-ת])`).test(clause)) return true;
    // "▢ = 8", "במקום ▢ כותבים 8" — the hidden box itself, with no operation in between.
    if (s.kind === "hidden" && new RegExp(`◻(?:(?!ועוד|פחות|מחברים|מחסרים)[^+\\-−]){0,25}?${D}`).test(clause.replace(MASKED_TOKEN, "◻"))) return true;
    // "ספרת העשרות … היא 8", "הספרה החסרה בטור העשרות היא 8", "בטור העשרות … = 7" — not the
    // memory circle, and not a digit the screen shows ("הספרה העליונה היא 8" when the 8 is there).
    const aboutShownDigit = s.visible.includes(s.digit) && /העליונה|התחתונה|הראשון|השני|במספר|של המספר/.test(clause);
    if (here && !aboutShownDigit && !/עיגול/.test(clause) &&
      new RegExp(`(?:היא|הוא|זו|זאת|=)\\s*${D}`).test(clause)) return true;
    // "כותבים 8", "כתבו את הספרה 8" — for this column, or for a box when no other column is named; never the
    // memory circle. "כותבים ספרה אחת בכל תיבה" is the rule of the box, not the digit 1.
    const digitOnly = `(?<![\\d▢])${s.digit}(?![\\d▢])`;
    const write = new RegExp(`${WRITE_VERB}\\s+(?:את\\s+)?(?:(?:ה)?ספרה\\s+(?:ה-?)?${digitOnly}|(?:ה-?)?${D})(?!\\s*(?:\\+|−|-))`);
    if (write.test(clause) && !/עיגול/.test(clause) && (here || (!mentionsAnyColumn.test(clause) && /תיבה|שורת התוצאה|◻|▢/.test(clause)))) return true;
    // "8 בתיבה", "7 בשורת התוצאה" with this column named.
    if (here && new RegExp(`${D}\\s+ב(?:תיבה|שורת התוצאה)`).test(clause) && !/עיגול/.test(clause)) return true;
    // "בטור היחידות יישארו 5 לבנים", "בתיבה של טור המאות יופיע 1": what the column will hold or show.
    if (here && !/עיגול/.test(clause) && statesWithVerb(clause, s.digit, isQuestion)) return true;
  }
  return false;
}

/** The digit as a standalone token: the digit itself, or a number word of it in either gender. */
function digitTokenAny(d: number): string {
  return `(?:(?<![\\d▢])${d}(?![\\d▢])|(?<![א-ת])(?:${DIGIT_WORDS_HE[d].join("|")})(?![א-ת]))`;
}

/**
 * The verbs that state what a column will hold or show ("יישארו", "יופיע",
 * "תהיה") and, with the column named, what it holds ("נשארו"). Final review,
 * 2.10.2026: "בטור היחידות יישארו 5 לבנים" (53 − 18) and "בתיבה של טור
 * המאות יופיע 1" (85 + 17) passed.
 */
const STATE_VERB_RE = /(?<![א-ת])(?:ו|ש|כש)?(?:יישאר|יישארו|ישאר|ישארו|תישאר|תשאר|נשאר|נשארו|נשארה|יופיע|יופיעו|תופיע|יהיה|יהיו|תהיה|תהיינה)(?![א-ת])/g;
/** A noun right before a number word makes it that noun's count ("עשרת אחת", "ספרה אחת"), not the digit. */
const NOUN_BEFORE_NUMBER_WORD = /(?:יחידה|עשרת|מאה|אלף|ספרה|לבנה|פעם|תיבה)\s+$/;
/**
 * A number that an operation in the same clause acts on: "16 פחות 8", "אחרי
 * שמוציאים 5", "אם מחברים 6, 4 ועוד 1", "מחברים 0 ו-5". It is the way to the
 * result, not the result (verification, 2.10.2026: "כמה לבנים יישארו בטור
 * היחידות אחרי שמוציאים 5?" in 480 − 155 was refused).
 */
const OPERAND_BEFORE = /(?:ועוד|פחות|[+−]|(?<![א-ת])(?:ו|ש|כש)?(?:מוציאים|מוסיפים|מחברים|מחסרים|מורידים|להוציא|להוסיף|לחבר|לחסר|הוציאו|הוסיפו|חברו|חסרו))(?:\s|,|ו-|ו(?=\d)|\d|ועוד|פחות|[+−]|את(?![א-ת])|ה-)*$/;
/** A question that asks for the value ("כמה … יישארו", "מה יהיה …"), not "האם … יישארו 5?". */
const WH_WORD = /(?:^|[^א-ת])(?:כמה|מה|איזה|איזו|אילו)(?![א-ת])/;
function statesWithVerb(clause: string, d: number, isQuestion = false): boolean {
  for (const m of clause.matchAll(STATE_VERB_RE)) {
    // "כמה לבנים יישארו …?", "מה יהיה בטור …?": the clause asks for the value; a number in it is not the answer.
    if (isQuestion && WH_WORD.test(clause.slice(0, m.index!))) continue;
    const end = m.index! + m[0].length;
    const after = clause.slice(end, end + 40);
    for (const t of after.matchAll(new RegExp(digitTokenAny(d), "g"))) {
      const rest = after.slice(t.index! + t[0].length);
      const upTo = clause.slice(0, end) + after.slice(0, t.index!);
      // An operation on the number ("יישארו 5 פחות 3") is the way, not the result.
      if (/^\s*(?:\+|−|-\s*\d|ועוד|פחות)/.test(rest)) continue;
      // …and so is the number an operation acts on ("יהיו 16 פחות 8", "אחרי שמוציאים 5").
      if (OPERAND_BEFORE.test(upTo)) continue;
      if (/^[א-ת]/.test(t[0]) && NOUN_BEFORE_NUMBER_WORD.test(upTo)) continue;
      return true;
    }
    // "5 לבנים יישארו בטור היחידות": the number just before the verb.
    const before = /(\d+|[א-ת]+)\s+(?:לבנים\s+|לבני\s+[א-ת]+\s+)?$/.exec(clause.slice(Math.max(0, m.index! - 25), m.index!));
    if (before && new RegExp(`^${digitTokenAny(d)}$`).test(before[1])) return true;
  }
  return false;
}

/** Things a card counts that are not a digit of the exercise: "שתי ספרות", "שני מספרים", "שתי דרכים". */
const COUNTED_THINGS = "(?:ספרות|ספרה|תיבות|תיבה|דרכים|דרך|מספרים|מספר|טורים|טור|פעמים|פעם|שלבים|שלב|צעדים|צעד|שאלות|שאלה|שורות|שורה|כפתורים|כפתור|תרגילים|תרגיל|אפשרויות|עיגולים|עיגול|תשובות|תשובה|פעולות|פעולה)";
const ANY_NUMBER_WORD = Object.values(DIGIT_WORDS_HE).flat().join("|");
/**
 * A question that counts something other than the hidden digit: "כמה תיבות
 * ריקות יש?", "כמה מספרים יש בתרגיל?", "כמה עשרות עברו מטור היחידות?" (the
 * carry). "כמה עשרות חסרות?" asks for the hidden digit itself — not this.
 */
const COUNT_QUESTION = new RegExp(
  `(?:^|[^א-ת])כמה\\s+(?:${COUNTED_THINGS}|(?:יחידות|עשרות|מאות|אלפים|לבנים|לבני\\s+[א-ת]+)\\s+(?:[א-ת]+\\s+)?(?:עברו|עוברות|עוברים|הועברו|מעבירים|עבר|עברה|קיבצו|מקבצים|פורטים|פרטו|נוצרו|נוצרה))(?![א-ת])`
);
/** The word before "אחת / אחד" that makes it the value, not a noun's count: "היא אחת", "מוסיפים אחת", "ועוד אחת". */
const VALUE_BEFORE_ONE = /(?:^|[^א-ת])(?:היא|הוא|זו|זה|זאת|הם|הן|ועוד|פחות|עוד|רק|בדיוק|[א-ת]+ים|[א-ת]{2,}ו)\s+$/;

/**
 * A digit anywhere in a text: the digit on its own ("מוסיפים 8", "הספרה 8")
 * or a number word of it ("שמונה"). Not inside a longer number ("18", "3▢6"),
 * not a construct before a definite noun ("שני המספרים", "שלושת הטורים"), not
 * "אחת / אחד" after a noun ("עשרת אחת", "ספרה אחת"), and not the 1 of the
 * memory circle ("רושמים 1 בעיגול הזיכרון": a carry is always 1).
 * Verification, 2.10.2026 — nor a count of other things: "שתי ספרות", "אחת
 * מהן", "שלושה: שני מספרים ותוצאה", "ה-1 של 12", or a lone answer to a
 * question that counts them ("כמה תיבות ריקות יש?" → "שתיים"). With no
 * question given, a lone number is the digit.
 */
export function mentionsDigitAnywhere(text: string, d: number, question?: string): boolean {
  const plain = stripDigitGroupSeparators(text);
  const countQuestion = question !== undefined && COUNT_QUESTION.test(stripDigitGroupSeparators(question));
  for (const cm of plain.matchAll(/([^.?!;:\n]*)([.?!;:\n]?)/g)) {
    const clause = cm[1];
    if (!clause.trim()) continue;
    if (d === 1 && /עיגול/.test(clause)) continue;
    const next = plain.slice(cm.index! + cm[0].length);
    for (const t of clause.matchAll(new RegExp(digitTokenAny(d), "g"))) {
      const before = clause.slice(0, t.index!);
      const after = clause.slice(t.index! + t[0].length);
      const word = /^[א-ת]/.test(t[0]);
      if (word && /^(?:שני|שתי|שלושת|ארבעת|חמשת|ששת|שבעת|שמונת|תשעת)$/.test(t[0]) && /^\s+ה[א-ת]/.test(after)) continue;
      if (word && /^(?:אחת|אחד)$/.test(t[0]) && /[א-ת]\s+$/.test(before) && !VALUE_BEFORE_ONE.test(before)) continue;
      // "שתי ספרות", "2 תיבות", "שני מספרים": a count of things that are not the digit.
      if (new RegExp(`^\\s+${COUNTED_THINGS}(?![א-ת])`).test(after)) continue;
      // "אחת מהן", "שתיים מהם".
      if (/^\s+(?:מהן|מהם|מביניהן|מביניהם)(?![א-ת])/.test(after)) continue;
      // "ה-1 של 12": a digit of a number the card names.
      if (!word && /ה-?$/.test(before)) {
        const of = /^\s+(?:של|ב-?|מ-?)\s*(\d{2,})/.exec(after);
        if (of && of[1].includes(String(d))) continue;
      }
      const lone = new RegExp(`^\\s*(?:(?:רק|בדיוק)\\s+)?$`).test(before) && !after.trim();
      // "שלושה: שני מספרים ותוצאה": the number of things listed after it.
      if (lone && cm[2] === ":" && new RegExp(`^\\s*(?:\\d+|${ANY_NUMBER_WORD})\\s+${COUNTED_THINGS}(?![א-ת])`).test(next)) continue;
      // "שתיים" answering "כמה תיבות ריקות יש?". When the question asks for the digit itself, it is the leak.
      if (lone && countQuestion) continue;
      return true;
    }
  }
  return false;
}

/** The first digit a card states for its column, or null. */
export function revealedColumnDigit(texts: string[], facts: Parameters<typeof digitSecretsOf>[0]): DigitSecret | null {
  const secrets = digitSecretsOf(facts);
  // texts[0] is the guiding question: an option answering a question that counts
  // other things ("כמה תיבות ריקות יש?" → "שתיים") is not the hidden digit.
  for (const s of secrets) if (texts.some((t) => statesColumnDigit(t, s, texts[0]))) return s;
  return null;
}

/**
 * The columns an instruction itself names, or whose blocks its conversion
 * names: s1_r_group26 says "בטור היחידות … קבצו כל 10 יחידות לעשרת אחת",
 * s1_target_347 "פרטו עשרת אחת לעשר יחידות". A card may name those — they do
 * not tell the child where the difficulty is (owner, 29.9.2026: the card
 * never names the column WHERE THE DIFFICULTY IS; the child finds it).
 */
const CONVERSION_NOUNS = "(יחידות|יחידה|עשרות|עשרת|מאות|מאה|אלפים|אלף)";
const INSTRUCTION_CONVERSION_RE = new RegExp(`(?:פרטו|לפרוט|פורטים|קבצו|לקבץ|מקבצים)\\s+(?:כל\\s+)?(?:\\d+\\s+|את\\s+)?(?:ה)?(?:לבנת\\s+|לבני\\s+)?${CONVERSION_NOUNS}(?:\\s+אחת|\\s+אחד)?\\s+ל-?(?:10\\s+|עשר\\s+|ה)?${CONVERSION_NOUNS}`, "g");
export function instructionColumnsOf(instruction: string | null): Set<SocraticColumn> {
  const out = new Set<SocraticColumn>();
  if (!instruction) return out;
  for (const m of instruction.matchAll(/טור ה(יחידות|עשרות|מאות|אלפים)/g)) out.add(NOUN_COLUMN[m[1]]);
  for (const m of instruction.matchAll(INSTRUCTION_CONVERSION_RE)) {
    if (NOUN_COLUMN[m[1]]) out.add(NOUN_COLUMN[m[1]]);
    if (NOUN_COLUMN[m[2]]) out.add(NOUN_COLUMN[m[2]]);
  }
  return out;
}

/** The columns a text names to act on ("טור העשרות") that the instruction does not name itself. */
function namesColumnNotInInstruction(text: string, allowed: Set<SocraticColumn>): boolean {
  for (const m of text.matchAll(/טור ה(יחידות|עשרות|מאות|אלפים)/g)) if (!allowed.has(NOUN_COLUMN[m[1]])) return true;
  return false;
}

/** Meeting 1 has three columns only: no thousands column, no "קבצו 10" on the hundreds. */
const MEETING_1_ABSENT = /טור האלפים|לבנ(?:ת|י)\s+(?:ה)?אלף|קבצו 10 לאלף|(?:מקבצים|קבצו|לקבץ)\s+(?:כל\s+)?10\s+(?:ה)?מאות|מאות\s+לאלף|(?:^|[^א-ת])[לב]?אלף אחד/;

/** A card that tells the child to group: refused while a break is the intended step. */
/**
 * s1_target_347 asks which number the blocks show after the break: that it is
 * still the number built is what the child must find (coordinator's decision,
 * 2.10.2026; the analysts' phrase rule of meeting 1). A card that says the
 * number stays the same, or sends the child to write the number built at the
 * start, gives it away. A question about adding or deleting blocks ("האם המספר
 * יישאר אותו מספר?") is not refused: it asks, about another action.
 * "Does not change" is refused about the number, the quantity or the value
 * only ("המספר שבניתם לא השתנה"), up to two words apart: a column that does
 * not change ("טור המאות לא משתנה כשפורטים עשרת") or a question about the
 * board ("מה לא השתנה בבית המספרים?") gives nothing away (review, 2.10.2026).
 */
export const S1_TARGET_SAME_NUMBER = /(?:^|[^א-ת])(?:ו|ש|כש)?ה?(?:מספר|כמות|ערך)(?![א-ת])(?:\s+\S+){0,4}?\s+(?:עדיין\s+)?(?:נשאר|נשארת|נשמר|נשמרת|זהה|לא\s+(?:משתנה|השתנה|השתנתה|ישתנה|תשתנה)|לא\s+(?:גדל|גדלה|קטן|קטנה)\s+ו(?:גם\s+)?לא\s+(?:גדל|גדלה|קטן|קטנה))(?![א-ת])|(?:^|[^א-ת])(?:ו|ש|כש)?(?:נשמר|נשמרת|נשמרים|נשמרות)(?![א-ת])|(?:^|[^א-ת])(?:ו|ש|כש)?(?:נשאר|נשארת|נשארו|נשארים|נשארות)\s+(?:\S+\s+){0,2}?אותו(?:\s+ה?(?:דבר|מספר|ערך))?(?![א-ת])|מייצג(?:ות|ים|ת)?\s+(?:את\s+)?אותו\s+(?:ה)?מספר(?![א-ת])|שבניתם\s+(?:ב)?(?:התחלה|תחילת)|אותו\s+(?:ה)?מספר\s+(?:כמו\s+)?(?:ב)?(?:התחלה|תחילת)|אותו\s+(?:ה)?מספר\s+(?:ש|כמו\s+ש)בניתם/;

const GROUP_VERB = /(?:^|[^א-ת])(?:ו|ש|כש)?(?:קבצו|מקבצים|לקבץ|הקבצה|ההקבצה|תקבצו)(?![א-ת])/;

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
    if (BARE_BOARD_WORD_HE.test(t)) return "לוח";
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
  // A digit stated for its column: a skeleton's hidden digit ("ספרת העשרות
  // החסרה היא 8", "במקום ▢ כותבים 8", "חסרות שמונה עשרות"), a hidden result
  // digit ("בטור העשרות כותבים 7"), and — the iron rule — the expected digit
  // of a result box not yet typed right ("כותבים 2 בתיבה של טור היחידות").
  if (facts && facts.columns.length) {
    const revealed = revealedColumnDigit(texts, facts);
    if (revealed) {
      return {
        ok: false,
        reason: revealed.kind === "hidden"
          ? `hidden digits leaked: the card states the digit the child must find in ${COLUMN_NAME_HE[revealed.column]} — ask how to find it`
          : `final answer leaked: the card states the result digit of ${COLUMN_NAME_HE[revealed.column]} — guide to the action, never the digit`,
      };
    }
  }
  // The frame's level: a level-1 card names no column for the child to act on,
  // in its question or in its right option — except a column the instruction
  // itself names (s1_r_group26's units, the units a break of s1_target_347
  // fills). A "which column?" card (all three options are columns: the
  // owner's meeting-1 deficit card) lets the child CHOOSE the column.
  const allowedColumns = instructionColumnsOf(facts?.instruction_he ?? null);
  if (facts?.card_frame?.level === 1) {
    const namesColumn = (t: string) => namesColumnNotInInstruction(t, allowedColumns);
    const right = options.find((o) => o.is_correct);
    const columnChoice = options.every((o) => /טור ה(יחידות|עשרות|מאות|אלפים)/.test(o.option_text));
    if (namesColumn(question) || (!columnChoice && right && namesColumn(right.option_text))) {
      return { ok: false, reason: "frame: this is a level-1 card — the question and the right option must not name the column to act on; the child finds it" };
    }
  }
  // Meeting 1: the child finds the column (owner, 29.9.2026) — the question names none the instruction does not.
  if (facts && facts.meeting === 1 && namesColumnNotInInstruction(question, allowedColumns)) {
    return { ok: false, reason: "counts: meeting 1 — the guiding question must not name the column where the difficulty is; the child finds it" };
  }
  // Meeting 1 has no thousands column and no "קבצו 10" on the hundreds.
  if (facts && facts.meeting === 1 && texts.some((t) => MEETING_1_ABSENT.test(t))) {
    return { ok: false, reason: 'screen: meeting 1 has three columns only — no thousands column, no thousand block and no "קבצו 10" button on the hundreds' };
  }
  // A two-step instruction whose break is done on purpose (s7_g_t5: 3 thousands
  // and 14 hundreds before removing 6 hundreds): never "group them back".
  if (facts?.crowding_intended) {
    const right = options.find((o) => o.is_correct);
    if ([question, right?.option_text ?? "", right?.feedback_text ?? ""].some((t) => GROUP_VERB.test(t))) {
      return { ok: false, reason: "frame: the 10 or more blocks are the break the next step needs — never tell the child to group them back; ask about the step the instruction asks for next" };
    }
  }
  // s1_target_347: "the number stays the same" is the discovery itself.
  if (facts?.exercise_id === "s1_target_347" && texts.some((t) => S1_TARGET_SAME_NUMBER.test(t))) {
    return { ok: false, reason: "secret number leaked: s1_target_347 asks which number the blocks show after the break — never say that the number stays the same, is kept or did not change, and never send the child to write the number built at the start; ask what happened to the broken block instead" };
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
  // The style (owner, 2.10.2026): short, no title, no copied instruction, a comma after a fronted clause.
  const style = cardStyleViolation({ guiding_question: question, options }, { instruction: facts?.instruction_he ?? null, title: facts?.title_he ?? null });
  if (style) return { ok: false, reason: `style: ${style.id} — ${style.fix}` };
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
