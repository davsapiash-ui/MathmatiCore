export interface QMatrixOption {
  id: string;
  text: string;
  is_correct: boolean;
}

export interface QMatrixItem {
  q_id: string;
  trigger_condition: string;
  pedagogical_goal: string;
  question_text: string;
  options: QMatrixOption[];
  visual_cue?: string;
}

/**
  Hardcoded Socratic Q-Matrix catalog for diagnostic tasks and VRA error conditions.
  Strictly adheres to Zero-Generation Policy (no free-text LLM generation).
 */
export const QMATRIX_ITEMS: QMatrixItem[] = [
  // Common VRA Error Conditions
  {
    q_id: 'SQ_SUB_TENS_01',
    trigger_condition: "hesitation_timeout && current_column == 'tens'",
    pedagogical_goal: 'זיהוי צורך בפריטה',
    question_text: 'האם יש לנו מספיק עשרות כדי להחסיר?',
    options: [
      { id: 'A', text: 'כן, אפשר להמשיך.', is_correct: false },
      { id: 'B', text: 'לא, נצטרך לפרוט מאה אחת לעשרות.', is_correct: true },
    ],
    visual_cue: 'highlight_hundreds_column',
  },
  {
    q_id: 'SQ_ADD_ONES_01',
    trigger_condition: "hesitation_timeout && current_column == 'ones'",
    pedagogical_goal: 'זיהוי צורך בהקבצה בטור היחידות',
    question_text: 'האם יש יותר מ-9 יחידות בטור היחידות?',
    options: [
      { id: 'A', text: 'כן, יש להקביץ 10 יחידות לעשרת אחת.', is_correct: true },
      { id: 'B', text: 'לא, מותר להשאיר 10 יחידות ומעלה באותו טור.', is_correct: false },
    ],
    visual_cue: 'highlight_ones_column',
  },
  {
    q_id: 'SQ_REGROUP_HUNDREDS_01',
    trigger_condition: "hesitation_timeout && current_column == 'hundreds'",
    pedagogical_goal: 'זיהוי פריטת מאות לעשרות',
    question_text: 'כשפורטים 1 מאה, כמה עשרות מקבלים?',
    options: [
      { id: 'A', text: '10 עשרות.', is_correct: true },
      { id: 'B', text: '1 עשרת.', is_correct: false },
    ],
    visual_cue: 'highlight_tens_column',
  },
  {
    q_id: 'SQ_HESITATION_GENERIC',
    trigger_condition: 'hesitation_timer_expire',
    pedagogical_goal: 'הכוונה בעת השהייה במשימה',
    question_text: 'מה הצעד הבא שיש לבצע כדי להתקדם בתרגיל?',
    options: [
      { id: 'A', text: 'לבחון אם נדרשת פריטה או הקבצה בטור הנוכחי.', is_correct: true },
      { id: 'B', text: 'להקליד תשובה אקראית במקלדת.', is_correct: false },
    ],
    visual_cue: 'highlight_active_column',
  },

  // 8 Diagnostic Tasks
  {
    q_id: 'SQ_TASK1_ZERO_PLACEHOLDER',
    trigger_condition: 'task1_zero_placeholder_trigger',
    pedagogical_goal: 'הבנת האפס כאיבר שומר מקום',
    question_text: 'מהו תפקיד האפס במספר 805?',
    options: [
      { id: 'A', text: 'האפס שומר על טור העשרות, ומראה שאין עשרות במספר זה.', is_correct: true },
      { id: 'B', text: 'האפס מיותר לחלוטין ואפשר למחוק אותו.', is_correct: false },
    ],
    visual_cue: 'highlight_tens_column',
  },

  {
    q_id: 'SQ_TASK3_FLEXIBLE_DECOMP',
    trigger_condition: 'task3_flexible_decomp_trigger',
    pedagogical_goal: 'זיהוי ייצוגים שונים של אותו מספר',
    question_text: 'איך עוד ניתן לייצג את המספר 520 בעזרת פריטה?',
    options: [
      { id: 'A', text: '4 מאות ו-12 עשרות', is_correct: true },
      { id: 'B', text: '5 מאות ו-12 עשרות', is_correct: false },
    ],
    visual_cue: 'highlight_blocks',
  },
  {
    q_id: 'SQ_TASK4_ADDITION_FLUENCY',
    trigger_condition: 'task4_addition_fluency_trigger',
    pedagogical_goal: 'ביסוס אלגוריתם החיבור במאונך',
    question_text: 'מה עושים כשסכום היחידות גדול מ-9?',
    options: [
      { id: 'A', text: 'מעבירים 1 עשרת לטור העשרות (הקבצה).', is_correct: true },
      { id: 'B', text: 'כותבים את שני המספרים בטור היחידות.', is_correct: false },
    ],
    visual_cue: 'highlight_ones_column',
  },
  {
    q_id: 'SQ_TASK5_SMALL_CHANGE',
    trigger_condition: 'task5_small_change_trigger',
    pedagogical_goal: 'חשיבה יחסית',
    question_text: 'אם 545 + 10 = 555, כמה הם 545 + 9?',
    options: [
      { id: 'A', text: '554 — כי 9 קטן ב-1 מ-10.', is_correct: true },
      { id: 'B', text: '556 — כי הוסיפו 1.', is_correct: false },
    ],
    visual_cue: 'highlight_expression',
  },
  {
    q_id: 'SQ_TASK6_SUBTRACTION_REGROUPING',
    trigger_condition: 'task6_subtraction_regrouping_trigger',
    pedagogical_goal: 'ביסוס אלגוריתם החיסור עם פריטה',
    question_text: 'כאשר אין מספיק יחידות לחיסור, מאיפה פורטים?',
    options: [
      { id: 'A', text: 'פורטים עשרת אחת מטור העשרות ל-10 יחידות.', is_correct: true },
      { id: 'B', text: 'מחברים את המספרים במקום להחסיר.', is_correct: false },
    ],
    visual_cue: 'highlight_tens_column',
  },
  {
    q_id: 'SQ_TASK7_MISSING_SUBTRAHEND',
    trigger_condition: 'task7_missing_subtrahend_trigger',
    pedagogical_goal: 'חשיבה אלגברית ומציאת המחסר',
    question_text: 'כיצד מוצאים את המחסר במשוואה 640 - ? = 425?',
    options: [
      { id: 'A', text: 'מחוסר פחות הפרש (640 - 425).', is_correct: true },
      { id: 'B', text: 'מחברים את 640 ו-425.', is_correct: false },
    ],
    visual_cue: 'highlight_equation',
  },
  {
    q_id: 'SQ_TASK8_MISSING_ADDEND',
    trigger_condition: 'task8_missing_addend_trigger',
    pedagogical_goal: 'חשיבה אלגברית ומציאת המחבר',
    question_text: 'כיצד מוצאים את המחבר במשוואה 380 + ? = 645?',
    options: [
      { id: 'A', text: 'סכום פחות מחובר ידוע (645 - 380).', is_correct: true },
      { id: 'B', text: 'מחברים את 380 ו-645.', is_correct: false },
    ],
    visual_cue: 'highlight_equation',
  },
];

/**
  Retrieves a QMatrixItem by trigger condition or item q_id.
 */
export function getQMatrixItemByTrigger(trigger: string): QMatrixItem | undefined {
  return QMATRIX_ITEMS.find(
    (item) => item.trigger_condition === trigger || item.q_id === trigger
  );
}
