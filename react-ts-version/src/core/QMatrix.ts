export type TaskPhase = "primary" | "correction";
export type CorrectionSubphase = "subtask" | "retry";

export type QMatrixResults = Record<string, string | null>;

export interface BackwardDiagnosis {
  triggerOn: string;
  subtaskNumber?: number;
  asdSubtaskNumber?: number;
  subtaskInstructionHe?: string;
  subtaskChoices?: { id: string; textHe: string }[];
  correctChoice?: string;
  deviationPct?: number;
  subtaskRange?: [number, number];
  asdSubtaskRange?: [number, number];
  asdAnchors?: number[];
  showAutoUngroup?: boolean;
  probeA?: number;
  probeB?: number;
  probeAnswer?: number;
  asdProbeA?: number;
  asdProbeB?: number;
  asdProbeAnswer?: number;
  probeInstructionHe?: string;
  graphicOrganizerASD?: boolean;
  visualHint?: boolean;
  hintHe?: string;
}

export interface QMatrixTask {
  id: string;
  type: "place_value_zero" | "digit_value" | "vertical_addition" | "number_breakdown" | "conversion" | "flexible_decomp" | "small_change" | "missing_element";
  isSubtraction?: boolean;
  titleHe: string;
  instructionHe: string;
  /** The instruction in the correction round, where it differs (task 1: "הפעם פתרו לבד" is said once, the first time). */
  retryInstructionHe?: string;
  number?: number;
  highlightedDigit?: string;
  highlightIndex?: number;
  asdNumber?: number;
  numberA?: number;
  numberB?: number;
  asdNumberA?: number;
  asdNumberB?: number;
  correctAnswer?: number;
  asdCorrectAnswer?: number;
  choices?: { id: string; textHe: string }[];
  correctChoice?: string;
  expectedBlocks?: { hundreds?: number; tens?: number; units?: number };
  asdExpectedBlocks?: { hundreds?: number; tens?: number; units?: number };
  range?: [number, number];
  asdRange?: [number, number];
  errorMarginPct?: number;
  scaffoldLevel?: number;
  validRepresentations?: { hundreds?: number; tens?: number; units?: number; thousands?: number }[];
  asdValidRepresentations?: { hundreds?: number; tens?: number; units?: number; thousands?: number }[];
  givenHe?: string;
  /** Meeting 2, task 5: how many unit blocks the still picture shows (the question itself). */
  pictureUnitBlocks?: number;
  questionHe?: string;
  flexibilityTrapChoice?: string;
  backwardDiagnosis?: BackwardDiagnosis;
}

/**
 * The diagnostic tasks answered in ONE free answer box, judged by the whole
 * number in it when "ממשיכים" is pressed: task 2 (owner, 28.9.2026) and task 1
 * (owner, 4.10.2026 — "תיבה אחת לכל הילדים"). Three boxes prevented the two
 * errors task 1 is there to catch: 65 left a visibly empty box, and 6005 could
 * not be typed. No headings, no place colours, for every learner. By the
 * task's id, so nothing published elsewhere can change the form.
 */
const ONE_ANSWER_BOX_TASK_IDS: readonly string[] = ['task1_read_write_zero', 'task2_digit_value'];

export function hasOneDiagnosticAnswerBox(task: Pick<QMatrixTask, 'id' | 'type'> | null | undefined): boolean {
  return Boolean(task) && (ONE_ANSWER_BOX_TASK_IDS.includes(task!.id) || task!.type === 'digit_value');
}

/**
 * 7 משימות האבחון הרשמיות של מפגש 2 לפי מסמך PRD v7.0 סעיף 3.2:
 * 1. קריאה וכתיבה של מספר תלת-ספרתי ("שש מאות וחמש" -> 605)
 * 2. זיהוי וייצוג ערך ספרה (ערך הספרה 4 במספר 742 -> 40)
 * 3. חיסור חד-שלבי עם פריטה בתחום המאה (42 - 15 = 27)
 * 4. פירוק מספר תלת-ספרתי לרכיביו ("חמש מאות שישים ושלוש" -> 5 מאות, 6 עשרות, 3 יחידות = 563)
 * 5. המרה עצמאית בין עזרים וירטואליים (25 לבני יחידה -> 2 עשרות, 5 יחידות = 25)
 * 6. חיבור במאונך עם המרה מעל מאה (124 + 85 = 209)
 * 7. חיסור במאונך עם פריטה דרך אפס בטור העשרות (405 - 132 = 273)
 */
