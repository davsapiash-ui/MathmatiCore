import * as logger from "firebase-functions/logger";
import { GEMINI_MODEL_ID, classifyGeminiError, generateGeminiText, type GeminiThinking } from "./geminiConfig";
import { recordAiCall, type AiOutcome } from "./aiMonitoring";
import { SANDBOX_MEETING_PURPOSE_HE, exercisePathType, isExerciseEvent, type ExercisePathType } from "./meetingMetrics";

/**
 * PRD Module 23 — layer two of the pedagogical report: the verbal analysis.
 *
 * The report is built from two INDEPENDENT layers, and the spec forbids mixing
 * them:
 *
 *   Layer 1 (the framework) — the physical working group and the concrete
 *     manipulatives, decided purely by the percentage rule, server-side, with
 *     no AI involvement whatsoever. Fully deterministic. It lives in
 *     pedagogicalReport.ts and is not this module's business.
 *
 *   Layer 2 (this module) — a natural-language description of the specific
 *     knowledge gaps found, plus teaching recommendations for the physical
 *     classroom. Written by the AI engine from the learner's telemetry and the
 *     templates of the exercises they erred on.
 *
 * The engine is strictly forbidden from altering, contradicting, or
 * recommending against layer 1's framework, so the tier decided upstream is
 * stated in the system instruction as a fixed constraint rather than as an
 * input the model may reason about changing.
 *
 * Report generation NEVER fails because of the engine. Every path through this
 * module returns null instead of throwing, and the caller then renders the
 * report with layer 1 only plus the exact fallback sentence the PRD fixes
 * verbatim.
 */

export type RecommendationTier = "below_50" | "between_50_75" | "above_75";

/**
 * The tier boundaries are the PRD's, and they are the same 50% line Module 20
 * uses to pick matrix_recommended_path. 75 itself belongs to the middle tier —
 * the spec's third band reads "> 75%" and says explicitly "(לא כולל 75)".
 */
export function resolveRecommendationTier(scorePercent: number): RecommendationTier {
  if (scorePercent < 50) return "below_50";
  if (scorePercent <= 75) return "between_50_75";
  return "above_75";
}

/** Human-readable statement of layer 1's decision, handed to the engine as a constraint. */
const TIER_FRAMEWORK_HE: Record<RecommendationTier, string> = {
  below_50:
    "עבודה בקבוצה הומוגנית קטנה, תיווך פרונטלי צמוד של המורה, ושימוש בתבניות עשר פיזיות ומקלות מנייה.",
  between_50_75:
    "עבודה בקבוצה הטרוגנית הכוללת את שני הקצוות, שיח עמיתים ופתרון בעיות משותף באמצעות חשבונייה פיזית.",
  above_75:
    "עבודה עצמאית עם משימות האתגר והעומק של כיתה ג', ושימוש בלוח מחיק פיזי וכרטיסיות מספרים.",
};

/**
 * Appendix A §2 shape, carried server-side. Only the fields the analysis needs
 * are kept — see buildFailedExercises for why this is a whitelist.
 */
export interface ReportExerciseTemplate {
  exercise_template_id: string;
  session_number: number;
  order_index: number;
  learning_path: "green_path" | "remediation_path" | null;
  path_type: ExercisePathType;
  operation: "addition" | "subtraction" | "representation" | "inquiry";
  operand_a: number | null;
  operand_b: number | null;
  expected_result: number | string | null;
  required_regroupings: number;
  regrouping_columns: number[];
  label: string;
}

export interface ReportTelemetryEvent {
  event_type: string;
  exercise_id: string;
  column_index: number | null;
  details: Record<string, unknown>;
  /** Present when this entry stands for that many identical consecutive events. */
  count?: number;
}

export interface GeminiReportRequest {
  student_id: number;
  session_id: string;
  session_number: number;
  /** null in meeting 1, which is not scored (Module 14 §ב). */
  session_score_percent: number | null;
  /** null in meeting 1: no working group, so no framework to stay within. */
  recommendation_tier: RecommendationTier | null;
  failed_exercises: ReportExerciseTemplate[];
  telemetry_summary: ReportTelemetryEvent[];
  /** Meeting 1: the interface actions the learner never performed. */
  tools_not_used?: string[];
}

