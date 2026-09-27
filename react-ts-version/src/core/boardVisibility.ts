/**
 * Whether the learner may hide the number house (בית המספרים).
 *
 * Owner decision, 27.9.2026 (register, decision יא): in station 1 the board
 * is never hidden — meeting 1 is where the child gets to know the blocks, and
 * every step and exercise of it is done on the board. The top-bar button
 * "הסתרת בית המספרים" stays where it is, but in station 1 it does nothing
 * except say why, on hover and on click, in these words. In every other
 * meeting with a board the button hides and shows it as before; meetings 2 and
 * 8 have no board and no button (PRD Module 14 §ב).
 */
export const BOARD_STAYS_OPEN_HE = 'בתחנה הזו בית המספרים נשאר פתוח, כי בעזרתו לומדים להכיר את הלבנים.';

export function boardStaysOpen(sessionNumber: number): boolean {
  return sessionNumber === 1;
}
