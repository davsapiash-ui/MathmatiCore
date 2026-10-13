import { useState } from 'react';
import { Archive, FileText, Loader2 } from 'lucide-react';
import {
  describeEvent,
  describeReportError,
  exerciseTitle,
  fetchClearedActions,
  fetchMeetingReportUrl,
  formatClock,
  formatDate,
  generateMeetingReport,
  PDF_BLOCKED_HE,
  type JourneyEvent,
  type MeetingResetMark,
} from '@/infrastructure/services/LearnerJourneyService';

/** PRD 23א §ב.2 and 23 §ב (owner, 12.10.2026): the two buttons, in the PRD's words. */
export const SHOW_FROM_BACKUP_HE = 'הצגת הפעולות מהגיבוי';
export const REPORT_FROM_BACKUP_HE = 'דוח מהגיבוי';
export const HIDE_FROM_BACKUP_HE = 'הסתרת הפעולות מהגיבוי';

export function clearedResetLineHe(r: Pick<MeetingResetMark, 'at' | 'scope'>, sessionNumber: number): string {
  const time = new Date(r.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const which = r.scope === 'active_session' ? ` של מפגש ${sessionNumber}` : '';
  return `באיפוס שנעשה ב-${formatDate(r.at)} בשעה ${time} נמחקה רשימת הפעולות${which}. הפעולות שמורות בגיבוי.`;
}

interface Props {
  studentNum: number;
  sessionNumber: number;
  /** The resets of this meeting that cleared the actions list (resetsOfMeeting, actionsCleared). */
  resets: MeetingResetMark[];
}

/**
 * PRD 23א §ב.2 (owner, 12.10.2026): beside a reset that cleared the actions
 * list, "הצגת הפעולות מהגיבוי" shows the cleared actions read-only, and "דוח
 * מהגיבוי" builds the learner report, with the AI analysis, from them. Nothing
 * here writes them back into the system.
 */
export function ClearedActionsFromBackup({ studentNum, sessionNumber, resets }: Props) {
  const cleared = resets.filter((r) => r.actionsCleared && r.resetId);
  if (cleared.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="cleared-actions-from-backup">
      {cleared.map((r) => (
        <ClearedReset key={r.resetId} studentNum={studentNum} sessionNumber={sessionNumber} reset={r} />
      ))}
    </div>
  );
}

function ClearedReset({ studentNum, sessionNumber, reset }: { studentNum: number; sessionNumber: number; reset: MeetingResetMark }) {
  const [events, setEvents] = useState<JourneyEvent[] | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'report' | 'error'>('idle');
  const [error, setError] = useState('');

  const load = async (): Promise<JourneyEvent[]> => {
    if (events) return events;
    const list = await fetchClearedActions(reset.resetId!, sessionNumber);
    setEvents(list);
    return list;
  };

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setState('loading');
    setError('');
    try {
      await load();
      setOpen(true);
      setState('idle');
    } catch (err) {
      setError(describeReportError(err).message);
      setState('error');
    }
  };

  const report = async () => {
    // The tab opens in the click; a tab opened after the wait may be blocked (LearnerJourney openReportPdf).
    const tab = window.open('', '_blank');
    if (!tab) { setError(PDF_BLOCKED_HE); setState('error'); return; }
    setState('report');
    setError('');
    try {
      const list = await load();
      const sessionId = list[0]?.sessionId || `session_${sessionNumber}_student_student_user${studentNum}`;
      const r = await generateMeetingReport({ studentNum, sessionNumber, sessionId, fromBackupResetId: reset.resetId });
      if (r.pdfFailureMessage) throw new Error(r.pdfFailureMessage);
      tab.location.href = await fetchMeetingReportUrl(r.sessionId, r.reportId);
      setState('idle');
    } catch (err) {
      tab.close();
      setError(describeReportError(err).message);
      setState('error');
    }
  };

  return (
    <div className="rounded-2xl border border-stone-300 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-950/30 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
          <Archive className="w-4 h-4 shrink-0" aria-hidden="true" />
          {clearedResetLineHe(reset, sessionNumber)}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggle}
            disabled={state === 'loading' || state === 'report'}
            data-testid="show-actions-from-backup"
            className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 disabled:opacity-60"
          >
            {state === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null}
            {open ? HIDE_FROM_BACKUP_HE : SHOW_FROM_BACKUP_HE}
          </button>
          <button
            type="button"
            onClick={report}
            disabled={state === 'loading' || state === 'report'}
            data-testid="report-from-backup"
            className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 disabled:opacity-60"
          >
            {state === 'report' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <FileText className="w-3.5 h-3.5" aria-hidden="true" />}
            {REPORT_FROM_BACKUP_HE}
          </button>
        </div>
      </div>
      {error ? <p role="alert" className="text-xs font-semibold text-stone-900 dark:text-stone-100">{error}</p> : null}
      {open && events ? (
        <div className="max-h-[360px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-right text-xs" aria-label={SHOW_FROM_BACKUP_HE}>
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black sticky top-0">
              <tr>
                <th className="p-2">שעה</th>
                <th className="p-2">תרגיל</th>
                <th className="p-2">פעולה</th>
                <th className="p-2">פרטים</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {events.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-slate-500">אין בגיבוי פעולות של המפגש הזה.</td></tr>
              ) : events.map((e) => {
                const d = describeEvent(e);
                return (
                  <tr key={e.id} className="text-slate-800 dark:text-slate-200">
                    <td className="p-2 font-mono text-[11px] whitespace-nowrap" dir="ltr">{formatClock(e.timestamp)}</td>
                    <td className="p-2">{exerciseTitle(sessionNumber, e.exerciseId)}</td>
                    <td className="p-2 font-bold">{d.label}</td>
                    <td className="p-2">{d.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