export const TASKS: QMatrixTask[] = [
  {
    id: "task1_read_write_zero",
    type: "place_value_zero",
    titleHe: "קריאה וכתיבה של מספר תלת-ספרתי",
    instructionHe: "קראו את המספר וכתבו אותו בשורת התוצאה. הפעם פתרו לבד.",
    retryInstructionHe: "קראו את המספר וכתבו אותו בשורת התוצאה.",
    givenHe: "שש מאות וחמש",
    correctAnswer: 605,
    expectedBlocks: { hundreds: 6, tens: 0, units: 5 },
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeInstructionHe: "כתבו בספרות: שש מאות וחמש.",
      probeAnswer: 605,
    },
  },
  {
    id: "task2_digit_value",
    type: "digit_value",
    titleHe: "זיהוי וייצוג ערך ספרה",
    instructionHe: "מה הערך של הספרה המסומנת? כתבו אותו בתיבה.",
    givenHe: "742",
    number: 742,
    highlightedDigit: "4",
    highlightIndex: 1,
    correctAnswer: 40,
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeInstructionHe: "מה ערך הספרה 4 במספר 742? כתבו את התשובה.",
      probeAnswer: 40,
    },
  },
  {
    id: "task3_subtraction_regrouping",
    type: "vertical_addition",
    isSubtraction: true,
    titleHe: "חיסור חד-שלבי עם פריטה בתחום המאה",
    instructionHe: "פתרו את תרגיל החיסור וכתבו את התשובה בשורת התוצאה!",
    numberA: 42,
    numberB: 15,
    correctAnswer: 27,
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeA: 40,
      probeB: 10,
      probeAnswer: 30,
      probeInstructionHe: "פתרו את התרגיל וכתבו את התשובה.",
    },
  },
  {
    id: "task4_decompose_number",
    type: "number_breakdown",
    titleHe: "פירוק מספר תלת-ספרתי לרכיביו",
    instructionHe: "כתבו בשורת התוצאה כמה מאות, עשרות ויחידות יש במספר שעל המסך.",
    givenHe: "חמש מאות שישים ושלוש",
    correctAnswer: 563,
    expectedBlocks: { hundreds: 5, tens: 6, units: 3 },
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeInstructionHe: "כתבו בספרות: חמש מאות שישים ושלוש.",
      probeAnswer: 563,
    },
  },
  {
    id: "task5_units_to_tens",
    type: "conversion",
    titleHe: "המרה עצמאית בין עזרים וירטואליים",
    instructionHe: "אם תקבצו לעשרות את הלבנים שעל המסך, כמה עשרות וכמה יחידות יהיו? כתבו את התשובה בשורת התוצאה.",
    givenHe: "25 לבני יחידה",
    pictureUnitBlocks: 25,
    correctAnswer: 25,
    expectedBlocks: { tens: 2, units: 5 },
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeInstructionHe: "אם תקבצו לעשרות את הלבנים שעל המסך, כמה עשרות וכמה יחידות יהיו? כתבו את התשובה בשורת התוצאה.",
      probeAnswer: 25,
    },
  },
  {
    id: "task6_vertical_addition",
    type: "vertical_addition",
    isSubtraction: false,
    titleHe: "חיבור במאונך עם המרה מעל מאה",
    instructionHe: "פתרו את תרגיל החיבור וכתבו את התשובה בשורת התוצאה!",
    numberA: 124,
    numberB: 85,
    correctAnswer: 209,
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      // Owner, 29.9.2026: the simpler exercise has no carry at all (120 + 80
      // still carried in the tens), as 40 − 10 has no borrow for task 3.
      probeA: 120,
      probeB: 70,
      probeAnswer: 190,
      probeInstructionHe: "פתרו את התרגיל וכתבו את התשובה.",
    },
  },
  {
    id: "task7_subtraction_zero_tens",
    type: "vertical_addition",
    isSubtraction: true,
    titleHe: "חיסור במאונך עם פריטה דרך אפס בטור העשרות",
    instructionHe: "פתרו את תרגיל החיסור וכתבו את התשובה בשורת התוצאה!",
    numberA: 405,
    numberB: 132,
    correctAnswer: 273,
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      // Owner, 29.9.2026: no borrow at all (400 − 130 kept the borrow into
      // the zero tens) — round numbers, the operation alone.
      probeA: 400,
      probeB: 100,
      probeAnswer: 300,
      probeInstructionHe: "פתרו את התרגיל וכתבו את התשובה.",
    },
  },
];

