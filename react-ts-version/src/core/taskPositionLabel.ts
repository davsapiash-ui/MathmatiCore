/**
 * What the child reads above an exercise's instruction, instead of its title.
 *
 * Owner decision, 27.9.2026 (register, approved deviation 24): the exercise
 * titles are the teacher's professional names ("משימת חקר ואינטגרציה",
 * "המרה עצמאית בין עזרים וירטואליים") and the child no longer sees them. The
 * titles stay in the data for the teacher's screens, the reports and the
 * documents. The child sees where it is in the meeting:
 *
 *  - a compulsory exercise: "משימה 3 מתוך 7";
 *  - an exercise of the choice path (meetings 3–7): "משימת בחירה";
 *  - an exercise of the diagnostic's correction round: "משימה חוזרת";
 *  - meeting 1: "משימת היכרות" — PRD Module 14 §ב: meeting 1 is a sandbox
 *    with no numbered compulsory tasks, so it carries no number.
 */
export interface TaskPositionInput {
  sessionNumber: number;
  /** The diagnostic's correction round (meeting 2). */
  isCorrection?: boolean;
  /** An exercise of the choice path, after the seven compulsory ones. */
  isChoice?: boolean;
  /** 1-based place in the meeting's compulsory list, or null when unknown. */
  position: number | null;
  /** Length of the meeting's compulsory list. */
  total: number;
}

export const TASK_LABEL_HE = {
  intro: 'משימת היכרות',
  choice: 'משימת בחירה',
  correction: 'משימה חוזרת',
  fallback: 'משימה',
} as const;

export function taskPositionLabelHe({ sessionNumber, isCorrection, isChoice, position, total }: TaskPositionInput): string {
  if (sessionNumber === 1) return TASK_LABEL_HE.intro;
  if (isCorrection) return TASK_LABEL_HE.correction;
  if (isChoice) return TASK_LABEL_HE.choice;
  if (position !== null && position >= 1 && total >= position) return `משימה ${position} מתוך ${total}`;
  return TASK_LABEL_HE.fallback;
}
