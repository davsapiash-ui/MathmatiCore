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
  | "conversion_not_performed";

export const SOCRATIC_COLUMNS: SocraticColumn[] = ["units", "tens", "hundreds", "thousands"];
export const SOCRATIC_ERROR_CATEGORIES: SocraticErrorCategory[] = ["calculation", "procedural", "conceptual"];
export const SOCRATIC_TRIGGER_REASONS: SocraticTriggerReason[] = [
  "hesitation_45s",
  "consecutive_errors_4",
  "consecutive_undos_3",
  "conversion_not_performed",
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

const TRIGGER_HE: Record<SocraticTriggerReason, string> = {
  hesitation_45s: "השהיה של 45 שניות ומעלה ללא פעולה בטור הפעיל",
  consecutive_errors_4: "ארבע שגיאות רצופות בהקלדה",
  consecutive_undos_3: "שלוש לחיצות ביטול רצופות",
  conversion_not_performed: "הקלדה בטור שדורש קיבוץ או פריטה לפני שבוצעה ההמרה בלבנים",
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
  operation: SocraticOperation | null;
  number_a: number | null;
  number_b: number | null;
  /** Kept ONLY for the leak check; never written into the prompt. */
  final_answer: number | null;
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
  const emptyBoard = board_value === 0;

  if (ec && emptyBoard) {
    suggested_category = "procedural";
    suggested_focus_he = ec.operation === "subtraction"
      ? `בית המספרים ריק. הצעד הראשון בחיסור הוא לבנות רק את המספר הגדול (${ec.number_a}) בלבנים.`
      : `בית המספרים ריק. הצעד הראשון הוא לבנות את שני המספרים (${ec.number_a} ו-${ec.number_b}) בלבנים.`;
  } else if (overcrowded) {
    suggested_category = "conceptual";
    suggested_focus_he = `ב${COLUMN_NAME_HE[overcrowded.column]} יש ${overcrowded.blocks_on_board} ${BLOCK_NOUN_HE[overcrowded.column]} — יותר מ-9, ולכן נדרש קיבוץ של 10 לבלוק אחד בטור הבא.`;
  } else if (ec && active && ec.operation === "subtraction" && active.needs_conversion && active.board_deficit > 0) {
    suggested_category = "procedural";
    suggested_focus_he = `ב${COLUMN_NAME_HE[active.column]} צריך להחסיר ${active.digit_b} אבל בלוח יש רק ${active.blocks_on_board} ${BLOCK_NOUN_HE[active.column]} — נדרשת פריטה מהטור השכן הגדול יותר.`;
  } else if (ec && active && ec.operation === "addition" && active.needs_conversion && !active.completed) {
    suggested_category = "procedural";
    suggested_focus_he = `ב${COLUMN_NAME_HE[active.column]} החיבור ${active.digit_a} + ${active.digit_b}${(memory[active.column] ?? 0) > 0 ? ` + ${memory[active.column]} מעיגול הזיכרון` : ""} עובר את 9 — נדרש קיבוץ של 10 ${BLOCK_NOUN_HE[active.column]} והעברה לטור הבא.`;
  } else if (trigger === "consecutive_errors_4" && active && !active.needs_conversion) {
    suggested_category = "calculation";
    suggested_focus_he = `הטור הפעיל (${COLUMN_NAME_HE[active.column]}) אינו דורש המרה, והלומד טעה בהקלדה ארבע פעמים — כנראה טעות בעובדת החשבון הבסיסית של הטור.`;
  } else if (trigger === "conversion_not_performed") {
    suggested_category = "procedural";
    suggested_focus_he = "הלומד ניסה להקליד תוצאה בטור שדורש קיבוץ או פריטה לפני שביצע את ההמרה בלבנים.";
  } else if (trigger === "consecutive_undos_3") {
    suggested_category = "conceptual";
    suggested_focus_he = "הלומד ביטל שלוש פעולות ברצף — סימן לחוסר ביטחון באסטרטגיה, לא לטעות בחישוב בודד.";
  } else if (active) {
    suggested_category = "procedural";
    suggested_focus_he = `הלומד השתהה ב${COLUMN_NAME_HE[active.column]} ללא פעולה; יש לכוון אותו לצעד המדויק הבא באותו טור.`;
  }

  return {
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

HEBREW. Natural, grammatically flawless Hebrew for children: short, warm, empowering sentences; exact gender/number agreement (4 מאות, 2 עשרות, 5 יחידות, 10 עשרות, עשרת אחת, מאה אחת). Address the learner in plural-neutral form ("נבדוק", "נפרוט", "מה נעשה").
TERMINOLOGY (Ministry of Education): subtraction regrouping is "פריטה" ONLY (never שבירה / הלוואה / לווים); addition regrouping is "קיבוץ" / "הקבצה" / "צירוף עשר" ONLY (never נשיאה); the workspace is "בית המספרים" with "טור היחידות / טור העשרות / טור המאות / טור האלפים"; tools are "עיגולי הזיכרון" and "פח האשפה". Blocks are "לבנים" or "קוביות". Never mention physical objects that do not exist on screen (מקלות, חרוזים, אצבעות, מטבעות, חשבונייה).

IRON RULES:
- NEVER state or imply the final numeric answer of the exercise, and never state the result digit of the active column. Guide the next ACTION only.
- NEVER ask a generic or detached question ("I see X blocks, what next?"). Name the exercise, the active column sub-problem and the board state in the question itself.
- Exactly ONE guiding question and exactly THREE closed options: exactly one correct next action, two plausible mistakes that mirror the diagnosed category. Every feedback text starts with "רמז:" for a wrong option and is warm and judgment-free (UDL); the correct option's feedback confirms and names the concrete on-screen action.
- Never act as a chatbot, never address the learner by name, never reveal any personal data.
- Output ONLY the JSON object requested. No prose outside JSON.`;

function fmtColumnFact(c: ColumnFact, facts: SocraticFacts): string {
  const parts = [`${COLUMN_NAME_HE[c.column]}: ${c.blocks_on_board} ${BLOCK_NOUN_HE[c.column]} בלוח`];
  if (facts.operation) {
    parts.push(facts.operation === "subtraction" ? `תת-תרגיל ${c.digit_a} − ${c.digit_b}` : `תת-תרגיל ${c.digit_a} + ${c.digit_b}`);
    if (facts.memory_circles[c.column] !== undefined) parts.push(`עיגול זיכרון: ${facts.memory_circles[c.column]}`);
    if (c.needs_conversion) parts.push(facts.operation === "subtraction" ? "דורש פריטה" : "דורש קיבוץ");
    if (c.board_deficit > 0) parts.push(`חסרות ${c.board_deficit} ${BLOCK_NOUN_HE[c.column]} בלוח לביצוע החיסור`);
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
    lines.push(`פעולה: ${ec.operation === "subtraction" ? "חיסור" : "חיבור"} במאונך. התרגיל: ${ec.number_a} ${sign} ${ec.number_b}.`);
    if (ec.session_topic) lines.push(`נושא המפגש: ${ec.session_topic}`);
    lines.push(`הטור הפעיל: ${COLUMN_NAME_HE[facts.active_column]}${ec.target_sub_problem ? ` (תת-תרגיל: ${ec.target_sub_problem})` : ""}.`);
  } else {
    lines.push(`תרגיל ${req.exercise_id} (ללא אופרנדים מספריים — משימת ייצוג/בנייה בבית המספרים). הטור הפעיל: ${COLUMN_NAME_HE[facts.active_column]}.`);
  }

  lines.push("");
  lines.push("=== עמוד 2: המצב הייצוגי בבית המספרים (לבנים) ===");
  lines.push(`ערך כולל בלוח: ${facts.board_value}.`);
  for (const c of [...facts.columns].reverse()) lines.push(fmtColumnFact(c, facts));
  if (req.workspace_state.is_regrouped_in_canvas !== undefined) {
    lines.push(req.workspace_state.is_regrouped_in_canvas ? "בוצעה כבר פריטה/הקבצה בלבנים." : "טרם בוצעה פריטה/הקבצה בלבנים.");
  }

  lines.push("");
  lines.push("=== עמוד 3: שלב הביצוע וההיסטוריה של הלומד (ניטור) ===");
  lines.push(`סיבת הטריגר: ${facts.trigger_reason ? TRIGGER_HE[facts.trigger_reason] : "לא דווחה"}.`);
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
  "guiding_question": "<שאלה מנחה אחת בעברית, המזכירה את התרגיל, את הטור הפעיל ואת מצב הלבנים>",
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
];

const HEBREW_RE = /[א-ת]/;

function textHasHebrew(s: string): boolean {
  return HEBREW_RE.test(s);
}

function containsNumberToken(text: string, n: number): boolean {
  // A standalone number: not part of a longer digit run ("15" inside "150" does not count).
  const re = new RegExp(`(^|[^0-9])${n}(?![0-9])`);
  return re.test(text);
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
  if (facts && leaksFinalAnswer(texts, facts)) return { ok: false, reason: "final answer leaked" };

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