export class QMatrixEvaluator {
  static evaluateGeneric(
    task: QMatrixTask,
    answer: number | null,
    _phase: TaskPhase = "primary",
    _subphase: CorrectionSubphase = "subtask"
  ) {
    if (answer === null || Number.isNaN(answer)) {
      return { correct: false, detail: "missing_answer", triggerBackward: false };
    }
    const isCorrect = answer === task.correctAnswer;
    return {
      correct: isCorrect,
      detail: isCorrect ? "" : "wrong_answer",
      triggerBackward: !isCorrect,
    };
  }

  static evaluateQ1(
    task: QMatrixTask,
    answer: number | null,
    phase: TaskPhase = "primary",
    subphase: CorrectionSubphase = "subtask"
  ) {
    return this.evaluateGeneric(task, answer, phase, subphase);
  }

  static evaluateQ2(
    task: QMatrixTask,
    answer: number | null,
    phase: TaskPhase = "primary",
    subphase: CorrectionSubphase = "subtask"
  ) {
    return this.evaluateGeneric(task, answer, phase, subphase);
  }

  static evaluateQ3(
    task: QMatrixTask,
    answer: number | null,
    phase: TaskPhase = "primary",
    subphase: CorrectionSubphase = "subtask"
  ) {
    return this.evaluateGeneric(task, answer, phase, subphase);
  }

  static evaluateQ4(
    task: QMatrixTask,
    answer: number | null,
    phase: TaskPhase = "primary",
    subphase: CorrectionSubphase = "subtask"
  ) {
    return this.evaluateGeneric(task, answer, phase, subphase);
  }

  static evaluateQ5(
    task: QMatrixTask,
    answer: number | null,
    phase: TaskPhase = "primary",
    subphase: CorrectionSubphase = "subtask"
  ) {
    return this.evaluateGeneric(task, answer, phase, subphase);
  }

  static evaluateQ6(
    task: QMatrixTask,
    answer: number | null,
    phase: TaskPhase = "primary",
    subphase: CorrectionSubphase = "subtask"
  ) {
    return this.evaluateGeneric(task, answer, phase, subphase);
  }

  static evaluateQ7(
    task: QMatrixTask,
    answer: number | null,
    phase: TaskPhase = "primary",
    subphase: CorrectionSubphase = "subtask"
  ) {
    return this.evaluateGeneric(task, answer, phase, subphase);
  }
}

export type CognitiveConcept =
  | 'decimal_structure'
  | 'number_magnitude'
  | 'regrouping_fluency'
  | 'procedural_fluency'
  | 'relational_thinking'
  | 'algebraic_reasoning';

/**
 * שלושת התחומים שמפגש 2 מאבחן, בשמות של מסמך 03 (§"מפגש שתיים", מטרה
 * פדגוגית): "המבנה העשרוני והאפס, הקבצה ופריטה, וחישוב במאונך".
 * החלטת בעל המוצר 26.9.2026: מסך "מיפוי מיומנויות כיתתי" והדוחות מציגים
 * את שלושת אלה בלבד.
 *
 * שלושת המפתחות הנוספים (number_magnitude, relational_thinking,
 * algebraic_reasoning) אינם נמדדים על ידי אף משימת אבחון; הם נשארים בטיפוס
 * כי פרופיל השליטה שכבר נשמר ב-RTDB מכיל אותם, אבל אינם מוצגים למורה.
 */
