/**
 * "סגרו את המפגש" opens one checklist (owner decision 11.10.2026), instead of a
 * dialog for each thing the teacher might forget:
 *   1. open help calls — cleared in one click;
 *   2. the projector still locking the learners' screens;
 *   3. learners who started and did not finish, with the mandatory reason
 *      (the catch-up dialog's own content, embedded); in meeting 2 what the
 *      close does, in meeting 8 those who did not send the reflection;
 *   4. mediation events not recorded yet (measure 5's list).
 * Nothing here blocks the close except the reasons of step 3, as before.
 */
import { useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X } from 'lucide-react';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import { READ_ONLY_TITLE } from '@/application/useIsReadOnlyStaff';
import { useOpenMediationEvents } from '@/application/useTeacherMediationStore';
import { MEDIATION_HE } from '@/core/teacherMediation';
import { LESSON_FLOW_HE } from '@/core/teacherLessonFlow';
import type { CatchUpReasonEntry, UnfinishedLearner } from '@/core/catchUp';
import { CatchUpReasonsDialog } from './CatchUpReasonsDialog';
import { MediationOpenList } from './MediationJournal';

export interface CloseMeetingChecklistProps {
  meeting: number;
  /** Learners whose help call is on now. */
  helpLearners: number[];
  onClearAllHelp: () => Promise<void>;
  projectorOn: boolean;
  /** The unfinished learners still without a reason for this run (step 3's form appears only for them). */
  reasonLearners: UnfinishedLearner[];
  isSaving: boolean;
  /** A close or another meeting control is being written. */
  busy: boolean;
  readOnly: boolean;
  onReopen: (entries: CatchUpReasonEntry[]) => void;
  onContinue: (entries: CatchUpReasonEntry[]) => void;
  /** The close itself, when no reason is needed. */
  onClose: () => void;
  onCancel: () => void;
}

function Step({ n, title, done, children, testId }: { n: number; title: string; done: boolean; children: ReactNode; testId: string }) {
  return (
    <li data-testid={testId} data-done={done ? 'true' : 'false'} className="flex gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-violet-700 text-white'}`}
      >
        {done ? <CheckCircle2 className="w-4 h-4" /> : n}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {children}
      </div>
    </li>
  );
}

export function CloseMeetingChecklist(props: CloseMeetingChecklistProps): ReactElement {
  const { meeting, helpLearners, projectorOn, reasonLearners, readOnly, busy, isSaving } = props;
  const openEvents = useOpenMediationEvents();
  const [clearing, setClearing] = useState(false);
  const dialogRef = useDismissableOverlay<HTMLDivElement>(true, props.onCancel);
  const needsReasons = reasonLearners.length > 0;
  const titleId = `close-checklist-title-${meeting}`;

  const clearAll = async () => {
    if (readOnly || clearing) return;
    setClearing(true);
    try {
      await props.onClearAllHelp();
    } finally {
      setClearing(false);
    }
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="close-checklist"
      dir="rtl"
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-950/50"
      onClick={(e) => { if (e.target === e.currentTarget) props.onCancel(); }}
    >
      <div className="relative w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-4">
        <button
          type="button"
          onClick={props.onCancel}
          aria-label={LESSON_FLOW_HE.cancel}
          className="absolute top-3 left-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 cursor-pointer"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <header>
          <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-white">{LESSON_FLOW_HE.checklistTitle(meeting)}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{LESSON_FLOW_HE.checklistLead}</p>
        </header>

        <ol className="flex flex-col gap-4">
          <Step n={1} testId="close-step-help" title={LESSON_FLOW_HE.stepHelp} done={helpLearners.length === 0}>
            {helpLearners.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-400">{LESSON_FLOW_HE.stepHelpNone}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{LESSON_FLOW_HE.stepHelpList(helpLearners)}</p>
                <button
                  type="button"
                  data-testid="close-clear-help"
                  onClick={() => { void clearAll(); }}
                  disabled={readOnly || clearing}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className="px-3 py-1.5 min-h-9 rounded-xl bg-violet-700 hover:bg-violet-800 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer"
                >
                  {LESSON_FLOW_HE.clearAllHelp}
                </button>
              </div>
            )}
          </Step>

          <Step n={2} testId="close-step-projector" title={LESSON_FLOW_HE.stepProjector} done={!projectorOn}>
            {projectorOn ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{LESSON_FLOW_HE.stepProjectorOn}</p>
                <button
                  type="button"
                  // The same named window as the side menu's button: it brings the open projector back.
                  onClick={() => window.open('/projector', 'mathmaticore_projector')}
                  className="px-3 py-1.5 min-h-9 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {LESSON_FLOW_HE.toProjector}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-400">{LESSON_FLOW_HE.stepProjectorOff}</p>
            )}
          </Step>

          <Step
            n={3}
            testId="close-step-unfinished"
            title={meeting === 8 ? LESSON_FLOW_HE.stepUnfinishedReflection : LESSON_FLOW_HE.stepUnfinished}
            done={!needsReasons}
          >
            {needsReasons ? (
              // The catch-up dialog's own content (owner decision 2.10.2026): a reason per learner, then
              // reopen or close. Its "המשיכו בכל זאת" is this checklist's close.
              <CatchUpReasonsDialog
                isOpen
                embedded
                meeting={meeting}
                learners={reasonLearners}
                trigger="close"
                nextMeeting={null}
                isMeeting2={meeting === 2}
                isSaving={isSaving}
                onReopen={props.onReopen}
                onContinue={props.onContinue}
                onCancel={props.onCancel}
              />
            ) : (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-400">{LESSON_FLOW_HE.stepUnfinishedNone}</p>
                {meeting === 2 && <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{LESSON_FLOW_HE.meeting2Close}</p>}
              </>
            )}
          </Step>

          <Step n={4} testId="close-step-mediation" title={LESSON_FLOW_HE.stepMediation} done={openEvents.length === 0}>
            {openEvents.length > 0 && <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{MEDIATION_HE.closeUnrecorded(openEvents.length)}</p>}
            <div className="max-h-56 overflow-y-auto">
              <MediationOpenList events={openEvents} readOnly={readOnly} testIdPrefix="mediation-close" />
            </div>
          </Step>
        </ol>

        <footer className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          {needsReasons && <p className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{LESSON_FLOW_HE.closeWithReasons}</p>}
          <button type="button" onClick={props.onCancel} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-sm cursor-pointer">
            {LESSON_FLOW_HE.cancel}
          </button>
          {!needsReasons && (
            <button
              type="button"
              data-testid="close-checklist-confirm"
              onClick={props.onClose}
              disabled={readOnly || busy}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className="px-4 py-2.5 rounded-xl bg-violet-800 hover:bg-violet-900 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-bold text-sm cursor-pointer"
            >
              {LESSON_FLOW_HE.closeNow}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}
