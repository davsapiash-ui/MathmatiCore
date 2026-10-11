import { useId, useState } from 'react';
import { READ_ONLY_TITLE } from '@/application/useIsReadOnlyStaff';
import { useMediationEvents, useMediationRecords, useTeacherMediationStore } from '@/application/useTeacherMediationStore';
import { MEDIATION_HE, clockHe, eventLineHe, recordsByRef } from '@/core/teacherMediation';
import { MediationControls } from './MediationControls';

/**
 * "תיעוד התיווך" in the radar tile's drawer (measure 5, owner 11.10.2026):
 * this learner's mediation events of the open meeting, the newest open one
 * with its two questions, older open ones below it, a physical approach
 * without an event, and what was already recorded (editable while the meeting
 * is open). A read-only account sees it all with the buttons disabled.
 */
export function MediationLogSection({ studentNumber, readOnly }: { studentNumber: number; readOnly: boolean }) {
  const meeting = useTeacherMediationStore((s) => s.meeting);
  const events = useMediationEvents().filter((e) => e.studentNumber === studentNumber);
  const records = useMediationRecords().filter((r) => r.student_id === studentNumber);
  const [selfOpen, setSelfOpen] = useState(false);
  // The section shows in the tile detail and in the learner panel, which can be open together.
  const titleId = useId();
  const done = recordsByRef(records);
  const open = events.filter((e) => !done.has(e.ref));
  const newest = open.length > 0 ? open[open.length - 1] : null;
  const older = open.slice(0, -1).reverse();
  const recordedEvents = events.filter((e) => done.has(e.ref)).reverse();
  const selfRecords = records.filter((r) => r.event_ref === null).sort((a, b) => b.event_time_iso.localeCompare(a.event_time_iso));

  return (
    <section data-testid="mediation-log-section" aria-labelledby={titleId} className="mb-6 p-4 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col gap-3">
      <h4 id={titleId} className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{MEDIATION_HE.sectionTitle}</h4>
      {meeting === null ? (
        <p className="text-xs text-slate-600 dark:text-slate-400">{MEDIATION_HE.noMeeting}</p>
      ) : (
        <>
          {newest ? (
            <div data-testid="mediation-newest" className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
              <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">{eventLineHe(newest)}</span>
              <MediationControls key={newest.ref} event={newest} studentNumber={studentNumber} readOnly={readOnly} testIdPrefix="mediation-newest" />
            </div>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-400">{MEDIATION_HE.noOpenEvents}</p>
          )}

          {older.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{MEDIATION_HE.olderOpen}</span>
              <ul className="flex flex-col gap-2">
                {older.map((e) => (
                  <li key={e.ref} data-testid="mediation-older-row" className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{eventLineHe(e)}</span>
                    <MediationControls event={e} studentNumber={studentNumber} readOnly={readOnly} testIdPrefix={`mediation-older-${e.ref}`} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-testid="mediation-self-approach"
              aria-expanded={selfOpen}
              disabled={readOnly}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              onClick={() => setSelfOpen((v) => !v)}
              className="self-start min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {MEDIATION_HE.selfApproach}
            </button>
            {selfOpen && !readOnly && (
              <MediationControls event={null} studentNumber={studentNumber} readOnly={readOnly} testIdPrefix="mediation-self" onSaved={() => setSelfOpen(false)} />
            )}
          </div>

          {(recordedEvents.length > 0 || selfRecords.length > 0) && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{MEDIATION_HE.recordedList}</span>
              <ul className="flex flex-col gap-2">
                {recordedEvents.map((e) => {
                  const r = done.get(e.ref)!;
                  return (
                    <li key={e.ref} data-testid="mediation-recorded-row" className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{eventLineHe(e)} · {MEDIATION_HE.recorded}</span>
                      <MediationControls key={`${r.id}-${r.recorded_at}`} event={e} studentNumber={studentNumber} existing={r} readOnly={readOnly} testIdPrefix={`mediation-recorded-${e.ref}`} />
                    </li>
                  );
                })}
                {selfRecords.map((r) => (
                  <li key={r.id} data-testid="mediation-recorded-row" className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {MEDIATION_HE.selfApproachKind}, {clockHe(Date.parse(r.event_time_iso))} · {MEDIATION_HE.recorded}
                    </span>
                    <MediationControls key={`${r.id}-${r.recorded_at}`} event={null} studentNumber={studentNumber} existing={r} readOnly={readOnly} testIdPrefix={`mediation-recorded-${r.id}`} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
