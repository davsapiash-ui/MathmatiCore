/**
 * Meeting 1 tool steps (מסמך 03 §3.1, steps 1–5): what each step asks the
 * learner to do, as a checklist the learner ticks off by acting on the board.
 * One source for both the task card (IntroTask) and the store's "התקדם" gate,
 * so what the child sees and what lets them advance can never disagree.
 */
import { countsEqual, EMPTY_COUNTS, type PlaceCounts } from './placeValue';

export interface Session1ChecklistItem {
  label: string;
  done: boolean;
  progress?: { value: number; of: number };
}

export interface Session1ChecklistState {
  counts: PlaceCounts;
  blocksAddedCount: number;
  hasUngrouped: boolean;
  undoCount: number;
  hasDeletedBlock: boolean;
}

/** Free dragging: enough blocks to watch the digits follow them. */
const SANDBOX_MIN_BLOCKS = 5;

export function session1Checklist(taskId: string, s: Session1ChecklistState): Session1ChecklistItem[] | null {
  switch (taskId) {
    // Steps 1–2: welcome, free dragging.
    case 's1_sandbox_controlled':
      return [{
        label: 'גררו לבנים לטורים משמאל וצפו בספרות בלוח בית המספרים',
        done: s.blocksAddedCount >= SANDBOX_MIN_BLOCKS,
        progress: { value: s.blocksAddedCount, of: SANDBOX_MIN_BLOCKS },
      }];
    // Step 3: decompose a hundred into ten tens.
    case 's1_decompose_hundred':
      return [{ label: 'גררו לבנת מאה ללוח ולחצו עליה כדי לפרק אותה', done: s.hasUngrouped }];
    // Step 4: 305 — three hundreds and five units, the tens column empty.
    case 's1_build_305':
      return [{ label: 'בנו את המספר 305 בלבני דינס', done: countsEqual(s.counts, { ...EMPTY_COUNTS, hundreds: 3, units: 5 }) }];
    // Step 5: undo, then the trash.
    case 's1_undo_trash':
      return [
        { label: 'גררו לבנים ללוח ולחצו על כפתור ביטול פעולה', done: s.undoCount >= 1 },
        { label: 'לחצו על פח האשפה כדי לנקות את הלוח', done: s.hasDeletedBlock },
      ];
    default:
      return null;
  }
}

/** The first thing still to do, or null when the step is complete (or has no checklist). */
export function session1NextStep(taskId: string, s: Session1ChecklistState): string | null {
  return session1Checklist(taskId, s)?.find((i) => !i.done)?.label ?? null;
}
