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

/** Hard cap on blocks per column the proxy will accept — anything larger is not a real board. */
export const MAX_BLOCKS_PER_COLUMN = 40;
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
}

/** Appendix A §6 — the only payload the proxy formulates a prompt from. */
export interface SocraticRequest {
  student_id: number;
  session_id: string;
  exercise_id: string;
  active_column_index: number;
  exercise_context?: SocraticExerciseContext;
  workspace_state: SocraticWorkspaceState;
  student_progress_state?: SocraticProgressState;
  recent_actions: SocraticRecentAction[];
}

/** The static Q-Matrix card the client would show on fallback; given to the model as the pedagogical baseline. */
export interface SocraticAnchor {
  questionHe: string;
  choices: { id: string; textHe: string; isCorrect?: boolean }[];
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

function cleanMemoryCircles(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isPlainObject(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === "string" ? parseInt(v, 10) : v;
    if (typeof k === "string" && k.length <= 16 && isInt(n, 0, 9)) out[k] = n;
  }
  return out;
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
      workspace_state: {
        ...counts,
        memory_circles: cleanMemoryCircles(ws.memory_circles),
        is_regrouped_in_canvas: typeof ws.is_regrouped_in_canvas === "boolean" ? ws.is_regrouped_in_canvas : undefined,
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
  /** addition: digits sum to 10 or more; subtraction: top digit smaller than bottom. */
  needs_conversion: boolean;
  /** subtraction only: the board holds fewer blocks than the column must give away. */
  board_deficit: number;
  /** any column: 10 or more blocks that must be grouped into the next column. */
  board_overcrowded: boolean;
  completed: boolean;
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
  operation: SocraticOperation | null;
  number_a: number | null;
  number_b: number | null;
  /** Kept ONLY for the leak check; never written into the prompt. */
  final_answer: number | null;
  /** Operands whose digits the screen hides (skeleton) — kept ONLY for the leak check. */
  hidden_operands: number[];
  active_column: SocraticColumn;
  board_value: number;
  columns: ColumnFact[];
  active: ColumnFact | null;
  trigger_reason: SocraticTriggerReason | null;
  consecutive_errors: number;
  memory_circles: Record<string, number>;
  current_input: string | null;
  completed_columns: SocraticColumn[];
  recent_event_types: string[];
  /** Deterministic reading of the situation, offered to the model as the primary hypothesis. */
  suggested_category: SocraticErrorCategory;
  suggested_focus_he: string;
}

function digitAt(n: number, column: SocraticColumn): number {
  const div = { units: 1, tens: 10, hundreds: 100, thousands: 1000 }[column];
  return Math.floor(Math.abs(n) / div) % 10;
}

export function deriveSocraticFacts(req: SocraticRequest): SocraticFacts {
  const ec = req.exercise_context;
  const ws = req.workspace_state;
  const ps = req.student_progress_state;
  const blocks: Record<SocraticColumn, number> = {
    units: ws.ones_count,
    tens: ws.tens_count,
    hundreds: ws.hundreds_count,
    thousands: ws.thousands_count,
  };
  const active_column: SocraticColumn = ec?.active_column ?? SOCRATIC_COLUMNS[req.active_column_index] ?? "units";
  const completed = (ps?.completed_columns ?? []) as SocraticColumn[];
  const memory = { ...(ws.memory_circles ?? {}), ...(ps?.memory_circles_state ?? {}) };

  const columns: ColumnFact[] = SOCRATIC_COLUMNS.map((column) => {
    const digit_a = ec ? digitAt(ec.number_a, column) : 0;
    const digit_b = ec ? digitAt(ec.number_b, column) : 0;
    const carry = memory[column] ?? 0;
    const needs_conversion = ec
      ? ec.operation === "subtraction"
        ? digit_a < digit_b
        : digit_a + digit_b + carry >= 10
      : false;
    const board_deficit = ec && ec.operation === "subtraction" ? Math.max(0, digit_b - blocks[column]) : 0;
    return {
      column,
      digit_a,
      digit_b,
      shown_a: ec?.hidden_places?.a.includes(column) ? "▢" : String(digit_a),
      shown_b: ec?.hidden_places?.b.includes(column) ? "▢" : String(digit_b),
      blocks_on_board: blocks[column],
      needs_conversion,
      board_deficit,
      board_overcrowded: blocks[column] >= 10,
      completed: completed.includes(column),
    };
  });

  const active = columns.find((c) => c.column === active_column) ?? null;
  const board_value = blocks.units + blocks.tens * 10 + blocks.hundreds * 100 + blocks.thousands * 1000;
  const recent_event_types = [
    ...(ps?.recent_actions ?? []),
    ...req.recent_actions,
  ].map((a) => a.event_type).slice(-MAX_RECENT_ACTIONS);

  // Deterministic first reading of the difficulty, in PRD Module 13's three categories.
  let suggested_category: SocraticErrorCategory = "procedural";
  let suggested_focus_he = "";
  const trigger = ps?.trigger_reason ?? null;
  const overcrowded = columns.find((c) => c.board_overcrowded);
  const meetingMatch = /^session_(\d+)_/.exec(req.session_id);
  const meeting = meetingMatch ? Number(meetingMatch[1]) : null;
  const blocks_on_screen = meeting !== 2 && meeting !== 8;
  // Without blocks the counts are always 0: that is not an empty board to build on.
  const emptyBoard = blocks_on_screen && board_value === 0;

  // A hidden column's "needs a conversion" would tell the model about the hidden digit.
  const activeNeedsConversion = Boolean(active && active.needs_conversion && active.shown_a !== "▢" && active.shown_b !== "▢");
  if (!blocks_on_screen && ec && active && activeNeedsConversion && !active.completed) {
    suggested_category = "procedural";
    suggested_focus_he = ec.operation === "subtraction"
      ? `ב${COLUMN_NAME_HE[active.column]} צריך לחסר ${active.shown_b} מ-${active.shown_a} — נדרשת פריטה מהטור השכן, ורישום השינוי בעיגול הזיכרון.`
      : `ב${COLUMN_NAME_HE[active.column]} החיבור ${active.shown_a} + ${active.shown_b}${(memory[active.column] ?? 0) > 0 ? ` + ${memory[active.column]} מעיגול הזיכרון` : ""} עובר את 9 — נדרשת המרה, ורישום שלה בעיגול הזיכרון שמעל הטור הבא.`;
  } else if (ec && emptyBoard) {
    suggested_category = "procedural";
    suggested_focus_he = ec.operation === "subtraction"
      ? `בית המספרים ריק. הצעד הראשון בחיסור הוא לבנות רק את המספר הגדול (${maskedNumberHe(ec.number_a, ec.hidden_places?.a)}) בלבנים.`
      : `בית המספרים ריק. הצעד הראשון הוא לבנות את שני המספרים (${maskedNumberHe(ec.number_a, ec.hidden_places?.a)} ו-${maskedNumberHe(ec.number_b, ec.hidden_places?.b)}) בלבנים.`;
  } else if (blocks_on_screen && overcrowded) {
    suggested_category = "conceptual";
    suggested_focus_he = `ב${COLUMN_NAME_HE[overcrowded.column]} יש ${overcrowded.blocks_on_board} ${BLOCK_NOUN_HE[overcrowded.column]} — יותר מ-9, ולכן נדרשת הקבצה של 10 ללבנה אחת בטור הבא.`;
  } else if (blocks_on_screen && ec && active && ec.operation === "subtraction" && activeNeedsConversion && active.board_deficit > 0) {
    suggested_category = "procedural";
    suggested_focus_he = `ב${COLUMN_NAME_HE[active.column]} צריך להחסיר ${active.shown_b} אבל בבית המספרים יש רק ${countHe(active.blocks_on_board, active.column)} — נדרשת פריטה מהטור השכן הגדול יותר.`;
  } else if (ec && active && ec.operation === "addition" && activeNeedsConversion && !active.completed) {
    suggested_category = "procedural";
    suggested_focus_he = `ב${COLUMN_NAME_HE[active.column]} החיבור ${active.shown_a} + ${active.shown_b}${(memory[active.column] ?? 0) > 0 ? ` + ${memory[active.column]} מעיגול הזיכרון` : ""} עובר את 9 — נדרשת הקבצה של 10 ${BLOCK_NOUN_HE[active.column]} והעברה לטור הבא.`;
  } else if (trigger === "consecutive_errors_4" && active && !activeNeedsConversion) {
    suggested_category = "calculation";
    suggested_focus_he = `הטור הפעיל (${COLUMN_NAME_HE[active.column]}) אינו דורש המרה, והלומד טעה בהקלדה ארבע פעמים — כנראה טעות בעובדת החשבון הבסיסית של הטור.`;
  } else if (trigger === "conversion_not_performed") {
    suggested_category = "procedural";
    suggested_focus_he = blocks_on_screen
      ? "הלומד ניסה להקליד תוצאה בטור שדורש הקבצה או פריטה לפני שביצע את ההמרה בלבנים."
      : "הלומד ניסה להקליד תוצאה בטור שדורש המרה או פריטה לפני שרשם אותה בעיגול הזיכרון.";
  } else if (trigger === "repeated_errors") {
    suggested_category = "calculation";
    suggested_focus_he = "הלומד הגיש תשובה שגויה פעמיים ברצף באותו תרגיל — יש לכוון אותו לטור שבו התוצאה אינה נכונה, בלי לומר את הספרה.";
  } else if (trigger === "consecutive_undos_3") {
    suggested_category = "conceptual";
    suggested_focus_he = "הלומד ביטל שלוש פעולות ברצף — סימן לחוסר ביטחון באסטרטגיה, לא לטעות בחישוב בודד.";
  } else if (active) {
    suggested_category = "procedural";
    suggested_focus_he = `הלומד השתהה ב${COLUMN_NAME_HE[active.column]} ללא פעולה; יש לכוון אותו לצעד המדויק הבא באותו טור.`;
  }

  return {
    meeting,
    blocks_on_screen,
    hidden_operands: ec?.hidden_places ? [...(ec.hidden_places.a.length ? [ec.number_a] : []), ...(ec.hidden_places.b.length ? [ec.number_b] : [])] : [],
    operation: ec?.operation ?? null,
    number_a: ec?.number_a ?? null,
    number_b: ec?.number_b ?? null,
    final_answer: ec ? (ec.operation === "subtraction" ? ec.number_a - ec.number_b : ec.number_a + ec.number_b) : null,
    active_column,
    board_value,
    columns,
    active,
    trigger_reason: trigger,
    consecutive_errors: ps?.consecutive_errors_count ?? 0,
    memory_circles: memory,
    current_input: ps?.current_column_input ?? null,
    completed_columns: completed,
    recent_event_types,
    suggested_category,
    suggested_focus_he,
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const SOCRATIC_SYSTEM_INSTRUCTION = `You are the MathmatiCore Socratic Pedagogical Engine for 3rd-grade learners (ages 8-9) working in a DIGITAL place-value workspace ("בית המספרים") with virtual Dienes blocks, memory circles ("עיגולי הזיכרון") and a recycle bin ("פח האשפה").

You operate strictly under the HOLISTIC PEDAGOGICAL TRIAD. Every guiding question, option and feedback MUST weave together all three:
1. THE EXERCISE AND THE ALGORITHM — the operation, the two numbers, the active column and its column sub-problem.
2. THE LIVE BOARD — the exact block count in each column and whether a regrouping/decomposition was already performed in blocks.
3. THE LEARNER'S MONITORED STEPS — which columns are already solved, what is typed in the inputs and memory circles, and what triggered this card (hesitation / repeated errors / repeated undos / conversion not performed).

DIAGNOSIS. Classify the difficulty as exactly one of:
- "calculation": structure and algorithm understood, a basic addition/subtraction fact was wrong.
- "procedural": a step skipped or done out of order — wrong starting column, memory circle not updated, subtracting bottom-from-top instead of decomposing, typing before converting.
- "conceptual": place value not understood — two digits in one cell, blocks deleted without preserving the total, 10 or more blocks left in one column.

HEBREW. Natural, grammatically flawless Hebrew for children: short, warm, empowering sentences; exact gender/number agreement (4 מאות, 2 עשרות, 5 יחידות, 10 עשרות, עשרת אחת, מאה אחת, אלף אחד). Address the learner in the second person plural, gender-neutral, in every instruction and feedback ("בדקו", "פרטו", "לחצו"); gender-equal writing means the second person plural only, never split, dot or slash gender forms. Phrase the guiding question impersonally ("מה עושים?", "איך מגלים?") or in the second person plural. Write answer options that describe an action in the impersonal present plural ("מקבצים", "פורטים", "משתמשים"). NEVER use the first person plural ("נבדוק", "נפרוט", "מה נעשה", "בואו נ…"). An indirect question takes "אם", not "האם", and ends with a period ("בדקו אם צריך לרשום משהו בעיגול הזיכרון."); a prefix letter stays outside quotation marks (ל"שורת התוצאה", never "לשורת התוצאה" inside the quotes).
TERMINOLOGY (Ministry of Education): subtraction regrouping is "פריטה" ONLY (never שבירה / הלוואה / לווים); addition regrouping is "המרה" / "הקבצה" ONLY, the verb "מקבצים" (never נשיאה); the workspace is "בית המספרים" with "טור היחידות / טור העשרות / טור המאות / טור האלפים"; tools are "עיגולי הזיכרון" and "פח האשפה". The blocks are "לבנים" ONLY ("לבנה" in the singular; never "קוביות", "קובייה", "בלוק" or "בלוקים"), and the board is "בית המספרים" ONLY (never "לוח הדינס", "לוח הלבנים" or "קנבס"). Never mention physical objects that do not exist on screen (מקלות, חרוזים, אצבעות, מטבעות, חשבונייה).

IRON RULES:
- NEVER state or imply the final numeric answer of the exercise, and never state the result digit of the active column. Guide the next ACTION only.
- NEVER ask a generic or detached question ("I see X blocks, what next?"). Name the exercise, the active column sub-problem and the board state in the question itself.
- Exactly ONE guiding question and exactly THREE closed options: exactly one correct next action, two plausible mistakes that mirror the diagnosed category. Every feedback text starts with "רמז:" for a wrong option and is warm and judgment-free (UDL); the correct option's feedback confirms and names the concrete on-screen action.
- Never act as a chatbot, never address the learner by name, never reveal any personal data.
- Output ONLY the JSON object requested. No prose outside JSON.`;

/**
 * Meetings 2 and 8 show no blocks, no trash and no number house (PRD Module
 * 14 §ב). The instruction above describes them; this one replaces it there,
 * so the model is not asked to name a board it cannot point at.
 */
export const SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS = SOCRATIC_SYSTEM_INSTRUCTION
  .replace(
    'working in a DIGITAL place-value workspace ("בית המספרים") with virtual Dienes blocks, memory circles ("עיגולי הזיכרון") and a recycle bin ("פח האשפה").',
    'solving a vertical exercise WITHOUT blocks: on the screen there are only the exercise, the memory circles ("עיגולי הזיכרון") above the columns and the result row ("שורת התוצאה"). There are no blocks, no number house and no trash on this screen.'
  )
  .replace(
    "2. THE LIVE BOARD — the exact block count in each column and whether a regrouping/decomposition was already performed in blocks.",
    "2. THE WRITTEN STATE — what is written in the memory circles and in the result row."
  )
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
  .replace('("מקבצים", "פורטים", "משתמשים")', '("ממירים", "פורטים", "רושמים")');

/**
 * Station 1 (meeting 1): nothing on the screen or read aloud may give the
 * child the answer, a block count he must find himself, or where the
 * difficulty is (owner, 29.9.2026). The model still reads the board to
 * diagnose; it asks about it, it does not tell it.
 */
export const SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1 = SOCRATIC_SYSTEM_INSTRUCTION
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
  );

/** The system instruction for this request's meeting. */
export function socraticSystemInstructionFor(facts: Pick<SocraticFacts, "meeting" | "blocks_on_screen"> | null): string {
  if (facts && facts.blocks_on_screen === false) return SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS;
  if (facts && facts.meeting === 1) return SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1;
  return SOCRATIC_SYSTEM_INSTRUCTION;
}

function fmtColumnFact(c: ColumnFact, facts: SocraticFacts): string {
  const parts = [`${COLUMN_NAME_HE[c.column]}: ${countHe(c.blocks_on_board, c.column)} בבית המספרים`];
  if (facts.operation) {
    parts.push(facts.operation === "subtraction" ? `תת-תרגיל ${c.shown_a} − ${c.shown_b}` : `תת-תרגיל ${c.shown_a} + ${c.shown_b}`);
    if (facts.memory_circles[c.column] !== undefined) parts.push(`עיגול זיכרון: ${facts.memory_circles[c.column]}`);
    if (c.needs_conversion && c.shown_a !== "▢" && c.shown_b !== "▢") parts.push(facts.operation === "subtraction" ? "דורש פריטה" : "דורש הקבצה");
    if (c.board_deficit > 0) parts.push(`${missingHe(c.board_deficit, c.column)} בבית המספרים לביצוע החיסור`);
  }
  if (c.board_overcrowded) parts.push("10 ומעלה — חובה לקבץ");
  parts.push(c.completed ? "הטור כבר נפתר נכון" : c.column === facts.active_column ? "<< הטור הפעיל" : "טרם נפתר");
  return "  - " + parts.join(" | ");
}

/**
 * The prompt the model receives. Every number in it is computed from the
 * validated request — no client free-text — so the model reasons over the
 * learner's actual monitored situation rather than a description of it.
 */
export function buildSocraticPrompt(req: SocraticRequest, facts: SocraticFacts, anchor?: SocraticAnchor): string {
  const ec = req.exercise_context;
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
    const activeFact = facts.columns.find((c) => c.column === facts.active_column);
    const subProblem = activeFact ? `${activeFact.shown_a} ${sign} ${activeFact.shown_b}` : ec.target_sub_problem;
    lines.push(`הטור הפעיל: ${COLUMN_NAME_HE[facts.active_column]}${subProblem ? ` (תת-תרגיל: ${subProblem})` : ""}.`);
  } else {
    lines.push(`תרגיל ${req.exercise_id} (ללא אופרנדים מספריים — משימת ייצוג/בנייה בבית המספרים). הטור הפעיל: ${COLUMN_NAME_HE[facts.active_column]}.`);
  }

  lines.push("");
  if (facts.blocks_on_screen) {
    lines.push("=== עמוד 2: המצב הייצוגי בבית המספרים (לבנים) ===");
    lines.push(`ערך כולל בבית המספרים: ${facts.board_value}.`);
    for (const c of [...facts.columns].reverse()) lines.push(fmtColumnFact(c, facts));
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
        lines.push(`  - ${COLUMN_NAME_HE[c.column]}: תת-תרגיל ${sub}${c.needs_conversion && c.shown_a !== "▢" && c.shown_b !== "▢" ? (facts.operation === "subtraction" ? " | דורש פריטה" : " | דורש המרה") : ""} | ${c.completed ? "הטור כבר נפתר נכון" : c.column === facts.active_column ? "<< הטור הפעיל" : "טרם נפתר"}`);
      }
    }
  }