export const DIAGNOSTIC_DOMAINS = ['decimal_structure', 'regrouping_fluency', 'procedural_fluency'] as const;
export type DiagnosticDomain = (typeof DIAGNOSTIC_DOMAINS)[number];

export const CONCEPT_LABELS_HE: Record<CognitiveConcept, string> = {
  decimal_structure: 'המבנה העשרוני והאפס',
  number_magnitude: 'תחושת גודל המספר',
  regrouping_fluency: 'הקבצה ופריטה',
  procedural_fluency: 'חישוב במאונך',
  relational_thinking: 'חשיבה יחסית',
  algebraic_reasoning: 'חשיבה אלגברית ומציאת נעלם',
};

/**
 * "הקבצה ופריטה" הוא שם התחום, אבל שתי היכולות נספרות בנפרד (הוראת בעל
 * המוצר 26.9.2026): בכל מקום שמוצגת תוצאה למשימה, כתוב איזו מהשתיים נמדדה.
 * המרה של יחידות לעשרות וחיבור עם המרה הם הקבצה; חיסור עם פריטה הוא
 * פריטה. משימה שאינה כאן אינה מודדת אף אחת מהשתיים.
 */
export type RegroupingKind = 'grouping' | 'decomposition';

export const REGROUPING_KIND_LABELS_HE: Record<RegroupingKind, string> = {
  grouping: 'הקבצה',
  decomposition: 'פריטה',
};

export const REGROUPING_KIND_BY_TASK: Record<string, RegroupingKind> = {
  task3_subtraction_regrouping: 'decomposition',
  task5_units_to_tens: 'grouping',
  task6_vertical_addition: 'grouping',
  task7_subtraction_zero_tens: 'decomposition',
};

/** כותרת המשימה כפי שהמורה רואה אותה — עם "(הקבצה)" או "(פריטה)" כשהיא מודדת אחת מהן. */
export function diagnosticTaskLabelHe(task: Pick<QMatrixTask, 'id' | 'titleHe'>): string {
  const kind = REGROUPING_KIND_BY_TASK[task.id];
  return kind ? `${task.titleHe} (${REGROUPING_KIND_LABELS_HE[kind]})` : task.titleHe;
}

export interface RegroupingKindScore {
  attempted: number;
  succeeded: number;
  /** null כשאף משימה מהסוג הזה לא נוסתה. */
  ratio: number | null;
}

/**
 * שני חלקי "הקבצה ופריטה" בנפרד, מתוך תוצאות משימות האבחון של הלומד. המספר
 * המאוחד (regrouping_fluency בפרופיל) לעולם לא מוצג בלי שני אלה לצידו.
 */
export function computeRegroupingSplit(
  results: Record<string, unknown> | null | undefined
): Record<RegroupingKind, RegroupingKindScore> {
  const split: Record<RegroupingKind, RegroupingKindScore> = {
    grouping: { attempted: 0, succeeded: 0, ratio: null },
    decomposition: { attempted: 0, succeeded: 0, ratio: null },
  };
  for (const [taskId, kind] of Object.entries(REGROUPING_KIND_BY_TASK)) {
    const status = getQTaskStatus(readQTaskValue(results, taskId));
    if (status === 'not_attempted') continue;
    split[kind].attempted++;
    if (status === 'mastered') split[kind].succeeded++;
  }
  for (const kind of Object.keys(split) as RegroupingKind[]) {
    const s = split[kind];
    s.ratio = s.attempted > 0 ? s.succeeded / s.attempted : null;
  }
  return split;
}

export interface RegroupingDomainView {
  /** המספר המאוחד על ארבע המשימות; null כשאין תוצאות ואין פרופיל שמור. */
  combined: number | null;
  /** 'live' — חושב עכשיו מתוצאות המשימות; 'stored' — מהפרופיל שנשמר; 'none' — אין. */
  source: 'live' | 'stored' | 'none';
  split: Record<RegroupingKind, RegroupingKindScore>;
}

