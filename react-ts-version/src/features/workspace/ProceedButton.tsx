import { ArrowLeft } from 'lucide-react';
import { PROCEED_HE } from '@/core/toolbarNames';

/**
 * The top bar's "ממשיכים" (PRD Module 7 §א rule 5: blue, its arrow). One
 * component for the learner's top bar (WorkspaceTopbar) and for the teacher's
 * demonstration of station 1 (Module 15 §ג), where it moves nothing.
 */
export function ProceedButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-12 px-flw-16-24 rounded-2xl text-base font-display font-extrabold text-white whitespace-nowrap bg-ws-accent hover:brightness-110 active:scale-95 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed cursor-pointer"
      // Announced by the name it shows (label in name), the name every
      // sentence uses; it was "מעבר למשימה הבאה", also in meeting 1, whose
      // steps are not "משימות".
      title={PROCEED_HE}
      data-testid="proceed-button"
    >
      <span>{PROCEED_HE}</span>
      <ArrowLeft className="w-5 h-5" />
    </button>
  );
}
