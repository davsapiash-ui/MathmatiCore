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
  questionHe?: string;
  flexibilityTrapChoice?: string;
  backwardDiagnosis?: BackwardDiagnosis;
}

/**
 * 7 משימות האבחון הרשמיות של מפגש 2 לפי מסמך PRD v7.0 סעיף 3.2:
 * 1. קריאה וכתיבה של מספר תלת-ספרתי ("שש מאות וחמש" -> 605)
 * 2. זיהוי וייצוג ערך ספרה (ערך הספרה 4 במספר 742 -> 40)
 * 3. חיסור חד-שלבי עם פריטה בתחום המאה (42 - 15 = 27)
 * 4. פירוק מספר תלת-ספרתי לרכיביו ("חמש מאות ששים ושלוש" -> 5 מאות, 6 עשרות, 3 יחידות = 563)
 * 5. המרה עצמאית בין עזרים וירטואליים (25 קוביות יחידה -> 2 עשרות, 5 יחידות = 25)
 * 6. חיבור במאונך עם המרה מעל מאה (124 + 85 = 209)
 * 7. חיסור במאונך עם פריטה דרך אפס בטור העשרות (405 - 132 = 273)
 */
export const TASKS: QMatrixTask[] = [
  {
    id: "task1_read_write_zero",
    type: "place_value_zero",
    titleHe: "קריאה וכתיבה של מספר תלת-ספרתי",
    instructionHe: "קראו וכתבו מספרים בתיבות. הפעם פתרו לבד, ללא עזרים.",
    givenHe: "שש מאות וחמש",
    correctAnswer: 605,
    expectedBlocks: { hundreds: 6, tens: 0, units: 5 },
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeInstructionHe: "בואו נבדוק: שש מאות וחמש מכיל 6 מאות, 0 עשרות ו-5 יחידות.",
      probeAnswer: 605,
    },
  },
  {
    id: "task2_digit_value",
    type: "digit_value",
    titleHe: "זיהוי וייצוג ערך ספרה",
    instructionHe: "זהו את ערך הספרה המסומנת וכתבו אותה בתיבה המתאימה!",
    givenHe: "742",
    number: 742,
    highlightedDigit: "4",
    highlightIndex: 1,
    correctAnswer: 40,
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeInstructionHe: "הספרה 4 נמצאת בטור העשרות, ולכן ערכה הוא 4 עשרות (40).",
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
      probeInstructionHe: "בואו נבדוק: 42 פחות 15 שווה 27.",
    },
  },
  {
    id: "task4_decompose_number",
    type: "number_breakdown",
    titleHe: "פירוק מספר תלת-ספרתי לרכיביו",
    instructionHe: "כתבו בתיבות כמה מאות עשרות ויחידות יש במספר שעל המסך.",
    givenHe: "חמש מאות ששים ושלוש",
    correctAnswer: 563,
    expectedBlocks: { hundreds: 5, tens: 6, units: 3 },
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeInstructionHe: "חמש מאות ששים ושלוש = 5 מאות, 6 עשרות, 3 יחידות.",
      probeAnswer: 563,
    },
  },
  {
    id: "task5_units_to_tens",
    type: "conversion",
    titleHe: "המרה עצמאית בין עזרים וירטואליים",
    instructionHe: "קבעו כמה עשרות וכמה יחידות תקבלו מהקוביות שעל המסך וכתבו את התשובה בשורת התוצאה.",
    givenHe: "25 קוביות יחידה",
    correctAnswer: 25,
    expectedBlocks: { tens: 2, units: 5 },
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeInstructionHe: "25 יחידות מורכבות מ-2 עשרות ו-5 יחידות בודדות.",
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
      probeA: 120,
      probeB: 80,
      probeAnswer: 200,
      probeInstructionHe: "124 + 85 = 209.",
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
      probeA: 400,
      probeB: 130,
      probeAnswer: 270,
      probeInstructionHe: "405 פחות 132 שווה 273.",
    },
  },
];

export class QMatrixEvaluator {
  static evaluateGeneric(
    task: QMatrixTask,
    answer: number | null,
    phase: TaskPhase = "primary",
    subphase: CorrectionSubphase = "subtask"
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

export const CONCEPT_LABELS_HE: Record<CognitiveConcept, string> = {
  decimal_structure: 'הבנת המבנה העשרוני ושומר מקום',
  number_magnitude: 'תחושת גודל המספר',
  regrouping_fluency: 'גמישות בהמרה ופריטה',
  procedural_fluency: 'שליטה בפרוצדורות ובעובדות',
  relational_thinking: 'חשיבה יחסית',
  algebraic_reasoning: 'חשיבה אלגברית ומציאת נעלם',
};

export const Q_MATRIX_MAPPING: Record<string, CognitiveConcept[]> = {
  // Canonical 7 Tasks (PRD v7.0)
  task1_read_write_zero: ['decimal_structure'],
  task2_digit_value: ['decimal_structure'],
  task3_subtraction_regrouping: ['procedural_fluency', 'regrouping_fluency'],
  task4_decompose_number: ['decimal_structure', 'regrouping_fluency'],
  task5_units_to_tens: ['regrouping_fluency'],
  task6_vertical_addition: ['procedural_fluency', 'regrouping_fluency'],
  task7_subtraction_zero_tens: ['decimal_structure', 'procedural_fluency', 'regrouping_fluency'],
  // Legacy Aliases (Backward Compatibility)
  task1_zero_placeholder: ['decimal_structure'],
  task3_flexible_regrouping: ['decimal_structure', 'regrouping_fluency'],
  task4_basic_addition_fluency: ['procedural_fluency', 'regrouping_fluency'],
  task5_small_change: ['regrouping_fluency'],
  task6_subtraction_regrouping_legacy: ['procedural_fluency', 'regrouping_fluency'],
  task7_missing_subtrahend: ['algebraic_reasoning', 'relational_thinking'],
  task8_missing_addend: ['algebraic_reasoning', 'relational_thinking'],
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