/**
 * תחום "הקבצה ופריטה" של לומד אחד, כפי שהדשבורד מציג אותו. כשיש תוצאות
 * משימות, המספר המאוחד מחושב מהן עכשיו — על אותן ארבע משימות שהחלוקה
 * להקבצה ופריטה מחושבת עליהן — ולא מהפרופיל שנשמר (פרופיל של לומד שסיים
 * לפני 26.9.2026 נספר גם על משימה 4). הפרופיל השמור משמש רק כשאין תוצאות.
 */
export function computeRegroupingDomain(
  results: Record<string, unknown> | null | undefined,
  storedCombined?: number | null
): RegroupingDomainView {
  const split = computeRegroupingSplit(results);
  const attempted = split.grouping.attempted + split.decomposition.attempted;
  if (attempted > 0) {
    const succeeded = split.grouping.succeeded + split.decomposition.succeeded;
    return { combined: succeeded / attempted, source: 'live', split };
  }
  if (typeof storedCombined === 'number') return { combined: storedCombined, source: 'stored', split };
  return { combined: null, source: 'none', split };
}

/**
 * כלל בעל המוצר (26.9.2026): אין ערבוב. לומד נמצא מתחת לסף בתחום "הקבצה
 * ופריטה" אם המספר המאוחד מתחתיו — או אם אחד משני החלקים לבדו מתחתיו. כך
 * לומד עם הקבצה 2/2 ופריטה 0/2 (מאוחד 0.5) נספר כמתקשה. הווידג'ט, כרטיס
 * הקבוצה והתרשים הכיתתי משתמשים כולם בפונקציה הזו.
 */
export function isRegroupingBelow(view: RegroupingDomainView, threshold: number): boolean {
  if (view.combined === null) return false;
  if (view.combined < threshold) return true;
  const g = view.split.grouping.ratio;
  const d = view.split.decomposition.ratio;
  return (g !== null && g < threshold) || (d !== null && d < threshold);
}

export const Q_MATRIX_MAPPING: Record<string, CognitiveConcept[]> = {
  // שבע משימות האבחון (מודול 20) על שלושת התחומים של מסמך 03.
  // משימה 4 (פירוק 563 למאות, עשרות ויחידות) בודקת את המבנה העשרוני בלבד —
  // אין בה הקבצה ולא פריטה, ולכן אינה נספרת ב"הקבצה ופריטה".
  task1_read_write_zero: ['decimal_structure'],
  task2_digit_value: ['decimal_structure'],
  task3_subtraction_regrouping: ['procedural_fluency', 'regrouping_fluency'],
  task4_decompose_number: ['decimal_structure'],
  task5_units_to_tens: ['regrouping_fluency'],
  task6_vertical_addition: ['procedural_fluency', 'regrouping_fluency'],
  task7_subtraction_zero_tens: ['decimal_structure', 'procedural_fluency', 'regrouping_fluency'],
  // Legacy Aliases (Backward Compatibility)
  // Each alias carries exactly what its canonical task carries (Q_LEGACY_TASK_ALIASES).
  task1_zero_placeholder: ['decimal_structure'],
  task3_flexible_regrouping: ['decimal_structure'],
  task4_basic_addition_fluency: ['procedural_fluency', 'regrouping_fluency'],
  task5_small_change: ['regrouping_fluency'],
  task6_subtraction_regrouping: ['procedural_fluency', 'regrouping_fluency'],
  task7_missing_subtrahend: ['decimal_structure', 'procedural_fluency', 'regrouping_fluency'],
};

export type MasteryProfile = Record<CognitiveConcept, number>;