export interface GeminiReportResponse {
  knowledge_gaps: string[];
  teaching_recommendations: string[];
}

/**
 * The PRD's expected outcome for this module is a PDF produced in under a
 * second, while the same module mandates an AI-authored analysis layer and an
 * explicit timeout fallback. Those two cannot both hold on a cold model call,
 * so the timeout is the knob that decides which one gives, and the product
 * owner resolved it in favour of the analysis: a teacher pulling a summary
 * report on one learner is not in a hurry, and a report that actually names
 * the knowledge gaps is worth the wait. On expiry the report still ships
 * complete with layer 1 and the fixed fallback sentence, exactly as the spec
 * prescribes.
 *
 * This is a per-report ceiling on a single teacher click — reports are
 * generated one learner at a time (Module 23 §ג), so it never compounds across
 * a class.
 */
export const AI_ANALYSIS_TIMEOUT_MS = 10000;

/** How much the model thinks before it writes the analysis — set from measured runs (1.10.2026). */
export const REPORT_THINKING: GeminiThinking = "low";

/**
 * Every report is written in Hebrew (owner, 1.10.2026). A line with Latin
 * letters (an English sentence, an exercise id such as "s4_g_t1") or with a
 * term the Ministry does not use is refused: the model gets one corrected
 * retry when time allows, and a line that still breaks the rule is dropped.
 * When nothing usable is left, the report carries the PRD's exact fallback
 * sentence. Professional Hebrew for a teacher — the children's second person
 * plural does not apply here.
 */
/**
 * The terms the Ministry does not use — as the TERMS, never a word that only
 * looks like one (review of 1.10.2026: "מומלץ ללוות את הלומד" accompanies,
 * "בנושאים של ערך המקום" are topics, "הסברים מלווים בהדגמה" are accompanied —
 * all three were dropped from real reports).
 *  - Words that are always the wrong term, with any prefix: שארית, נשיאה,
 *    הלוואה, שבירה, לשבור, שוברים.
 *  - Words that are also ordinary Hebrew ("ללוות" accompanies, "נושאים" are
 *    topics): only as borrowing or carrying, that is, when what follows is a
 *    block, a ten, a 1 or a column — "ללוות עשרת", "לווים מטור העשרות",
 *    "נושאים את ה-1 לטור הבא". With "ו" as their only prefix: "מלווים"
 *    accompany, "שלווה" is calm.
 */
const REPORT_TERM_ALWAYS = /(^|[^א-ת])[ובלמהשכ]{0,3}(שארית|שאריות|נשיאה|נשיאת|הלוואה|הלוואת|הלוואות|שבירה|שבירת|לשבור|שוברים)(?![א-ת])/;
const BORROWED_OR_CARRIED = "(?:את\\s+)?(?:ה-?)?(?:עשרת|מאה|אלף|יחידה|1|מ(?:ה)?טור|לטור)(?![\\dא-ת])";
const REPORT_TERM_IN_CONTEXT = new RegExp(`(^|[^א-ת])ו?(ללוות|לווים|לווה|לוותה|לוו|נושאים|נושא|נושאת|לשאת|נשא|נשאה|נשאו)\\s+${BORROWED_OR_CARRIED}`);
export function reportTextViolation(items: string[]): string | null {
  for (const t of items) {
    if (/[A-Za-z]/.test(t)) return "the analysis must be in Hebrew only: no English words, no Latin letters and no exercise ids (name an exercise by its numbers)";
    const term = REPORT_TERM_ALWAYS.exec(t) ?? REPORT_TERM_IN_CONTEXT.exec(t);
    if (term) return `"${term[2]}" is not the Ministry's term: write הקבצה or המרה in addition and פריטה in subtraction`;
  }
  return null;
}

/** The arrays without the lines that still break the Hebrew-only rule. */
export function keepHebrewLines<T extends Record<string, string[]>>(arrays: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(arrays)) (out as Record<string, string[]>)[k] = v.filter((t) => reportTextViolation([t]) === null);
  return out;
}

/**
 * The model answered in the right shape with nothing in it: both arrays
 * present and without one written line. That is a learner with nothing to
 * report, not a malformed answer — it is counted as "empty", never as
 * "schema_reject" (review of 1.10.2026). The report still carries the PRD's
 * fallback sentence.
 */
