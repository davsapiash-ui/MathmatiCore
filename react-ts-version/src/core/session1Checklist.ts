/**
 * Meeting 1's guided steps (מסמך 03 §3.1, steps 1–6): what each step asks the
 * learner to do, as a checklist the learner ticks off by acting on the board.
 * One source for both the task card (IntroTask) and the store's "התקדם" gate,
 * so what the child sees and what lets them advance can never disagree.
 *
 * Every label is the PRD's wording for that step; steps 1 and 5 as the owner
 * approved them on 8.10.2026 (the number of blocks said in words; the
 * instruction's two full sentences, without "אחר כך" — the numbering says it). The
 * steps are guided, as the document writes them: the learners "מונחים לבצע
 * פעולת פירוק יזומה", "נדרשים לייצג על הלוח מספר המכיל את הספרה אפס בטור
 * העשרות, למשל המספר 305", "מונחים ללחוץ באופן אקטיבי על כפתור ביטול פעולה".
 */
import { countsEqual, EMPTY_COUNTS, type Place, type PlaceCounts } from './placeValue';
import { pendingRepresentationConversion, type ColumnConversions } from '@/application/useWorkspaceStore';

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
  /** The trash was pressed (clearing the board) — dragging one block into it is not "resetting the workspace". */
  hasClearedBoard: boolean;
  /**
   * The conversions per column (step 6: the block broken must be a ten, not a
   * hundred — REPRESENTATION_LOCKS, audit A2-F06). Without it, any break counts.
   */
  conversionsByColumn?: ColumnConversions;
  /** The result row (step 6 writes the number). */
  answerDigits?: Partial<Record<Place, string>>;
}

/** Free dragging: enough blocks to watch the digits follow them. */
const SANDBOX_MIN_BLOCKS = 5;

const boardValue = (c: PlaceCounts) => c.units + c.tens * 10 + c.hundreds * 100 + c.thousands * 1000;

/** The number in the result row, or null while it is empty. */
function typedNumber(d: Partial<Record<Place, string>> | undefined): number | null {
  const s = [d?.thousands, d?.hundreds, d?.tens, d?.units].map((x) => x ?? '').join('');
  return s === '' ? null : Number(s);
}

export function session1Checklist(taskId: string, s: Session1ChecklistState): Session1ChecklistItem[] | null {
  switch (taskId) {
    // Steps 1–2: welcome, free dragging.
    case 's1_sandbox_controlled':
      return [{
        label: 'גררו 5 לבנים לטורים משמאל, וצפו בספרות המשתנות בבית המספרים',
        done: s.blocksAddedCount >= SANDBOX_MIN_BLOCKS,
        progress: { value: s.blocksAddedCount, of: SANDBOX_MIN_BLOCKS },
      }];
    // Step 3: decompose a block (the board opens on 230).
    case 's1_decompose_hundred':
      return [{ label: 'לחצו על לבנה כדי לפרוט אותה ללבנים קטנות יותר', done: s.hasUngrouped }];
    // Step 4: 305 — three hundreds and five units, "בלוח בית המספרים הריק
    // מעשרות". One item; a second appears only for a child who built 305
    // another way (2 hundreds, 10 tens, 5 units), so they see what is left
    // instead of a silent ⏳.
    case 's1_build_305': {
      const is305 = boardValue(s.counts) === 305;
      const standard = countsEqual(s.counts, { ...EMPTY_COUNTS, hundreds: 3, units: 5 });
      const items: Session1ChecklistItem[] = [{ label: 'נסו לבנות את המספר 305 בלבנים', done: is305 }];
      if (is305 && !standard) items.push({ label: 'בנו את 305 כך שבכל טור יהיו פחות מ-10 לבנים', done: false });
      return items;
    }
    // Step 5: undo, then the trash.
    case 's1_undo_trash':
      return [
        { label: 'לחצו על כפתור ביטול הפעולה ↺ כדי לחזור צעד אחד אחורה', done: s.undoCount >= 1 },
        { label: 'לחצו על פח האשפה כדי לנקות את בית המספרים', done: s.hasClearedBoard },
      ];
    // Step 6, the target task: the instruction, clause by clause. The third
    // line is the owner's wording of 27.9.2026 (register decision י).
    case 's1_target_347': {
      const is347 = boardValue(s.counts) === 347;
      const required = { ...EMPTY_COUNTS, hundreds: 3, tens: 3, units: 17 };
      const brokeATen = s.conversionsByColumn
        ? pendingRepresentationConversion({ conversionsByColumn: s.conversionsByColumn, counts: s.counts }, { id: taskId, requiredCounts: required }) === null
        : s.hasUngrouped;
      const decomposed = brokeATen && countsEqual(s.counts, required);
      return [
        { label: 'בנו את המספר 347 בלבנים', done: is347 },
        { label: 'פרטו עשרת אחת לעשר יחידות', done: decomposed },
        // The line asks for the number "לאחר הפריטה": 347 typed before the
        // decomposition is not that answer yet, so it is ticked only once the
        // decomposition line is (owner, 28.9.2026).
        { label: 'כתבו בשורת התוצאה איזה מספר מייצגות הלבנים לאחר הפריטה', done: decomposed && typedNumber(s.answerDigits) === 347 },
      ];
    }
    default:
      return null;
  }
}

/**
 * What the checklist card says first once every item of a step is done, before
 * "לחצו על כפתור התקדם…", or null for the card's usual words. The target task
 * names what the child has just seen: the blocks are arranged differently, the
 * number is the same (owner, 27.9.2026 — register decision י).
 */
export function session1DoneNoteHe(taskId: string): string | null {
  return taskId === 's1_target_347' ? 'נכון! הלבנים מסודרות אחרת, אבל המספר נשאר 347.' : null;
}

/** The first thing still to do, or null when the step is complete (or has no checklist). */
export function session1NextStep(taskId: string, s: Session1ChecklistState): string | null {
  return session1Checklist(taskId, s)?.find((i) => !i.done)?.label ?? null;
}
