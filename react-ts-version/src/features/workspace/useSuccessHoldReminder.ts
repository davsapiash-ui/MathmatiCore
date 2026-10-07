import { useEffect, useState } from 'react';
import { useWorkspaceStore, activeSuccessHold } from '@/application/useWorkspaceStore';

/**
 * Ten seconds after a solved exercise is held on the screen, a quiet reminder
 * that "ממשיכים" moves on (owner, 7.10.2026): a ring around the button in its
 * fixed place (מסמך 04, עקביות: top left of every activity screen) and one
 * sentence under the explanation. Once, no pulse, no sound. Counted from the
 * moment of the solution, so a reload does not start it again.
 */
export const SUCCESS_REMINDER_MS = 10_000;

export function useSuccessHoldReminder(): boolean {
  const hold = useWorkspaceStore((s) => activeSuccessHold(s));
  const [remindedFor, setRemindedFor] = useState<string | null>(null);
  const key = hold ? `${hold.taskId}:${hold.startedAt}` : null;

  useEffect(() => {
    if (!hold || !key) return;
    const wait = Math.max(0, hold.startedAt + SUCCESS_REMINDER_MS - Date.now());
    const t = setTimeout(() => setRemindedFor(key), wait);
    return () => clearTimeout(t);
  }, [hold, key]);

  return key !== null && remindedFor === key;
}
