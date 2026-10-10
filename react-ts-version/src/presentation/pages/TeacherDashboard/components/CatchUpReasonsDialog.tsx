/**
 * Catch-up time: the teacher's dialog when a meeting is closed (or another one
 * opened) while learners who started it have not finished. Props-driven, no
 * data access (DESIGN.md of claude/catch-up-time, flows 1, 2 and 6).
 *
 * Owner decision, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \
 * זמן נוסף וזה יתועד מה הסיבה לכך". Per learner a reason from the closed list
 * (nothing preselected, as in the reset dialog — PRD 23א §ד's lesson: a
 * preselected reason logs a reason nobody chose) and an optional note that
 * passes the same PII check. Neither action is possible until every learner
 * has a reason; cancelling writes nothing.
 *
 * Teacher screen: the teacher is addressed in the plural ("בחרו", "פתחו"), as
 * on every teacher screen (core/teacherGender.ts), so no gender helper here.
 */
import { useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Clock, X, RotateCcw, ArrowLeft, RefreshCw } from 'lucide-react';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import {
  CATCHUP_REASON_KEYS,
  CATCHUP_REASON_HE,
  validateCatchUpNote,
  type CatchUpReasonEntry,
  type CatchUpReasonKey,
  type UnfinishedLearner,
} from '@/core/catchUp';

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

export const CATCHUP_DIALOG_HE = {
  reopen: 'פתחו שוב את המפגש להשלמה',
  continue: 'המשיכו בכל זאת',
  cancel: 'ביטול',
  closeWindow: 'סגירת החלון',
  reasonPlaceholder: 'בחרו סיבה',
  sameForAll: 'אותה סיבה לכל התלמידים:',
  notePlaceholder: 'הערה (לא חובה) — בלי שמות, רק מספר תלמיד',
  needAllReasons: 'כדי להמשיך, בחרו סיבה לכל תלמיד.',
  saving: 'שומרים את הסיבות…',
  meeting2: 'במפגש 2, "המשיכו בכל זאת" מסיים את המפגש כרגיל, גם למי שלא סיים. "פתחו שוב את המפגש להשלמה" נותן להם זמן להמשיך מהמקום שבו עצרו.',
} as const;

export function catchUpDialogTitleHe(trigger: 'close' | 'open_other', meeting: number, nextMeeting: number | null): string {
  if (trigger === 'close') return `לפני שסוגרים את מפגש ${meeting}`;
  if (nextMeeting === meeting) return `לפני שפותחים שוב את מפגש ${meeting}`;
  return nextMeeting ? `לפני שפותחים את מפגש ${nextMeeting}` : 'לפני שפותחים מפגש אחר';
}

export function catchUpDialogLeadHe(trigger: 'close' | 'open_other', meeting: number): string {
  return trigger === 'close'
    ? 'התלמידים האלה התחילו את המפגש ולא סיימו אותו. בחרו לכל תלמיד את הסיבה לכך.'
    : `במפגש ${meeting} יש תלמידים שהתחילו ולא סיימו. בחרו לכל תלמיד את הסיבה לכך.`;
}

function reopenHintHe(trigger: 'close' | 'open_other', meeting: number, nextMeeting: number | null): string {
  const body = `מפגש ${meeting} ייפתח שוב לכל הכיתה. מי שלא סיים ימשיך מהמקום שבו עצר, ומי שסיים יחכה בינתיים.`;
  if (trigger === 'close' || nextMeeting === meeting) return body;
  return `${nextMeeting ? `מפגש ${nextMeeting}` : 'המפגש האחר'} לא ייפתח עכשיו. ${body}`;
}

function continueHintHe(trigger: 'close' | 'open_other', meeting: number, nextMeeting: number | null): string {
  if (trigger === 'close') return `מפגש ${meeting} ייסגר, והסיבות יישמרו.`;
  // The same meeting again without a catch-up round: nothing measures the extra time.
  if (nextMeeting === meeting) return `מפגש ${meeting} ייפתח שוב, והסיבות יישמרו. זמן ההשלמה לא יתועד.`;
  return `${nextMeeting ? `מפגש ${nextMeeting}` : 'המפגש האחר'} ייפתח, והסיבות יישמרו.`;
}

export function CatchUpReasonsDialog(props: CatchUpReasonsDialogProps): ReactElement | null {
  if (!props.isOpen) return null;
  // Mounted only while open: every opening starts with no reason chosen.
  return <DialogBody {...props} />;
}

type RowState = { reason: CatchUpReasonKey | ''; note: string; noteError: string | null };

