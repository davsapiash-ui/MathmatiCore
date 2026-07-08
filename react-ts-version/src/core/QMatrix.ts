export type TaskPhase = "primary" | "correction";
export type CorrectionSubphase = "subtask" | "retry";

/** Per-task diagnostic outcome map pushed to Firebase (taskId → correct / metric). */
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
  type: "place_value_zero" | "number_line" | "flexible_decomp" | "vertical_addition" | "small_change" | "missing_element";
  isSubtraction?: boolean;
  titleHe: string;
  instructionHe: string;
  number?: number;
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

export const TASKS: QMatrixTask[] = [
  {
    id: "task1_zero_placeholder",
    type: "place_value_zero",
    titleHe: "המבנה העשרוני (שומר מקום)",
    instructionHe: "בנו את המספר המופיע למטה בלוח המחקר, ואז בחרו את המסקנה הנכונה:",
    number: 805,
    asdNumber: 70,
    choices: [
      { id: "א", textHe: "האפס שומר על טור העשרות, ומראה שאין עשרות במספר זה." },
      { id: "ב", textHe: "האפס לא באמת משנה, המספר הוא בדיוק כמו 85." },
      { id: "ג", textHe: "האפס רק מקשט את המספר, ואפשר למחוק אותו." },
    ],
    correctChoice: "א",
    expectedBlocks: { hundreds: 8, tens: 0, units: 5 },
    asdExpectedBlocks: { tens: 7, units: 0 },
    backwardDiagnosis: {
      triggerOn: "wrong_choice",
      subtaskNumber: 70,
      asdSubtaskNumber: 30,
      subtaskInstructionHe: "בואו נקטין את המספר במיקרוסקופ ונבדוק שוב: מה עושה האפס במספר?",
      subtaskChoices: [
        { id: "א", textHe: "הוא שומר על המקום של טור היחידות, ומראה שאין לנו יחידות כלל." },
        { id: "ב", textHe: "האפס מיותר לחלוטין ואפשר למחוק אותו." },
      ],
      correctChoice: "א",
    },
  },
  {
    id: "task2_estimation_error_margin",
    type: "number_line",
    titleHe: "רצף וסדר על ישר המספרים",
    instructionHe: "בואו נבדוק השערה: היכן לדעתכם ימוקם המספר {{number}} על ציר המעבדה? גררו את הסמן למיקום מקורב.",
    number: 750,
    range: [0, 1000],
    asdNumber: 35,
    asdRange: [0, 100],
    errorMarginPct: 0.07,
    backwardDiagnosis: {
      triggerOn: "large_deviation",
      deviationPct: 0.15,
      subtaskNumber: 35,
      subtaskRange: [0, 100],
      asdSubtaskNumber: 15,
      asdSubtaskRange: [0, 50],
      subtaskInstructionHe: "בואו ניקח ציר קצר יותר ונדגום שוב: איפה נמקם את המספר?",
      asdAnchors: [10, 20, 30, 40, 50, 60, 70, 80, 90],
    },
  },
  {
    id: "task3_flexible_regrouping",
    type: "flexible_decomp",
    scaffoldLevel: 2,
    titleHe: "פירוק והרכבה לפי המבנה העשרוני",
    instructionHe: "בנו את המספר {{number}} בלוח המחקר, ולחצו \"הוסף ייצוג\". לאחר מכן, חקרו ומצאו דרך נוספת לייצג את אותו המספר ולחצו שוב! (רמז: נסו להיעזר בפריטה).",
    number: 520,
    asdNumber: 34,
    validRepresentations: [
      { hundreds: 5, tens: 2, units: 0 },
      { hundreds: 4, tens: 12, units: 0 },
      { hundreds: 5, tens: 1, units: 10 },
      { hundreds: 3, tens: 22, units: 0 },
    ],
    asdValidRepresentations: [
      { tens: 3, units: 4 },
      { tens: 2, units: 14 },
      { tens: 1, units: 24 },
    ],
    backwardDiagnosis: {
      triggerOn: "only_canonical",
      subtaskInstructionHe: "ניסוי מודרך: לחיצה כפולה על עשרת אחת תפרק אותה ל-10 יחידות. נסו זאת ואז הוסיפו את הייצוג החדש.",
      showAutoUngroup: true,
      subtaskNumber: 34,
      asdSubtaskNumber: 34,
    },
  },
  {
    id: "task4_basic_addition_fluency",
    type: "vertical_addition",
    titleHe: "חיבור במאונך של מספרים",
    instructionHe: "חקרו את תרגיל החיבור בעזרת ציוד המעבדה (הבלוקים), ורשמו את המסקנה בתיבות התשובה.",
    numberA: 478,
    numberB: 356,
    asdNumberA: 26,
    asdNumberB: 15,
    correctAnswer: 834,
    asdCorrectAnswer: 41,
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeA: 40,
      probeB: 30,
      probeAnswer: 70,
      probeInstructionHe: "בואו נדגום תרגיל קטן יותר כדי לכייל את החשיבה: כמה הם 40 ועוד 30?",
      graphicOrganizerASD: true,
    },
  },
  {
    id: "task5_small_change",
    type: "small_change",
    titleHe: "השינוי הקטן — אומדן",
    instructionHe: "הביטו בניסוי שביצענו עבורכם. נסו לענות על השאלה הבאה בלי לחשב מחדש, רק בעזרת חשיבה מדעית והיגיון!",
    givenHe: "545 + 10 = 555",
    questionHe: "כמה הם 545 + 9?",
    choices: [
      { id: "א", textHe: "554 — כי חיברנו 9 במקום 10, ולכן הסכום קטן ב-1." },
      { id: "ב", textHe: "555 — הסכום תמיד נשאר זהה." },
      { id: "ג", textHe: "556 — כי הוספנו עוד יחידה אחת." },
      { id: "ד", textHe: "חייבים לחשב הכול מחדש בשביל לדעת." },
    ],
    correctChoice: "א",
    flexibilityTrapChoice: "ד",
    backwardDiagnosis: {
      triggerOn: "flexibility_trap",
      visualHint: true,
      hintHe: "רמז: אם נוסיף 9 במקום 10, אנחנו בעצם מוסיפים יחידה אחת פחות. איך זה משפיע על סכום התרגיל?",
    },
  },
  {
    id: "task6_subtraction_regrouping",
    type: "vertical_addition",
    isSubtraction: true,
    titleHe: "חיסור עם פריטה",
    instructionHe: "בצעו את ניסוי החיסור בעזרת ציוד המעבדה (הבלוקים), ורשמו את המסקנה בתיבות התשובה.",
    numberA: 832,
    numberB: 458,
    asdNumberA: 22,
    asdNumberB: 8,
    correctAnswer: 374,
    asdCorrectAnswer: 14,
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeA: 550,
      probeB: 120,
      asdProbeA: 15,
      asdProbeB: 4,
      probeAnswer: 430,
      asdProbeAnswer: 11,
      probeInstructionHe: "בואו נבדוק חיסור נקי ללא פריטה: כמה הם 550 פחות 120?",
      graphicOrganizerASD: true,
    },
  },
  {
    id: "task7_missing_subtrahend",
    type: "missing_element",
    isSubtraction: true,
    titleHe: "מציאת המחסר",
    instructionHe: "השלימו את המספר החסר במשוואה כדי שהתבנית תהיה שלמה.",
    numberA: 640,
    correctAnswer: 215,
    numberB: 425,
    asdNumberA: 20,
    asdCorrectAnswer: 6,
    asdNumberB: 14,
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeA: 100,
      probeAnswer: 30,
      probeB: 70,
      asdProbeA: 5,
      asdProbeAnswer: 2,
      asdProbeB: 3,
      probeInstructionHe: "בואו נבחן תבנית קטנה יותר: כמה צריך לחסר מ-100 כדי לקבל 70?",
    }
  },
  {
    id: "task8_missing_addend",
    type: "missing_element",
    isSubtraction: false,
    titleHe: "מציאת המחבר",
    instructionHe: "השלימו את המספר החסר במשוואה כדי שהתבנית תהיה שלמה.",
    numberA: 380,
    correctAnswer: 265,
    numberB: 645,
    asdNumberA: 14,
    asdCorrectAnswer: 6,
    asdNumberB: 20,
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeA: 70,
      probeAnswer: 30,
      probeB: 100,
      asdProbeA: 3,
      asdProbeAnswer: 2,
      asdProbeB: 5,
      probeInstructionHe: "בואו נבחן תבנית קטנה יותר: כמה צריך לחבר ל-70 כדי לקבל 100?",
    }
  }
];

