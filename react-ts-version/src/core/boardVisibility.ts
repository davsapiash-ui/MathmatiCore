/**
 * Whether the learner may hide the number house (בית המספרים).
 *
 * Owner decision, 27.9.2026 (register, decision יא): in station 1 the board
 * is never hidden — meeting 1 is where the child gets to know the blocks, and
 * every step and exercise of it is done on the board. The top-bar button
 * stays where it is, but in station 1 it is labelled and announced
 * "בית המספרים פתוח" with an open eye (owner, 28.9.2026: it cannot hide the
 * board there, so it must not say "הסתרה"), and hovering or pressing it says
 * why, in the words below. In every other
 * meeting with a board the button hides and shows it as before; meetings 2 and
 * 8 have no board and no button (PRD Module 14 §ב).
 */
/** The station-1 board button's name: what the board is, not what a press does. */
export const BOARD_OPEN_HE = 'בית המספרים פתוח';

export const BOARD_STAYS_OPEN_HE = 'בתחנה הזו בית המספרים נשאר פתוח, כי בעזרתו לומדים להכיר את הלבנים.';

export function boardStaysOpen(sessionNumber: number): boolean {
  return sessionNumber === 1;
}
