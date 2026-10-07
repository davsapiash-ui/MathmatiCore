/**
 * The column dimming of the board on the screen (PRD Module 7 §א; the rule:
 * core/columnFocus.ts), read from the workspace store. Read only: nothing here
 * writes to any store, and the telemetry fields (`focusedPlace`,
 * `activeColumnIndex`) keep the values they had.
 */
import { dimmedColumns, heldFromNumber, verticalBoxes, type VerticalBoxes, type VerticalWork } from '@/core/columnFocus';
import { getValue, type Place } from '@/core/placeValue';
import { resultBoxCount } from '@/core/placeCues';
import { getActiveTasks, effectiveArithmetic, activeSuccessHold, type WorkspaceState } from '@/application/useWorkspaceStore';

/** The dimmed columns, for the exercise on the screen. `focusedMemoryCircle`: useBoardFocusStore. */
const NO_DIMMING: ReadonlySet<Place> = new Set();

export function boardDimmedColumns(s: WorkspaceState, focusedMemoryCircle: Place | null): ReadonlySet<Place> {
  // A solved exercise held on the screen: the whole board is the answer.
  if (activeSuccessHold(s)) return NO_DIMMING;
  const task = getActiveTasks(s)[s.standardTaskIdx];
  let vertical: VerticalBoxes | undefined;
  let work: VerticalWork | undefined;
  if (task && (task.type === 'vertical_addition' || task.type === 'addition_simple')) {
    const { a, b, target } = effectiveArithmetic(task, s.isASD === true);
    vertical = verticalBoxes(a, b, target, task.hiddenDigits, task.revealedResultDigits, resultBoxCount(s.sessionNumber, a, b, target));
    const numbers = { a, b, isSubtraction: task.isSubtraction === true, hidden: task.hiddenDigits };
    // The number a subtraction on the board starts from: the first number
    // (takeAwayTrack), or a skeleton's result (heldFromTrack, view only).
    const track = heldFromNumber(numbers) === null ? s.takeAwayTrack : s.heldFromTrack;
    work = { ...numbers, boardValue: getValue(s.counts), counts: s.counts, heldFrom: Boolean(track && track.taskId === task.id && track.held) };
  }
  return dimmedColumns({
    sessionNumber: s.sessionNumber,
    taskType: task?.type,
    focusedPlace: s.focusedPlace,
    focusedMemoryCircle,
    vertical,
    work,
    answerDigits: s.answerDigits,
    operandDigits: s.operandDigits,
  });
}