export class QMatrixEvaluator {
  static getEffectiveNumber(task: QMatrixTask, phase: TaskPhase, subphase: CorrectionSubphase, isASD: boolean) {
    if (phase === "correction" && subphase === "subtask") {
      if (isASD && task.backwardDiagnosis?.asdSubtaskNumber !== undefined) return task.backwardDiagnosis.asdSubtaskNumber;
      if (task.backwardDiagnosis?.subtaskNumber !== undefined) return task.backwardDiagnosis.subtaskNumber;
    }
    return isASD && task.asdNumber !== undefined ? task.asdNumber : task.number;
  }

  static evaluateQ1(
    task: QMatrixTask,
    selectedChoice: string,
    blockCounts: { hundreds?: number; tens?: number; units?: number },
    phase: TaskPhase,
    subphase: CorrectionSubphase,
    isASD: boolean
  ) {
    if (phase === "correction" && subphase === "subtask") {
      const correct = selectedChoice === task.backwardDiagnosis?.correctChoice;
      return { correct, detail: correct ? "" : "wrong_subtask_choice", triggerBackward: false };
    }
    const choiceCorrect = selectedChoice === task.correctChoice;
    const expected = isASD && task.asdExpectedBlocks ? task.asdExpectedBlocks : task.expectedBlocks;
    
    let blockCorrect = true;
    if (expected) {
      blockCorrect = 
        (blockCounts.hundreds || 0) === (expected.hundreds || 0) &&
        (blockCounts.tens || 0) === (expected.tens || 0) &&
        (blockCounts.units || 0) === (expected.units || 0);
    }
    
    // Pedagogical Rule: Do not force concrete manipulative usage in the primary phase if abstract mastery (choice) is shown.
    // However, in the correction retry round, we enforce building the blocks to prove understanding.
    const enforceBlocks = phase === "correction" && subphase === "retry";
    const correct = choiceCorrect && (!enforceBlocks || blockCorrect);
    
    return {
      correct,
      detail: correct ? "" : choiceCorrect ? "wrong_blocks" : "wrong_choice",
      triggerBackward: !correct, // If they failed, trigger backward diagnosis
    };
  }