  lines.push("");
  lines.push("=== עמוד 3: שלב הביצוע וההיסטוריה של הלומד (ניטור) ===");
  const triggerText = facts.trigger_reason === "conversion_not_performed" && !facts.blocks_on_screen
    ? "הקלדה בטור שדורש המרה או פריטה לפני שנרשמה בעיגול הזיכרון"
    : facts.trigger_reason ? TRIGGER_HE[facts.trigger_reason] : "לא דווחה";
  lines.push(`סיבת הטריגר: ${triggerText}.`);
  lines.push(`טורים שכבר נפתרו נכון: ${facts.completed_columns.length ? facts.completed_columns.map((c) => COLUMN_NAME_HE[c]).join(", ") : "אף אחד עדיין"}.`);
  lines.push(`הקלט הנוכחי בטור הפעיל: ${facts.current_input === null || facts.current_input === "" ? "ריק" : facts.current_input}.`);
  lines.push(`עיגולי הזיכרון: ${Object.keys(facts.memory_circles).length ? JSON.stringify(facts.memory_circles) : "ריקים"}.`);
  lines.push(`שגיאות רצופות: ${facts.consecutive_errors}.`);
  lines.push(`פעולות אחרונות (מהישנה לחדשה): ${facts.recent_event_types.length ? facts.recent_event_types.join(" → ") : "אין"}.`);