function DialogBody({
  meeting,
  learners,
  trigger,
  nextMeeting,
  isMeeting2,
  isSaving,
  onReopen,
  onContinue,
  onCancel,
}: CatchUpReasonsDialogProps): ReactElement {
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [sameForAll, setSameForAll] = useState<CatchUpReasonKey | ''>('');

  // Cancel always works, also while the reasons are being saved: the teacher
  // is never held in this window by a slow or missing network.
  const handleCancel = () => {
    onCancel();
  };
  const dialogRef = useDismissableOverlay<HTMLDivElement>(true, handleCancel);

  const rowOf = (n: number): RowState => rows[n] ?? { reason: '', note: '', noteError: null };
  const setRow = (n: number, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [n]: { ...(prev[n] ?? { reason: '', note: '', noteError: null }), ...patch } }));

  const allReasons = learners.length > 0 && learners.every((l) => rowOf(l.studentNumber).reason !== '');
  const anyNoteError = learners.some((l) => rowOf(l.studentNumber).noteError !== null);
  const canAct = allReasons && !anyNoteError && !isSaving;

  const applySameForAll = (value: CatchUpReasonKey | '') => {
    setSameForAll(value);
    if (!value) return;
    setRows((prev) => {
      const next = { ...prev };
      for (const l of learners) {
        next[l.studentNumber] = { ...(prev[l.studentNumber] ?? { reason: '', note: '', noteError: null }), reason: value };
      }
      return next;
    });
  };

  // Validates every note again at the moment of the click, so nothing that
  // failed the PII check can leave the dialog.
  const buildEntries = (): CatchUpReasonEntry[] | null => {
    const entries: CatchUpReasonEntry[] = [];
    let failed = false;
    for (const l of learners) {
      const row = rowOf(l.studentNumber);
      if (!row.reason) return null;
      const check = validateCatchUpNote(row.note);
      if (!check.ok) {
        setRow(l.studentNumber, { noteError: check.errorHe });
        failed = true;
        continue;
      }
      entries.push({ studentNumber: l.studentNumber, reason: row.reason, note: check.note, stoppedAtHe: l.stoppedAtHe || null });
    }
    return failed ? null : entries;
  };

  const act = (handler: (entries: CatchUpReasonEntry[]) => void) => {
    if (!canAct) return;
    const entries = buildEntries();
    if (entries) handler(entries);
  };

  const title = catchUpDialogTitleHe(trigger, meeting, nextMeeting);
  const titleId = `catchup-title-${meeting}-${trigger}`;

  // Same layer as the reset confirmation: above the learner drawer.
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in"
      dir="rtl"
      onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
      data-testid="catchup-backdrop"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl relative">
        <button
          type="button"
          onClick={handleCancel}
          aria-label={CATCHUP_DIALOG_HE.closeWindow}
          className="absolute top-4 left-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-950/50 text-stone-600">
            <Clock className="w-7 h-7" aria-hidden="true" />
          </div>
          <div>
            <h3 id={titleId} className="text-xl font-black text-slate-900 dark:text-white">{title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{catchUpDialogLeadHe(trigger, meeting)}</p>
          </div>
        </div>

        {isMeeting2 && (
          <p className="p-3 mb-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs font-semibold text-slate-700 dark:text-slate-300">
            {CATCHUP_DIALOG_HE.meeting2}
          </p>
        )}

        {learners.length > 1 && (
          <div className="flex items-center gap-2 mb-3">
            <label htmlFor="catchup-same-for-all" className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
              {CATCHUP_DIALOG_HE.sameForAll}
            </label>
            <select
              id="catchup-same-for-all"
              value={sameForAll}
              onChange={(e) => applySameForAll(e.target.value as CatchUpReasonKey | '')}
              disabled={isSaving}
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500"
            >
              <option value="">{CATCHUP_DIALOG_HE.reasonPlaceholder}</option>
              {CATCHUP_REASON_KEYS.map((key) => (
                <option key={key} value={key}>{CATCHUP_REASON_HE[key]}</option>
              ))}
            </select>
          </div>
        )}

        <ul className="space-y-3 mb-4">
          {learners.map((l) => {
            const row = rowOf(l.studentNumber);
            const n = l.studentNumber;
            return (
              <li
                key={n}
                data-testid={`catchup-row-${n}`}
                className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-200/60 dark:border-slate-700/60"
              >
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <span className="text-sm font-black text-slate-900 dark:text-white">תלמיד {n}</span>
                  {l.stoppedAtHe && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">הגיע עד: {l.stoppedAtHe}</span>
                  )}
                </div>
                <select
                  aria-label={`סיבה לתלמיד ${n}`}
                  aria-required="true"
                  required
                  value={row.reason}
                  onChange={(e) => setRow(n, { reason: e.target.value as CatchUpReasonKey | '' })}
                  disabled={isSaving}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500 mb-2"
                >
                  <option value="" disabled>{CATCHUP_DIALOG_HE.reasonPlaceholder}</option>
                  {CATCHUP_REASON_KEYS.map((key) => (
                    <option key={key} value={key}>{CATCHUP_REASON_HE[key]}</option>
                  ))}
                </select>
                <input
                  type="text"
                  aria-label={`הערה לתלמיד ${n}`}
                  value={row.note}
                  onChange={(e) => {
                    const value = e.target.value;
                    const check = validateCatchUpNote(value);
                    setRow(n, { note: value, noteError: check.ok ? null : check.errorHe });
                  }}
                  disabled={isSaving}
                  placeholder={CATCHUP_DIALOG_HE.notePlaceholder}
                  aria-invalid={row.noteError ? true : undefined}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500"
                />
                {row.noteError && (
                  <p role="alert" className="mt-1.5 text-xs font-bold text-red-700 dark:text-red-300">{row.noteError}</p>
                )}
              </li>
            );
          })}
        </ul>

        {!allReasons && (
          <p className="mb-3 text-xs font-semibold text-stone-700 dark:text-stone-300">{CATCHUP_DIALOG_HE.needAllReasons}</p>
        )}
        {isSaving && (
          <p role="status" className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
            {CATCHUP_DIALOG_HE.saving}
          </p>
        )}

        <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div>
            <button
              type="button"
              onClick={() => act(onReopen)}
              disabled={!canAct}
              className="w-full px-5 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed bg-stone-600 hover:bg-stone-700 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>{CATCHUP_DIALOG_HE.reopen}</span>
            </button>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{reopenHintHe(trigger, meeting, nextMeeting)}</p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => act(onContinue)}
              disabled={!canAct}
              className="w-full px-5 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 rounded-xl border border-slate-300 dark:border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <span>{CATCHUP_DIALOG_HE.continue}</span>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{continueHintHe(trigger, meeting, nextMeeting)}</p>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              {CATCHUP_DIALOG_HE.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