  static evaluateQ2(
    task: QMatrixTask,
    markerValue: number,
    phase: TaskPhase,
    subphase: CorrectionSubphase,
    isASD: boolean
  ) {
    if (phase === "correction" && subphase === "subtask") {
      const target = task.backwardDiagnosis!.subtaskNumber!;
      const rangeSize = task.backwardDiagnosis!.subtaskRange![1] - task.backwardDiagnosis!.subtaskRange![0];
      const deviation = Math.abs(markerValue - target);
      const deviationPct = deviation / rangeSize;
      const correct = deviationPct <= (task.errorMarginPct || 0.07);
      return { correct, deviation, deviationPct, detail: correct ? "" : `subtask_deviation_${Math.round(deviationPct * 100)}pct`, triggerBackward: false };
    }
    const target = isASD ? task.asdNumber! : task.number!;
    const rangeSize = isASD ? task.asdRange![1] - task.asdRange![0] : task.range![1] - task.range![0];
    const deviation = Math.abs(markerValue - target);
    const deviationPct = deviation / rangeSize;
    const correct = deviationPct <= (task.errorMarginPct || 0.07);
    const largeDev = deviationPct >= (task.backwardDiagnosis?.deviationPct || 0.15);
    return { correct, deviation, deviationPct, detail: correct ? "" : `deviation_${Math.round(deviationPct * 100)}pct`, triggerBackward: !correct && largeDev };
  }

