/**
 * What the child reads above an exercise's instruction, instead of its title.
 *
 * Owner decision, 27.9.2026 (register, approved deviation 24): the exercise
 * titles are the teacher's professional names ("משימת חקר ואינטגרציה",
 * "המרה עצמאית בין עזרים וירטואליים") and the child no longer sees them. The
 * titles stay in the data for the teacher's screens, the reports and the
 * documents. The child sees where it is in the meeting:
 *
 *  - a compulsory exercise: "תרגיל 3 מתוך 7";
 *  - an exercise of the choice path (meetings 3–7): "תרגיל בחירה";
 *  - the diagnostic's correction round (owner, 4.10.2026): the task itself
 *    coming back is "תרגיל חוזר"; the new exercise in round numbers shown
 *    before it (tasks 3, 6, 7) is "תרגיל נוסף" — each heading repeats the
 *    toast that opens its step (useWorkspaceStore, 'start_correction');
 *  - meeting 1 — PRD Module 14 §ב: a sandbox with no numbered compulsory
 *    tasks, so nothing there carries a number. Its tool steps (type
 *    session1_intro) are "משימת היכרות"; its refresh exercises are "תרגיל".
 *
 * Owner decision, 7.10.2026 (register, approved deviation 24): the child's
 * word for an exercise is "תרגיל", not "משימה" — the word a third-grade
 * classroom uses for something with a number to solve. Only meeting 1's
 * tool steps keep "משימה": they ask the child to try a tool, not to solve.
 */
export interface TaskPositionInput {
  sessionNumber: number;
  /** The diagnostic's correction round (meeting 2). */
  isCorrection?: boolean;
  /** The correction round's new exercise in round numbers, shown before the task itself returns. */
  isCorrectionProbe?: boolean;
  /** An exercise of the choice path, after the seven compulsory ones. */
  isChoice?: boolean;
  /** One of meeting 1's tool steps (type session1_intro), not a refresh exercise. */
  isIntro?: boolean;
  /** Meeting 1's target step (347): "משימת היעד", as its instruction and מסמך 03 call it (owner, 7.10.2026). */
  isTarget?: boolean;
  /** 1-based place in the meeting's compulsory list, or null when unknown. */
  position: number | null;
  /** Length of the meeting's compulsory list. */
  total: number;
}

export const TASK_LABEL_HE = {
  intro: 'משימת היכרות',
  target: 'משימת היעד',
  choice: 'תרגיל בחירה',
  correction: 'תרגיל חוזר',
  correctionProbe: 'תרגיל נוסף',
  fallback: 'תרגיל',
} as const;

export function taskPositionLabelHe({ sessionNumber, isCorrection, isCorrectionProbe, isChoice, isIntro, isTarget, position, total }: TaskPositionInput): string {
  if (sessionNumber === 1) return isTarget ? TASK_LABEL_HE.target : isIntro ? TASK_LABEL_HE.intro : TASK_LABEL_HE.fallback;
  if (isCorrection) return isCorrectionProbe ? TASK_LABEL_HE.correctionProbe : TASK_LABEL_HE.correction;
  if (isChoice) return TASK_LABEL_HE.choice;
  if (position !== null && position >= 1 && total >= position) return `תרגיל ${position} מתוך ${total}`;
  return TASK_LABEL_HE.fallback;
}
