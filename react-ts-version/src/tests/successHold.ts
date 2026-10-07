import { useWorkspaceStore, activeSuccessHold } from '@/application/useWorkspaceStore';

/**
 * A solved exercise stays on the screen until "ממשיכים" is pressed again
 * (owner, 7.10.2026: the board as solved, the column digits, and why the
 * answer is right). A test that walks a learner through a meeting presses it,
 * as the learner does. Returns whether there was a held exercise to leave.
 */
export function continueAfterSuccess(): boolean {
  const s = useWorkspaceStore.getState();
  if (!activeSuccessHold(s)) return false;
  s.proceed();
  return true;
}