  static evaluateQ3(
    task: QMatrixTask,
    representations: { hundreds?: number; tens?: number; units?: number; thousands?: number }[],
    phase: TaskPhase,
    subphase: CorrectionSubphase,
    isASD: boolean
  ) {
    let validArray = isASD ? task.asdValidRepresentations || [] : task.validRepresentations || [];
    if (phase === "correction" && subphase === "subtask") {
      // ASD subtask target is 34 (asdSubtaskNumber), so its valid decompositions must equal 34 —
      // not 14. (Both non-ASD and ASD subtask numbers are 34 here.)
      validArray = isASD ? [{ tens: 3, units: 4 }, { tens: 2, units: 14 }] : [{ tens: 3, units: 4 }, { tens: 2, units: 14 }, { tens: 1, units: 24 }];
    }
    
    const validatedReps = representations.filter((rep) =>
      validArray.some(
        (validRep) =>
          (rep.units || 0) === (validRep.units || 0) &&
          (rep.tens || 0) === (validRep.tens || 0) &&
          (rep.hundreds || 0) === (validRep.hundreds || 0) &&
          (rep.thousands || 0) === (validRep.thousands || 0)
      )
    );

    if (phase === "correction" && subphase === "subtask") {
      if (validatedReps.length < 2) return { correct: false, detail: "insufficient_reps", triggerBackward: false };
      const [r1, r2] = validatedReps;
      const different = (r1.units || 0) !== (r2.units || 0) || (r1.tens || 0) !== (r2.tens || 0) || (r1.hundreds || 0) !== (r2.hundreds || 0);
      return { correct: different, detail: different ? "" : "only_canonical", triggerBackward: false };
    }

    if (validatedReps.length < 2) return { correct: false, detail: "insufficient_reps", triggerBackward: true };
    const [r1, r2] = validatedReps;
    const different = (r1.units || 0) !== (r2.units || 0) || (r1.tens || 0) !== (r2.tens || 0) || (r1.hundreds || 0) !== (r2.hundreds || 0);
    return { correct: different, detail: different ? "" : "only_canonical", triggerBackward: !different };
  }

  static evaluateQ4(
    task: QMatrixTask,
    studentAnswer: number,
    phase: TaskPhase,
    subphase: CorrectionSubphase,
    isASD: boolean
  ) {
    if (phase === "correction" && subphase === "subtask") {
      const expectedProbe = isASD && task.backwardDiagnosis?.asdProbeAnswer !== undefined
        ? task.backwardDiagnosis.asdProbeAnswer
        : task.backwardDiagnosis?.probeAnswer;
      const correct = studentAnswer === expectedProbe;
      return { correct, detail: correct ? "" : "wrong_subtask_answer", triggerBackward: false };
    }
    const correct = isASD ? studentAnswer === task.asdCorrectAnswer : studentAnswer === task.correctAnswer;
    return { correct, detail: correct ? "" : "wrong_answer", triggerBackward: !correct };
  }

  static evaluateQ5(
    task: QMatrixTask,
    selectedChoice: string,
    phase: TaskPhase,
    subphase: CorrectionSubphase
  ) {
    const correct = selectedChoice === task.correctChoice;
    const isFlexibilityTrap = selectedChoice === task.flexibilityTrapChoice;
    if (phase === "correction" && subphase === "subtask") {
      return { correct, isFlexibilityTrap, detail: correct ? "" : "wrong_subtask_choice", triggerBackward: false };
    }
    return { correct, isFlexibilityTrap, detail: correct ? "" : isFlexibilityTrap ? "flexibility_trap" : "wrong_choice", triggerBackward: !correct };
  }

