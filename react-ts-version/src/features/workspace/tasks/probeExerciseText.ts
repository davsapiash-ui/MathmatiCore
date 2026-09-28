import type { QMatrixTask } from '@/core/QMatrix';

/** The round-number exercise as the child reads it, left to right: "40 − 10 = ?". */
export function probeExerciseText(task: Pick<QMatrixTask, 'type' | 'isSubtraction'>, a: number, b: number | undefined): string {
  const op = task.isSubtraction ? '−' : '+';
  return task.type === 'missing_element' ? `${a} ${op} ? = ${b}` : `${a} ${op} ${b} = ?`;
}