export function isEmptyAnalysis(text: string | null, keys: readonly [string, string]): boolean {
  if (!text) return false;
  try {
    const p = JSON.parse(text) as Record<string, unknown>;
    return keys.every((k) => Array.isArray(p?.[k]) && (p[k] as unknown[]).every((x) => typeof x !== "string" || !x.trim()));
  } catch {
    return false;
  }
}

/**
 * The monitoring outcome of a report's analysis: "ok" with what is left, or
 * why nothing is — every line broke the Hebrew-only rule (language_reject),
 * the model had nothing to report (empty), or the answer was malformed.
 */
export function reportAnalysisOutcome(kept: boolean, linesDropped: boolean, lastText: string | null, keys: readonly [string, string]): { outcome: AiOutcome; detail?: string } {
  if (kept) return { outcome: "ok", ...(linesDropped ? { detail: "lines dropped: not Hebrew-only" } : {}) };
  if (linesDropped) return { outcome: "language_reject", detail: "every line broke the Hebrew-only rule" };
  if (isEmptyAnalysis(lastText, keys)) return { outcome: "empty", detail: "the model found nothing to report" };
  return { outcome: "schema_reject", detail: "missing or malformed arrays" };
}

/** A second try starts only if it can still finish inside the report's budget. */
export const REPORT_RETRY_MIN_MS = 4000;

/** Appendix A §7: the two arrays and nothing else. */
const REPORT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    knowledge_gaps: { type: "ARRAY", items: { type: "STRING" } },
    teaching_recommendations: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["knowledge_gaps", "teaching_recommendations"],
  propertyOrdering: ["knowledge_gaps", "teaching_recommendations"],
} as const;

const COLUMN_NAMES_HE = ["אחדות", "עשרות", "מאות", "אלפים"];

/**
 * The analysis is read by a teacher, in the Ministry's terms (1.10.2026: the
 * first real analyses called a carried ten "שארית" and a grouping "פריטה",
 * and named exercises by their ids).
 */
export const REPORT_TERMS_HE = "מונחים: בחיבור — הקבצה או המרה, והעשרת שעוברת לטור הבא נרשמת בעיגול הזיכרון; בחיסור — פריטה. לעולם לא \"שארית\", \"נשיאה\", \"הלוואה\" או \"שבירה\". תרגיל מזכירים לפי המספרים שלו (למשל 1,245 + 328), לא לפי המזהה שלו.";

/**
 * Builds the exercise templates for the exercises the learner actually erred
 * on, preferring the canonical Module 26 catalog in Firestore and falling back
 * to what the telemetry itself proves when a bank is unavailable.
 *
 * Fields are copied one by one rather than spread. Zero-PII is a structural
 * guarantee here, not a regex applied afterwards: nothing reaches the engine
 * except values this function names explicitly, so no field added to a task or
 * an event upstream can ever ride along unnoticed.
 */
export function buildFailedExercises(
  failedExerciseIds: string[],
  regroupingColumnsByExercise: Record<string, number[]>,
  catalogTasks: Record<string, any>[],
  sessionNumber: number,
  learningPath: "green_path" | "remediation_path" | null
): ReportExerciseTemplate[] {
  const byId = new Map<string, Record<string, any>>();
  catalogTasks.forEach((task, idx) => {
    if (task && typeof task.id === "string") {
      byId.set(task.id, { ...task, __order: idx + 1 });
    }
  });

  return failedExerciseIds.map((exerciseId) => {
    const task = byId.get(exerciseId);
    const regroupingColumns = regroupingColumnsByExercise[exerciseId] || [];

    if (!task) {
      // No catalog entry — describe only what the telemetry itself establishes.
      return {
        exercise_template_id: exerciseId,
        session_number: sessionNumber,
        order_index: 0,
        learning_path: learningPath,
        // The choice banks are not in the catalog; the id still says what the exercise is.
        path_type: exercisePathType(exerciseId),
        operation: "addition",
        operand_a: null,
        operand_b: null,
        expected_result: null,
        required_regroupings: regroupingColumns.length,
        regrouping_columns: regroupingColumns,
        label: exerciseId,
      };
    }

    const isSubtraction = task.isSubtraction === true;
    const operation: ReportExerciseTemplate["operation"] =
      task.type === "missing_element" || task.type === "inquiry"
        ? "inquiry"
        : task.type === "representation"
        ? "representation"
        : isSubtraction
        ? "subtraction"
        : "addition";

    return {
      exercise_template_id: exerciseId,
      session_number: sessionNumber,
      order_index: typeof task.__order === "number" ? task.__order : 0,
      learning_path: learningPath,
      // A challenge exercise is "challenge", not "consolidation" (Appendix A §2).
      path_type: exercisePathType(exerciseId, task),
      operation,
      operand_a: typeof task.numberA === "number" ? task.numberA : null,
      operand_b: typeof task.numberB === "number" ? task.numberB : null,
      expected_result:
        typeof task.correctAnswer === "number" || typeof task.correctAnswer === "string"
          ? task.correctAnswer
          : null,
      required_regroupings: regroupingColumns.length,
      regrouping_columns: regroupingColumns,
      label: typeof task.titleHe === "string" ? task.titleHe : exerciseId,
    };
  });
}