  static evaluateQ7(
    task: QMatrixTask,
    inputValue: number,
    phase: TaskPhase,
    subphase: CorrectionSubphase,
    isASD: boolean
  ) {
    if (phase === "correction" && subphase === "subtask") {
      const correctTarget = isASD ? task.backwardDiagnosis?.asdProbeAnswer : task.backwardDiagnosis?.probeAnswer;
      const correct = inputValue === correctTarget;
      return { correct, detail: correct ? "" : "wrong_subtask_answer", triggerBackward: false };
    }
    const correctTarget = isASD ? task.asdCorrectAnswer : task.correctAnswer;
    const correct = inputValue === correctTarget;
    return { correct, detail: correct ? "" : "wrong_answer", triggerBackward: !correct };
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
  number_magnitude: 'תחושת גודל ואומדן',
  regrouping_fluency: 'גמישות בהמרה ופריטה',
  procedural_fluency: 'שליטה בפרוצדורות ובעובדות',
  relational_thinking: 'חשיבה יחסית',
  algebraic_reasoning: 'חשיבה אלגברית ומציאת נעלם'
};

/**
 * The True Q-Matrix: Maps each task to the cognitive concepts it requires.
 */
export const Q_MATRIX_MAPPING: Record<string, CognitiveConcept[]> = {
  task1_zero_placeholder: ['decimal_structure'],
  task2_estimation_error_margin: ['number_magnitude'],
  task3_flexible_regrouping: ['decimal_structure', 'regrouping_fluency'],
  task4_basic_addition_fluency: ['procedural_fluency', 'regrouping_fluency'],
  task5_small_change: ['relational_thinking'],
  task6_subtraction_regrouping: ['procedural_fluency', 'regrouping_fluency'],
  task7_missing_subtrahend: ['algebraic_reasoning', 'procedural_fluency'],
  task8_missing_addend: ['algebraic_reasoning', 'procedural_fluency']
};

export type MasteryProfile = Record<CognitiveConcept, number>;

/**
 * Computes the mastery percentage (0.0 to 1.0) for each cognitive concept based on binary task results.
 * @param results A mapping from TaskId to string tags, where 'success' means successful completion.
 */
export function computeCognitiveMastery(results: Record<string, string | null>): MasteryProfile {
  const conceptAttempts: Record<CognitiveConcept, number> = {
    decimal_structure: 0,
    number_magnitude: 0,
    regrouping_fluency: 0,
    procedural_fluency: 0,
    relational_thinking: 0,
    algebraic_reasoning: 0
  };
  
  const conceptSuccesses: Record<CognitiveConcept, number> = {
    decimal_structure: 0,
    number_magnitude: 0,
    regrouping_fluency: 0,
    procedural_fluency: 0,
    relational_thinking: 0,
    algebraic_reasoning: 0
  };

  for (const [taskId, tag] of Object.entries(results)) {
    const requiredConcepts = Q_MATRIX_MAPPING[taskId];
    if (!requiredConcepts) continue;

    for (const concept of requiredConcepts) {
      conceptAttempts[concept]++;
      if (tag === 'success') {
        conceptSuccesses[concept]++;
      }
    }
  }

  const mastery: Partial<MasteryProfile> = {};
  for (const [conceptStr, attempts] of Object.entries(conceptAttempts)) {
    const concept = conceptStr as CognitiveConcept;
    if (attempts === 0) {
      mastery[concept] = 1.0; 
    } else {
      mastery[concept] = conceptSuccesses[concept] / attempts;
    }
  }

  return mastery as MasteryProfile;
}
