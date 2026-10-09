import type { Session1ChecklistItem } from '@/core/session1Checklist';
import { TaskSteps } from './TaskZone';

/**
 * מפגש 1 — the checklist of a guided step (PRD Module 14 §ב, "מה עושים בשלב
 * הזה"): what the step asks, ticked off as the learner acts. The proceed
 * button lights up when every item is done (the store applies the same rule,
 * core/session1Checklist.ts), at the same render as the done box.
 *
 * `doneNote` (session1DoneNoteHe) is said first once every item is done — the
 * target task's "נכון! הלבנים מסודרות אחרת, אבל המספר נשאר 347." (owner,
 * 27.9.2026). It carries the praise itself, so it takes the place of
 * "מצוין!": one praise, then what to press.
 *
 * Drawn by the task zone's shared steps (TaskZone.tsx), so every task shows
 * its steps and its done signal the same way.
 */
export function Session1ChecklistCard({ items, doneNote = null }: { items: Session1ChecklistItem[]; doneNote?: string | null }) {
  return <TaskSteps steps={items} doneNote={doneNote} testIds={{ list: 'session1-checklist', items: 'session1-checklist-items' }} />;
}
