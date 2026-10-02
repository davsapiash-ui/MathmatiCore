/**
 * Catch-up time: the teacher's dialog when a meeting is closed (or another one
 * opened) while learners who started it have not finished. Props-driven, no
 * data access. Contract stub (part B1 implements; see DESIGN.md of
 * claude/catch-up-time).
 */
import type { ReactElement } from 'react';
import type { CatchUpReasonEntry, UnfinishedLearner } from '@/core/catchUp';

export interface CatchUpReasonsDialogProps {
  isOpen: boolean;
  /** The meeting the learners did not finish. */
  meeting: number;
  learners: UnfinishedLearner[];
  /** What the teacher pressed: closing the meeting, or opening `nextMeeting`. */
  trigger: 'close' | 'open_other';
  nextMeeting: number | null;
  /** Meeting 2: the close already completes started learners (#207); the dialog only documents. */
  isMeeting2: boolean;
  /** A write is in flight: both actions disabled, the dialog stays open. */
  isSaving: boolean;
  /** "פתחו שוב את המפגש להשלמה". Called only when every learner has a reason and every note passed validateCatchUpNote. */
  onReopen: (entries: CatchUpReasonEntry[]) => void;
  /** "המשיכו בכל זאת" — the close / the other meeting goes ahead; reasons still recorded. Same validation. */
  onContinue: (entries: CatchUpReasonEntry[]) => void;
  /** Escape / backdrop / X: nothing written, nothing closed or opened. */
  onCancel: () => void;
}

export function CatchUpReasonsDialog(_props: CatchUpReasonsDialogProps): ReactElement | null {
  throw new Error('not implemented: CatchUpReasonsDialog (part B1)');
}