/**
 * The exercises the learner erred on, and the columns each one's regroupings
 * fell in, taken from the telemetry rather than assumed from the score.
 *
 * An exercise counts as erred on when either
 *   - a DIGIT_ENTERED in it carries is_correct === false, or
 *   - its PROBLEM_COMPLETE carries error_count > 0.
 * The second covers the representation exercises: they have no typed result,
 * and their errors are failed board checks, which the client counts into
 * error_count (Module 23 §ב, measure 3). Reading wrong digits only left those
 * exercises out of the engine's input entirely.
 */
export function collectFailedExercises(telemetryDocs: Record<string, any>[]): {
  failedExerciseIds: string[];
  regroupingColumnsByExercise: Record<string, number[]>;
} {
  const failedExerciseIds: string[] = [];
  const regroupingColumnsByExercise: Record<string, number[]> = {};
  for (const doc of telemetryDocs) {
    const exId = String(doc?.exercise_id || "");
    if (!exId || !isExerciseEvent(doc)) continue;
    const isWrongDigit =
      doc.event_type === "DIGIT_ENTERED" && doc.details?.is_correct === false;
    const errorCount = doc.details?.error_count;
    const isFailedCompletion =
      doc.event_type === "PROBLEM_COMPLETE" && typeof errorCount === "number" && errorCount > 0;
    if ((isWrongDigit || isFailedCompletion) && !failedExerciseIds.includes(exId)) {
      failedExerciseIds.push(exId);
    }
    if (doc.event_type === "REGROUPING_SUCCESS" || doc.event_type === "REGROUPING_TRIGGERED") {
      const col = doc.column_index;
      if (typeof col === "number") {
        const cols = regroupingColumnsByExercise[exId] || [];
        if (!cols.includes(col)) cols.push(col);
        regroupingColumnsByExercise[exId] = cols;
      }
    }
  }
  return { failedExerciseIds, regroupingColumnsByExercise };
}

/**
 * The detail fields the engine receives. Every one is a number, a boolean, or
 * a value from a fixed enum (Appendix A §3) — never free text, so nothing a
 * learner typed or a name can ride along (Zero-PII, Module 3).
 */
const TELEMETRY_DETAIL_KEYS = [
  "is_correct",
  "digit_value",
  "deleted_digit_value",
  "block_value",
  "source_column_index",
  "hesitation_seconds",
  "regrouping_type",
  "duration_ms",
  "trigger_reason",
  "error_category",
  "option_id",
  "reverted_event_type",
  "undo_stack_depth_before",
  "reflection_step",
  "effort_score",
  "persistence_index",
  "total_duration_ms",
  "undo_count",
  "error_count",
  "action",
  "source",
  "conversion_required",
  "help_count",
  "blocks_removed",
  // PLACE_CUES_SHOWN (register deviation 28): regular | enhanced.
  "profile",
] as const;

