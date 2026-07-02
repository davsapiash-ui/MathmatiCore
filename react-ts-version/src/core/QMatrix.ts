export type TaskPhase = "primary" | "correction";
export type CorrectionSubphase = "subtask" | "retry";

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
  probeInstructionHe?: string;
  graphicOrganizerASD?: boolean;
  visualHint?: boolean;
  hintHe?: string;
}

export interface QMatrixTask {
  id: string;
  type: "place_value_zero" | "number_line" | "flexible_decomp" | "vertical_addition" | "small_change";
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
    titleHe: "שומר המקום",
    instructionHe: "בנו את המספר המופיע למטה בטבלת ערך המקום, ואז בחרו את התשובה הנכונה:",
    number: 304,
    asdNumber: 70,
    choices: [
      { id: "A", textHe: "האפס שומר על טור העשרות, ומראה שאין עשרות במספר זה." },
      { id: "B", textHe: "האפס לא באמת משנה, המספר הוא בדיוק כמו 34." },
      { id: "C", textHe: "האפס רק מקשט את המספר, ואפשר למחוק אותו." },
    ],
    correctChoice: "A",
    expectedBlocks: { hundreds: 3, tens: 0, units: 4 },
    asdExpectedBlocks: { tens: 7, units: 0 },
    backwardDiagnosis: {
      triggerOn: "wrong_choice",
      subtaskNumber: 70,
      asdSubtaskNumber: 30,
      subtaskInstructionHe: "בואו נבדוק על מספר קטן יותר: מה עושה האפס במספר?",
      subtaskChoices: [
        { id: "A", textHe: "הוא שומר על המקום של טור היחידות, ומראה שאין לנו יחידות כלל." },
        { id: "B", textHe: "האפס מיותר לחלוטין ואפשר למחוק אותו." },
      ],
      correctChoice: "A",
    },
  },
  {
    id: "task2_estimation_error_margin",
    type: "number_line",
    titleHe: "מסע על ישר המספרים",
    instructionHe: "היכן לדעתכם ממוקם המספר 750 על ישר המספרים? גררו את החץ למקום המתאים.",
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
      subtaskInstructionHe: "בואו ננסה על ישר קצר יותר: איפה נמקם את המספר?",
      asdAnchors: [10, 20, 30, 40, 50, 60, 70, 80, 90],
    },
  },
  {
    id: "task3_flexible_regrouping",
    type: "flexible_decomp",
    scaffoldLevel: 2,
    titleHe: "פירוק והרכבה גמישים",
    instructionHe: "בנו את המספר 240 בטבלת ערך המקום, ולחצו \"הוסף ייצוג\". לאחר מכן, מצאו דרך נוספת לייצג את אותו המספר ולחצו שוב! (רמז: נסו להיעזר בפריטה).",
    number: 240,
    asdNumber: 34,
    validRepresentations: [
      { hundreds: 2, tens: 4, units: 0 },
      { hundreds: 1, tens: 14, units: 0 },
      { hundreds: 2, tens: 3, units: 10 },
      { hundreds: 0, tens: 24, units: 0 },
    ],
    asdValidRepresentations: [
      { tens: 3, units: 4 },
      { tens: 2, units: 14 },
      { tens: 1, units: 24 },
    ],
    backwardDiagnosis: {
      triggerOn: "only_canonical",
      subtaskInstructionHe: "הדגמה מודרכת: לחץ פעמיים על עמודת עשרת אחת כדי לפרק אותה ל-10 יחידות, ואז הוסף את הייצוג החדש בטבלה.",
      showAutoUngroup: true,
      subtaskNumber: 34,
      asdSubtaskNumber: 34,
    },
  },
  {
    id: "task4_basic_addition_fluency",
    type: "vertical_addition",
    titleHe: "חיבור במאונך",
    instructionHe: "פתרו את תרגיל החיבור בטבלת ערך המקום, ורשמו את התוצאה בתיבות התשובה.",
    numberA: 126,
    numberB: 235,
    asdNumberA: 26,
    asdNumberB: 15,
    correctAnswer: 361,
    asdCorrectAnswer: 41,
    backwardDiagnosis: {
      triggerOn: "wrong_answer",
      probeA: 4,
      probeB: 3,
      probeAnswer: 7,
      probeInstructionHe: "בואו ננסה תרגיל קטן יותר כדי להתחמם: כמה הם 4 ועוד 3?",
      graphicOrganizerASD: true,
    },
  },
  {
    id: "q5_small_change",
    type: "small_change",
    titleHe: "השינוי הקטן — אומדן",
    instructionHe: "הביטו בתרגיל שפתרנו עבורכם. נסו לענות על השאלה הבאה בלי לחשב מחדש, רק בעזרת חשיבה והיגיון!",
    givenHe: "45 + 10 = 55",
    questionHe: "כמה הם 45 + 9?",
    choices: [
      { id: "A", textHe: "54 — כי חיברנו 9 במקום 10, ולכן הסכום קטן ב-1." },
      { id: "B", textHe: "55 — הסכום תמיד נשאר זהה." },
      { id: "C", textHe: "56 — כי הוספנו עוד יחידה אחת." },
      { id: "D", textHe: "חייבים לחשב הכול מחדש בשביל לדעת." },
    ],
    correctChoice: "A",
    flexibilityTrapChoice: "D",
    backwardDiagnosis: {
      triggerOn: "flexibility_trap",
      visualHint: true,
      hintHe: "רמז: אם נוסיף 9 במקום 10, אנחנו בעצם מוסיפים יחידה אחת פחות. איך זה משפיע על סכום התרגיל?",
    },
  },
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
    const correct = choiceCorrect && blockCorrect;
    return {
      correct,
      detail: correct ? "" : choiceCorrect ? "wrong_blocks" : "wrong_choice",
      triggerBackward: !correct,
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
      validArray = isASD ? [{ tens: 1, units: 4 }, { tens: 0, units: 14 }] : [{ tens: 3, units: 4 }, { tens: 2, units: 14 }, { tens: 1, units: 24 }];
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
      const correct = studentAnswer === task.backwardDiagnosis?.probeAnswer;
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
}
