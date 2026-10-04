import { create } from 'zustand';
import { useWorkspaceStore } from './useWorkspaceStore';

/**
 * The addition grid and the coaching card are never shown together (enhanced
 * profile, meetings 3–7): one mechanism, two named tabs, each in its own
 * place. The grid's place is its slot beside the board; the card's place is
 * its column at the edge of the screen. The one that is not shown is a tab in
 * its own place — the amber "לוח החיבור" tab, or the "כרטיס החניכה" tab — so a
 * swap never moves a tab (owner's decision, 4.10.2026; מסמך 03 §1.3 ה',
 * register 18).
 *
 * While the card is open, the card is the one shown. The only thing to
 * remember is that the learner chose the grid over THIS card: the card's key.
 * Everything else is derived from the workspace store — a card that closes,
 * a new card, or a grid closed with its X all end the choice by themselves,
 * with nothing to reset.
 *
 * Not workspace state: nothing here is saved, restored or sent. Folding is
 * not a help event and writes no telemetry.
 */
export const useAdditionGridOverCard = create<{ cardKey: string | null }>(() => ({ cardKey: null }));

type CardState = Pick<ReturnType<typeof useWorkspaceStore.getState>, 'helpState' | 'socraticCardHistory'>;

/**
 * The open coaching card's identity, or null: its exercise, its place in the
 * exercise's cards, and when it opened — a meeting started again begins the
 * count again, and its first card is not the earlier first card.
 */
export function coachingCardKey(s: CardState): string | null {
  if (s.helpState !== 'socratic') return null;
  const { taskId, cards } = s.socraticCardHistory;
  return `${taskId ?? ''}:${cards.length}:${cards[cards.length - 1]?.openedAt ?? ''}`;
}

/** The learner chose the grid over the open card: the grid is shown, the card is its tab. */
export function isAdditionGridOverCard(
  s: CardState & { isAdditionHelperOpen: boolean },
  cardKey: string | null,
): boolean {
  return cardKey !== null && s.isAdditionHelperOpen && coachingCardKey(s) === cardKey;
}

export function useIsAdditionGridOverCard(): boolean {
  const cardKey = useAdditionGridOverCard((c) => c.cardKey);
  return useWorkspaceStore((s) => isAdditionGridOverCard(s, cardKey));
}

/**
 * The amber "לוח החיבור" tab: the grid is shown in its place. A closed grid
 * opens (the one ADAPTIVE_GRID_TOGGLED of a learner's opening); a grid that
 * waited behind the card is only shown again, which is no event. If the card
 * is open it folds into its tab.
 */
export function showAdditionGrid(): void {
  const ws = useWorkspaceStore.getState();
  ws.openAdditionHelper('learner');
  useAdditionGridOverCard.setState({ cardKey: coachingCardKey(ws) });
}

/** The "כרטיס החניכה" tab: the card comes back as it was, and the grid folds into its tab. */
export function showCoachingCard(): void {
  useAdditionGridOverCard.setState({ cardKey: null });
}