/**
 * Reduces raw telemetry documents to the whitelisted event shape the engine
 * receives. Same reasoning as buildFailedExercises: an explicit projection, not
 * a scrub of arbitrary content.
 *
 * Module 23 §ב: the engine receives "מלוא נתוני הטלמטריה של הלומד באותו
 * מפגש". This used to send the first 120 events only, so in a meeting of a
 * few hundred events the analysis never saw the later exercises — the ones
 * where a learner who struggles usually struggles most.
 *
 * Every event of the meeting is sent. What keeps the input small is
 * compaction, not truncation: consecutive events that are identical in every
 * field the engine receives (six drags of a ten into the same column, say)
 * become one entry with `count`. Nothing is dropped — the sum of the counts is
 * the number of events — and the order is kept. The model's context window
 * (about a million tokens for gemini-2.5-flash) is far beyond a meeting; the
 * real constraint is the 10-second analysis timeout, which grows with input
 * size, and that is what the compaction serves.
 */
export function buildTelemetrySummary(telemetryDocs: Record<string, any>[]): ReportTelemetryEvent[] {
  const out: ReportTelemetryEvent[] = [];
  let lastKey = "";
  for (const doc of telemetryDocs) {
    const raw = (doc && typeof doc.details === "object" && doc.details) || {};
    const details: Record<string, unknown> = {};
    for (const key of TELEMETRY_DETAIL_KEYS) {
      const value = raw[key];
      if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
        details[key] = value;
      }
    }
    // `profile` is PLACE_CUES_SHOWN's enum (register deviation 28) and nothing
    // else: any other value, or the key on another event, does not reach the engine.
    if (!(doc?.event_type === "PLACE_CUES_SHOWN" && (details.profile === "regular" || details.profile === "enhanced"))) {
      delete details.profile;
    }
    const event: ReportTelemetryEvent = {
      event_type: String(doc?.event_type || "UNKNOWN"),
      exercise_id: String(doc?.exercise_id || ""),
      column_index: typeof doc?.column_index === "number" ? doc.column_index : null,
      details,
    };
    const key = JSON.stringify(event);
    const previous = out[out.length - 1];
    if (previous && key === lastKey) {
      previous.count = (previous.count ?? 1) + 1;
      continue;
    }
    out.push(event);
    lastKey = key;
  }
  return out;
}

/**
 * Meeting 1: no score, no tier. The engine is asked the question meeting 1
 * exists for — what could make tomorrow's diagnostic measure the interface or
 * rust instead of the learner's knowledge.
 */
function buildSandboxSystemInstruction(): string {
  return `אתה מנתח פדגוגי של מערכת MathematiCore, המנתח את נתוני תלמיד כיתה ג' במפגש 1.

${SANDBOX_MEETING_PURPOSE_HE}

מטרת הניתוח: לזהות מה עלול להפוך טעות של הלומד באבחון לרעש במקום לראיה — כלי ממשק שעוד לא הפעיל, ונושא ריענון שבו התקשה.

חוקים מחייבים:
1. אל תציין ציון, אחוז, דירוג, קבוצת עבודה או מסלול. במפגש זה אין כאלה.
2. אל תפנה לתלמיד ואל תנקוב בשם. התלמיד אנונימי ומזוהה במספר בלבד.
3. בסס כל טענה על הראיות שבנתונים — כלים, תרגילים, טורים ואירועים קונקרטיים. אל תמציא נתונים שאינם בקלט.
4. כתוב בעברית תקנית, ענייני ותמציתי. כל פריט משפט אחד עד שניים.
5. החזר JSON תקין בלבד, לפי הסכימה:
{
  "knowledge_gaps": ["string", ...],
  "teaching_recommendations": ["string", ...]
}
ב-knowledge_gaps: נקודות לתשומת לב לקראת האבחון. ב-teaching_recommendations: מה המורה יכולה לעשות עם הלומד לפני האבחון.
2 עד 4 פריטים בכל מערך. אם אין די ראיות, החזר מערכים ריקים.

מונחי הטורים: ${COLUMN_NAMES_HE.map((n, i) => `${i}=${n}`).join(", ")}.
${REPORT_TERMS_HE}`;
}

