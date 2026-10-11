import { useEffect } from 'react';
import { ClipboardList, X } from 'lucide-react';
import { READ_ONLY_TITLE } from '@/application/useIsReadOnlyStaff';
import { useOpenMediationEvents, useTeacherMediationStore } from '@/application/useTeacherMediationStore';
import { MEDIATION_HE, bubbleLineHe, type MediationEvent } from '@/core/teacherMediation';
import { MediationControls } from './MediationControls';

/**
 * Measure 5 on the teacher's side (owner, 11.10.2026): the dashboard helps the
 * teacher not get stuck and not forget — the top-bar counter and the close
 * dialog here, the side action queue in MediationQueue. Nothing blinks or
 * pulses (Module 18).
 */

/** Open events as rows: the learner, the kind, the time and the two questions. Newest first. */
export function MediationOpenList({ events, readOnly, testIdPrefix }: { events: MediationEvent[]; readOnly: boolean; testIdPrefix: string }) {
  if (events.length === 0) {
    return <p className="text-xs text-slate-600 dark:text-slate-400">{MEDIATION_HE.noOpenEvents}</p>;
  }
  return (
    <ul className="flex flex-col gap-2" data-testid={`${testIdPrefix}-list`}>
      {[...events].reverse().map((e) => (
        <li key={e.ref} data-testid={`${testIdPrefix}-row`} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-1.5">
          <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">{bubbleLineHe(e)}</span>
          <MediationControls event={e} studentNumber={e.studentNumber} readOnly={readOnly} testIdPrefix={`${testIdPrefix}-${e.ref}`} />
        </li>
      ))}
    </ul>
  );
}

/**
 * "לתיעוד: N" in the session bar: every unrecorded event of the meeting, and a
 * panel to record them. Visible to a read-only account, its buttons disabled.
 */
export function MediationPendingButton({ readOnly, open, onOpenChange }: { readOnly: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const events = useOpenMediationEvents();
  const meeting = useTeacherMediationStore((s) => s.meeting);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);
  if (meeting === null) return null;
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="mediation-pending-counter"
        aria-expanded={open}
        title={readOnly ? READ_ONLY_TITLE : MEDIATION_HE.pendingListTitle}
        onClick={() => onOpenChange(!open)}
        className="inline-flex items-center gap-1.5 min-h-9 px-2.5 py-1.5 whitespace-nowrap bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-xl shadow-sm font-bold text-xs cursor-pointer"
      >
        <ClipboardList className="w-4 h-4" aria-hidden="true" />
        <span>{MEDIATION_HE.pendingCounter(events.length)}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={MEDIATION_HE.pendingListTitle}
          data-testid="mediation-pending-panel"
          className="absolute z-50 top-full mt-2 left-0 w-[24rem] max-w-[90vw] max-h-[70vh] overflow-y-auto p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl text-right"
          dir="rtl"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{MEDIATION_HE.pendingListTitle}</h3>
            <button type="button" aria-label={MEDIATION_HE.back} onClick={() => onOpenChange(false)} className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <MediationOpenList events={events} readOnly={readOnly} testIdPrefix="mediation-pending" />
        </div>
      )}
    </div>
  );
}

/**
 * Before the meeting closes with unrecorded events: "יש N אירועים שלא תועדו",
 * the list inline, and "סגירה בכל זאת". It never blocks the close.
 */
export function MediationCloseDialog({ readOnly, onCloseAnyway, onBack }: { readOnly: boolean; onCloseAnyway: () => void; onBack: () => void }) {
  // Recording a row inline shrinks the list, and the title follows it.
  const events = useOpenMediationEvents();
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onBack} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={MEDIATION_HE.closeAnyway}
        data-testid="mediation-close-dialog"
        className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 gap-3"
      >
        <h2 className="text-lg font-black text-slate-900 dark:text-white">
          {events.length > 0 ? MEDIATION_HE.closeUnrecorded(events.length) : MEDIATION_HE.noOpenEvents}
        </h2>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <MediationOpenList events={events} readOnly={readOnly} testIdPrefix="mediation-close" />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onBack} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-sm cursor-pointer">
            {MEDIATION_HE.back}
          </button>
          <button
            type="button"
            data-testid="mediation-close-anyway"
            onClick={onCloseAnyway}
            className="px-4 py-2.5 rounded-xl bg-rose-800 hover:bg-rose-900 text-white font-bold text-sm cursor-pointer"
          >
            {MEDIATION_HE.closeAnyway}
          </button>
        </div>
      </div>
    </div>
  );
}
