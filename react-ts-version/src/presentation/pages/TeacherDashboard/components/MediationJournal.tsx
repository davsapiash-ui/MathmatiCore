import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ClipboardList, X } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';
import { READ_ONLY_TITLE } from '@/application/useIsReadOnlyStaff';
import { useOpenMediationEvents, useTeacherMediationStore } from '@/application/useTeacherMediationStore';
import { MEDIATION_HE, bubbleLineHe, type MediationEvent } from '@/core/teacherMediation';
import { MediationControls } from './MediationControls';

/**
 * Measure 5 on the teacher's side (owner, 11.10.2026): the dashboard helps the
 * teacher not get stuck and not forget — the top-bar counter and the open list
 * here (the closing checklist embeds it), the side action queue in MediationQueue. Nothing blinks or
 * pulses (Module 18).
 */

/** Open events as rows: the learner, the kind, the time and the two questions. Newest first. */
export function MediationOpenList({ events, readOnly, testIdPrefix }: { events: MediationEvent[]; readOnly: boolean; testIdPrefix: string }) {
  if (events.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm leading-normal text-slate-600 dark:text-slate-400">
        <CheckCircle2 className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
        {MEDIATION_HE.noOpenEvents}
      </p>
    );
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
  // Hovering the counter previews the list (owner, 11.10.2026); a click keeps it open.
  const [preview, setPreview] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);
  if (meeting === null) return null;
  const shown = open || preview;
  return (
    <div
      className="relative"
      onMouseEnter={() => { if (previewTimer.current) clearTimeout(previewTimer.current); previewTimer.current = setTimeout(() => setPreview(true), 250); }}
      onMouseLeave={() => { if (previewTimer.current) clearTimeout(previewTimer.current); setPreview(false); }}
    >
      <button
        type="button"
        data-testid="mediation-pending-counter"
        aria-expanded={open}
        title={readOnly ? READ_ONLY_TITLE : MEDIATION_HE.pendingListTitle}
        onClick={() => onOpenChange(!open)}
        className="inline-flex items-center gap-1.5 min-h-9 px-2.5 py-1.5 whitespace-nowrap transition-colors duration-150 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-xs cursor-pointer"
      >
        <ClipboardList className="w-4 h-4" aria-hidden="true" />
        <span className="inline-flex items-center whitespace-pre">{MEDIATION_HE.pendingCounter(events.length).replace(/\d+$/, '')}<AnimatedNumber value={events.length} /></span>
      </button>
      {shown && (
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