function buildSystemInstruction(tier: RecommendationTier): string {
  return `אתה מנתח פדגוגי של מערכת MathematiCore, המנתח נתוני ביצוע של תלמיד כיתה ג' בחשבון (ערך מיקום, הקבצה, פריטה וחישוב במאונך).

מסגרת ההמלצה כבר נקבעה בשרת לפי כלל אחוזים דטרמיניסטי, והיא סופית:
"${TIER_FRAMEWORK_HE[tier]}"

חוקים מחייבים:
1. חל עליך איסור מוחלט לשנות, לסתור, או להמליץ בניגוד למסגרת שלמעלה. אל תציע סוג קבוצת עבודה אחר ואל תציע עזרי המחשה פיזיים הסותרים אותה. ההמלצות שלך פועלות בתוך המסגרת הזאת בלבד.
2. אל תציין ציון, אחוז או דירוג כלשהו. שכבת הכללים כבר מציגה אותם.
3. אל תפנה לתלמיד ואל תנקוב בשם. התלמיד אנונימי ומזוהה במספר בלבד.
4. בסס כל טענה על הראיות שבנתונים — טורים, מספרים ואירועים קונקרטיים. אל תמציא נתונים שאינם בקלט.
5. כתוב בעברית תקנית, ענייני ותמציתי. כל פריט משפט אחד עד שניים.
6. החזר JSON תקין בלבד, לפי הסכימה:
{
  "knowledge_gaps": ["string", ...],
  "teaching_recommendations": ["string", ...]
}
2 עד 4 פריטים בכל מערך. אם אין די ראיות לפער כלשהו, החזר מערכים ריקים.

מונחי הטורים: ${COLUMN_NAMES_HE.map((n, i) => `${i}=${n}`).join(", ")}.
${REPORT_TERMS_HE}`;
}

/**
 * Runs layer 2. Returns null on ANY failure — missing credential, malformed
 * response, timeout — so the caller falls back to layer 1 plus the fixed
 * sentence. This function never throws.
 */
