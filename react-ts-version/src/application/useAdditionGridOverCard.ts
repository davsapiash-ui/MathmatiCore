import { create } from 'zustand';
import { useWorkspaceStore, isAdditionGridVisible, emitAdditionGridToggled, type AdditionGridSource } from './useWorkspaceStore';

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
 * not a help event; what it changes on the screen is logged with every other
 * appearance of the grid (logAdditionGridOnScreen, below).
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
 * The amber "לוח החיבור" tab: the grid is shown in its place — a closed grid
 * opens, a grid that waited behind the card is shown again; either is one
 * ADAPTIVE_GRID_TOGGLED {opened, learner}. If the card is open it folds into
 * its tab.
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

type WorkspaceSnapshot = ReturnType<typeof useWorkspaceStore.getState>;

/** The grid is on the learner's screen: open, on an addition exercise of a learner who receives it, and not waiting as its tab under the coaching card. */
export function isAdditionGridOnScreen(s: WorkspaceSnapshot, cardKey: string | null): boolean {
  return isAdditionGridVisible(s) && (s.helpState !== 'socratic' || isAdditionGridOverCard(s, cardKey));
}

/*
 * PRD Module 10 §ב: "כל פתיחה וסגירה של הלוח נרשמת בטלמטריה כאירוע
 * ADAPTIVE_GRID_TOGGLED" — logged here once for every change of what the
 * learner sees, whatever caused it. The payload is Appendix A's, {action,
 * source}, and the source reads:
 *  - opened, 'hesitation_30s': the system put the grid on the screen — its
 *    30-second opening (the grid was closed), or the grid, still open, coming
 *    back (the card closed, the learner's card tab, an addition exercise again);
 *  - opened, 'learner': the learner's "לוח החיבור" tab;
 *  - closed, 'learner': the learner's X;
 *  - closed, 'hesitation_30s': the grid, still open, left the screen without
 *    the learner closing it — folded under the coaching card, or an exercise
 *    that is not an addition (or a new meeting, a reset).
 * A system "opened" that follows a system "closed" is therefore a return, not
 * a new 30-second opening (functions/src/meetingMetrics.ts,
 * LearnerJourneyService). A closing is logged on the exercise it happened on.
 */
let lastWs: WorkspaceSnapshot = useWorkspaceStore.getState();
let lastCardKey: string | null = useAdditionGridOverCard.getState().cardKey;
let lastOnScreen = isAdditionGridOnScreen(lastWs, lastCardKey);

function logAdditionGridOnScreen(): void {
  const ws = useWorkspaceStore.getState();
  const cardKey = useAdditionGridOverCard.getState().cardKey;
  const prev = lastWs;
  const wasOver = isAdditionGridOverCard(prev, lastCardKey);
  lastWs = ws;
  lastCardKey = cardKey;
  const now = isAdditionGridOnScreen(ws, cardKey);
  if (now === lastOnScreen) return;
  lastOnScreen = now;
  if (now) {
    let source: AdditionGridSource;
    if (!prev.isAdditionHelperOpen) source = ws.additionHelperSource ?? 'hesitation_30s';
    else source = isAdditionGridOverCard(ws, cardKey) && !wasOver ? 'learner' : 'hesitation_30s';
    emitAdditionGridToggled(ws, 'opened', source);
  } else {
    const byX = !ws.isAdditionHelperOpen && ws.additionHelperClosedByLearner;
    emitAdditionGridToggled(prev, 'closed', byX ? 'learner' : 'hesitation_30s');
  }
}
useWorkspaceStore.subscribe(logAdditionGridOnScreen);
useAdditionGridOverCard.subscribe(logAdditionGridOnScreen);
