import { create } from 'zustand';

/**
 * The addition grid and the coaching card share one place in the workspace
 * row (StudentWorkspacePage). While the card is open, an open grid waits out
 * of sight. Owner, 4.10.2026: the child must see that the grid is only
 * minimised — a "לוח החיבור" button under the card brings the grid back, and
 * the card folds into a small tab in its turn (the same fold as under the
 * chat: useStudentChatOpen.ts). Closing the grid, or pressing the card's tab,
 * brings the card back exactly as it was.
 *
 *  - waiting: the learner's grid is open, and hidden behind the open card
 *    (set by the page, which knows the profile and the exercise);
 *  - over:    the learner chose to see the grid; the card is folded.
 *
 * Not workspace state: nothing here is saved, restored or sent. Folding is
 * not a help event and writes no telemetry.
 */
export const useAdditionGridOverCard = create<{ waiting: boolean; over: boolean }>(() => ({
  waiting: false,
  over: false,
}));

/** The "לוח החיבור" button under the card: show the grid, fold the card. */
export function showAdditionGridOverCard(): void {
  useAdditionGridOverCard.setState((s) => (s.waiting ? { over: true } : s));
}

/** The folded card's tab: the card comes back, and the grid waits again. */
export function returnCardOverAdditionGrid(): void {
  useAdditionGridOverCard.setState({ over: false });
}