export function computeCognitiveMastery(results: Record<string, string | null>): MasteryProfile {
  const conceptAttempts: Record<CognitiveConcept, number> = {
    decimal_structure: 0,
    number_magnitude: 0,
    regrouping_fluency: 0,
    procedural_fluency: 0,
    relational_thinking: 0,
    algebraic_reasoning: 0,
  };

  const conceptSuccesses: Record<CognitiveConcept, number> = {
    decimal_structure: 0,
    number_magnitude: 0,
    regrouping_fluency: 0,
    procedural_fluency: 0,
    relational_thinking: 0,
    algebraic_reasoning: 0,
  };

  for (const [taskId, tag] of Object.entries(results)) {
    const requiredConcepts = Q_MATRIX_MAPPING[taskId];
    if (!requiredConcepts) continue;

    for (const concept of requiredConcepts) {
      conceptAttempts[concept]++;
      if (tag === 'success' || tag === 'correct') {
        conceptSuccesses[concept]++;
      }
    }
  }

  const profile: Partial<MasteryProfile> = {};
  for (const c of Object.keys(conceptAttempts) as CognitiveConcept[]) {
    profile[c] = conceptAttempts[c] > 0 ? conceptSuccesses[c] / conceptAttempts[c] : 1.0;
  }

  return profile as MasteryProfile;
}

/**
 * מודול 20: שלושת המצבים שמשימת אבחון יכולה להיות בהם.
 *
 * הערך עצמו נכתב על ידי זרימת האבחון של הלומד (core/qmatrixFlow.ts) ל-
 * QMatrixResults, והוא תמיד מחרוזת או null — לעולם לא בוליאני. כל מסך
 * שמציג תוצאות אבחון חייב לקרוא אותו דרך getQTaskStatus, כדי ששלושת
 * המצבים לא יתפרשו אחרת במסך אחר.
 */
export type QTaskStatus = 'not_attempted' | 'mastered' | 'needs_support';

/** התיוג שנרשם כשהלומד ניגש למשימה, נכשל, ולא סווג לו צומת שגיאה מסוים. */
export const Q_FAIL_TAG = 'fail';

/**
 * מפתחות ישנים שנכתבו בגרסאות קודמות לאותן שבע משימות חובה.
 * מפתח קנוני -> המפתח הישן שעשוי להופיע במקומו ברשומות קיימות.
 */
export const Q_LEGACY_TASK_ALIASES: Record<string, string> = {
  task1_read_write_zero: 'task1_zero_placeholder',
  task3_subtraction_regrouping: 'task6_subtraction_regrouping',
  task4_decompose_number: 'task3_flexible_regrouping',
  task5_units_to_tens: 'task5_small_change',
  task6_vertical_addition: 'task4_basic_addition_fluency',
  task7_subtraction_zero_tens: 'task7_missing_subtrahend',
};

/** קורא את ערך המשימה מהמפתח הקנוני, ואם אין — מהמפתח הישן. */
export function readQTaskValue(
  results: Record<string, unknown> | null | undefined,
  taskId: string
): unknown {
  const r = results ?? {};
  if (r[taskId] !== undefined && r[taskId] !== null) return r[taskId];
  const legacy = Q_LEGACY_TASK_ALIASES[taskId];
  return legacy ? r[legacy] : undefined;
}

/**
 * המרת ערך גולמי מ-QMatrixResults לאחד משלושת המצבים.
 * ריק/חסר = לא ניגש. 'success' = שולט. כל ערך אחר (שם צומת שגיאה או 'fail')
 * = ניגש ולא פתר, כלומר דרוש חיזוק.
 */
export function getQTaskStatus(value: unknown): QTaskStatus {
  if (value === null || value === undefined || value === '') return 'not_attempted';
  if (value === true || value === 'success' || value === 'correct') return 'mastered';
  return 'needs_support';
}

/**
 * שבע משימות החובה שהלומד ניגש אליהן ולא פתר — מה שהמורה צריכה לראות
 * לפני שהיא מאשרת מסלול בשער המעבר למפגש 3 (מודול 20).
 */
export function getFailedDiagnosticTasks(
  results: Record<string, unknown> | null | undefined
): QMatrixTask[] {
  return TASKS.filter((t) => getQTaskStatus(readQTaskValue(results, t.id)) === 'needs_support');
}