export async function generateReportAnalysis(
  req: GeminiReportRequest
): Promise<GeminiReportResponse | null> {
  // Nothing to analyse: the learner made no recorded errors, so there is no
  // gap to describe and inventing one would contradict rule 4.
  if (req.failed_exercises.length === 0 && req.telemetry_summary.length === 0) {
    return null;
  }

  const started = Date.now();
  const monitor = (outcome: AiOutcome, detail?: string) =>
    recordAiCall({ feature: "report_analysis", outcome, latency_ms: Date.now() - started, model_id: GEMINI_MODEL_ID, student_id: req.student_id, session_id: req.session_id, detail });
  try {
    const systemInstruction = req.recommendation_tier === null
      ? buildSandboxSystemInstruction()
      : buildSystemInstruction(req.recommendation_tier);

    const sandbox = req.recommendation_tier === null;
    const toolsLine = sandbox
      ? `\nכלי ממשק שהלומד לא הפעיל במפגש: ${JSON.stringify(req.tools_not_used ?? [])}\n`
      : "";
    const closing = sandbox
      ? "נסח את הנקודות לתשומת לב לקראת האבחון ואת מה שהמורה יכולה לעשות עם הלומד לפני האבחון."
      : "נסח את פערי הידע הספציפיים שאותרו ואת המלצות ההוראה להמשך העבודה בכיתה הפיזית, בתוך המסגרת שנקבעה.";
    const userPrompt = `נתוני הלומד לניתוח:

מזהה אנונימי: ${req.student_id}
מפגש: ${req.session_number}
${toolsLine}
תרגילים שבהם נרשמו שגיאות (תבניות מלאות):
${JSON.stringify(req.failed_exercises, null, 2)}

רצף כל אירועי הטלמטריה במפגש, לפי סדר התרחשותם (רשומה שיש בה count מייצגת count אירועים זהים רצופים):
${JSON.stringify(req.telemetry_summary)}

${closing}`;

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), AI_ANALYSIS_TIMEOUT_MS);
    });
    const call = generateGeminiText({
      systemInstruction,
      prompt: userPrompt,
      temperature: 0.3,
      json: true,
      responseSchema: REPORT_RESPONSE_SCHEMA,
      // A teacher's report is not in a hurry (owner): more thinking, better reading of the data.
      thinking: REPORT_THINKING,
      timeoutMs: AI_ANALYSIS_TIMEOUT_MS,
    }).then((r) => r.text);

    const text = await Promise.race([call, timeout]);
    if (timer) clearTimeout(timer);
    if (text === null) {
      logger.warn("[reportAnalysis] Gemini analysis timed out; report ships with layer 1 only.", {
        session_id: req.session_id,
        timeout_ms: AI_ANALYSIS_TIMEOUT_MS,
      });
      monitor("timeout");
      return null;
    }

    let parsed = parseAnalysisResponse(text, req.session_id);
    let lastText: string | null = text;
    const violation = parsed ? reportTextViolation([...parsed.knowledge_gaps, ...parsed.teaching_recommendations]) : null;
    const remaining = AI_ANALYSIS_TIMEOUT_MS - (Date.now() - started);
    if (violation && remaining >= REPORT_RETRY_MIN_MS) {
      let retryTimer: NodeJS.Timeout | undefined;
      const retryTimeout = new Promise<null>((resolve) => {
        retryTimer = setTimeout(() => resolve(null), remaining);
      });
      const retry = generateGeminiText({
        systemInstruction,
        prompt: `${userPrompt}\n\nהתשובה הקודמת נדחתה: ${violation}. החזר את ה-JSON שוב, בעברית בלבד.`,
        temperature: 0.3,
        json: true,
        responseSchema: REPORT_RESPONSE_SCHEMA,
        thinking: REPORT_THINKING,
        timeoutMs: remaining,
      }).then((r) => r.text).catch(() => null);
      const retryText = await Promise.race([retry, retryTimeout]);
      if (retryTimer) clearTimeout(retryTimer);
      const second = retryText ? parseAnalysisResponse(retryText, req.session_id) : null;
      if (second) {
        parsed = second;
        lastText = retryText;
      }
    }
    let linesDropped = false;
    if (parsed) {
      const kept = keepHebrewLines({ knowledge_gaps: parsed.knowledge_gaps, teaching_recommendations: parsed.teaching_recommendations });
      linesDropped = kept.knowledge_gaps.length + kept.teaching_recommendations.length < parsed.knowledge_gaps.length + parsed.teaching_recommendations.length;
      parsed = kept.knowledge_gaps.length || kept.teaching_recommendations.length ? kept : null;
    }
    const result = reportAnalysisOutcome(parsed !== null, linesDropped, lastText, ["knowledge_gaps", "teaching_recommendations"]);
    monitor(result.outcome, result.detail);
    return parsed;
  } catch (err) {
    logger.warn("[reportAnalysis] Gemini analysis unavailable; report ships with layer 1 only.", {
      session_id: req.session_id,
      error: String((err as Error)?.message ?? err).slice(0, 300),
    });
    monitor(classifyGeminiError(err));
    return null;
  }
}

/**
 * A response missing either array is malformed and is treated exactly like a
 * failed call, so the report falls back to the fixed sentence rather than
 * rendering half of a section.
 *
 * Junk *inside* an otherwise well-formed array is handled differently, and
 * deliberately: a non-string or blank entry is dropped and the rest are kept.
 * Three real knowledge gaps plus one stray number is still three real gaps for
 * the teacher, and discarding them all would be the worse trade. Only a
 * response that yields nothing usable at all falls back.
 */
export function parseAnalysisResponse(
  text: string,
  sessionId = ""
): GeminiReportResponse | null {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    logger.warn("[reportAnalysis] Gemini returned non-JSON; treating as unavailable.", {
      session_id: sessionId,
    });
    return null;
  }

  // Returns null only when the field is not an array at all — that is the
  // malformed case. An array with unusable entries returns the usable ones.
  const clean = (value: unknown): string[] | null => {
    if (!Array.isArray(value)) return null;
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  const gaps = clean(parsed?.knowledge_gaps);
  const recommendations = clean(parsed?.teaching_recommendations);
  if (gaps === null || recommendations === null) {
    logger.warn("[reportAnalysis] Gemini response missing required arrays; treating as unavailable.", {
      session_id: sessionId,
    });
    return null;
  }
  if (gaps.length === 0 && recommendations.length === 0) return null;

  return { knowledge_gaps: gaps, teaching_recommendations: recommendations };
}