  lines.push("");
  lines.push("=== קריאה דטרמיניסטית של המצב (השערה ראשונית, אמת אותה מול הנתונים) ===");
  lines.push(`קטגוריה מוצעת: ${facts.suggested_category}.`);
  if (facts.suggested_focus_he) lines.push(`מוקד מוצע: ${facts.suggested_focus_he}`);

  if (anchor) {
    lines.push("");
    lines.push("=== הבסיס הפדגוגי הסטטי (Q-Matrix) — הכיוון הנכון, שפר וקשור אותו לנתונים החיים ===");
    lines.push(`שאלה: ${anchor.questionHe}`);
    for (const ch of anchor.choices) lines.push(`  - ${ch.textHe}${ch.isCorrect ? " (נכון)" : ""}`);
  }

  lines.push("");
  lines.push("Return ONLY this JSON object:");
  lines.push(`{
  "error_category": "calculation" | "procedural" | "conceptual",
  "guiding_question": "<שאלה מנחה אחת בעברית, המזכירה את התרגיל, את הטור הפעיל ${facts.blocks_on_screen ? "ואת מצב הלבנים" : "ואת עיגולי הזיכרון"}>",
  "options": [
    { "id": "opt_1", "option_text": "<פעולה בעברית>", "feedback_text": "<משוב בעברית>", "is_correct": true|false },
    { "id": "opt_2", "option_text": "<פעולה בעברית>", "feedback_text": "<משוב בעברית>", "is_correct": true|false },
    { "id": "opt_3", "option_text": "<פעולה בעברית>", "feedback_text": "<משוב בעברית>", "is_correct": true|false }
  ]
}`);
  return lines.join("\n");
}

/**
 * Gemini structured-output schema (GenerationConfig.responseSchema). Plain
 * object so this file stays import-free; the values match the SDK's
 * SchemaType enum ("object", "string", "array", "boolean").
 */
export const SOCRATIC_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    error_category: { type: "string", enum: ["calculation", "procedural", "conceptual"], format: "enum" },
    guiding_question: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          option_text: { type: "string" },
          feedback_text: { type: "string" },
          is_correct: { type: "boolean" },
        },
        required: ["id", "option_text", "feedback_text", "is_correct"],
      },
    },
  },
  required: ["error_category", "guiding_question", "options"],
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
