import { useState } from 'react';
import { READ_ONLY_TITLE, useIsReadOnlyStaff } from '@/application/useIsReadOnlyStaff';
import { UserCheck } from 'lucide-react';
import type { PedagogicalPath } from '@/types';
import { TEACHER_GATE_HE, routePairFor } from '@/core/routeLabels';
import { meetingShortLabelHe } from '@/core/stationNames';
import { type GateStudentItem, type UnfinishedMeeting2Item } from '../gateEvidence';

export type { GateStudentItem, UnfinishedMeeting2Item };

export interface TeacherApprovalGateProps {
  students: GateStudentItem[];
  onApproveAll: (pathMap: Record<string, PedagogicalPath>) => Promise<void>;
  isLoading?: boolean;
  /** Learners who started meeting 2 and did not finish it (gateEvidence buildUnfinishedMeeting2Items). */
  unfinished?: UnfinishedMeeting2Item[];
  /** Meeting 2 is open (or paused) right now: the learners above are still working. */
  isMeeting2Open?: boolean;
  /** Opens meeting 2 again through the dashboard's activation window. */
  onReopenMeeting2?: () => void;
}

/**
 * Module 20, שלב החלוקה למסלולים — the part of the stage that is about the whole class, at the top of
 * "ניהול כיתה ומסלולים" (owner, 11.10.2026: one place for every decision about a learner). Each learner's
 * own approval, with the matrix recommendation and the diagnostic evidence, is on the learner's row below.
 *
 * Here: how many wait, one button that approves every waiting learner's recommendation, and (PRD Module 14
 * §ב) the learners who started meeting 2 and did not finish, with the task each stopped on and one button
 * that opens meeting 2 again. Zero-PII: anonymous numbers only (תלמיד 1..12).
 */
export function TeacherApprovalGate({
  students,
  onApproveAll,
  isLoading = false,
  unfinished = [],
  isMeeting2Open = false,
  onReopenMeeting2,
}: TeacherApprovalGateProps) {
  const [isBatchApproving, setIsBatchApproving] = useState(false);
  const readOnly = useIsReadOnlyStaff();

  // The recommendation knows the graded mark (graded_path or graded_foundation_path for a marked learner).
  // A marked learner with no recommendation yet stays on the graded path; anyone else with none waits for
  // the teacher's own choice on the row (Module 20: never a default colour).
  // The recommendation is read with the learner's CURRENT mark (gateEvidence → recommendedPathOf), so a mark
  // toggled after meeting 2 moves it into the new pair; a path outside the pair is never approved.
  const effectivePath = (s: GateStudentItem): PedagogicalPath | null => {
    const path = s.recommendedPath ?? (s.gradedTrack ? 'graded_path' : null);
    return path && routePairFor(s.gradedTrack === true).includes(path) ? path : null;
  };

  const waitingStudents = students.filter((s) => !s.isApproved);
  const approvedStudents = students.filter((s) => s.isApproved);
  const readyStudents = waitingStudents.filter((s) => effectivePath(s) !== null);
  const undecidedCount = waitingStudents.length - readyStudents.length;

  const handleBatchApprove = async () => {
    setIsBatchApproving(true);
    try {
      // Built at click time from the learners actually waiting — never re-approving an approved learner.
      // A learner with no recommendation is left waiting.
      const pathMap: Record<string, PedagogicalPath> = {};
      readyStudents.forEach((s) => {
        const path = effectivePath(s);
        if (path) pathMap[s.studentId] = path;
      });
      await onApproveAll(pathMap);
    } finally {
      setIsBatchApproving(false);
    }
  };

  const batchLabel =
    waitingStudents.length === 1
      ? 'אישור ההמלצה לתלמיד הממתין'
      : undecidedCount === 0
        ? `אישור ההמלצה לכל ${waitingStudents.length} התלמידים הממתינים`
        : `אישור ההמלצה ל-${readyStudents.length} מתוך ${waitingStudents.length} התלמידים הממתינים`;

  return (
    <section
      dir="rtl"
      aria-labelledby="gate-panel-title"
      data-testid="gate-panel"
      className="w-full flex flex-col gap-2 bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="gate-panel-title" className="text-base font-black text-slate-900 dark:text-white">
            {TEACHER_GATE_HE}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {waitingStudents.length === 0
              ? approvedStudents.length === 0
                ? `עדיין אף תלמיד לא סיים את ${meetingShortLabelHe(2)}, ולכן אין תלמידים שממתינים לאישור.`
                : 'אין תלמידים הממתינים לאישור כרגע. כל התלמידים שאובחנו אושרו למפגש הבא.'
              : `ממתינים לאישור: ${waitingStudents.length}. אישור מסלול בשורת התלמיד משחרר אותו ל${meetingShortLabelHe(3)}.`}
            {approvedStudents.length > 0 && (
              <>
                {' '}
                <span>תלמידים שכבר אושרו ל{meetingShortLabelHe(3)}: {approvedStudents.length}.</span>{' '}
                {/* The approval lets them in; the meeting itself opens only when the teacher opens it (PRD 14 §ב0). */}
                <span className="font-bold text-violet-700 dark:text-violet-300">ייכנסו כשתפתחו את המפגש לכיתה</span>
              </>
            )}
          </p>
        </div>

        {waitingStudents.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleBatchApprove}
              disabled={readOnly || isLoading || isBatchApproving || readyStudents.length === 0}
              title={readOnly ? READ_ONLY_TITLE : "כל תלמיד ממתין מאושר למסלול שהמטריקס ממליץ לו"}
              className="min-h-11 px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            >
              <UserCheck className="w-4 h-4" aria-hidden="true" />
              <span>{batchLabel}</span>
            </button>
            {undecidedCount > 0 && (
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                {undecidedCount === 1
                  ? 'לתלמיד אחד טרם נקבעה המלצה. יש לבחור עבורו מסלול בטבלה.'
                  : `ל-${undecidedCount} תלמידים טרם נקבעה המלצה. יש לבחור עבורם מסלול בטבלה.`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Started meeting 2 and did not finish (owner decision 2.10.2026; PRD Module 14 §ב): a close by time
          completes no one and keeps their work; the teacher can open the meeting again so they finish from
          where they stopped. */}
      {unfinished.length > 0 && (
        <section
          aria-labelledby="gate-unfinished-title"
          className="bg-stone-50 dark:bg-stone-950/30 px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-900 flex flex-col gap-2"
        >
          <div>
            <p className="text-[11px] font-bold text-stone-800 dark:text-stone-300">{meetingShortLabelHe(2)}</p>
            <h3 id="gate-unfinished-title" className="font-extrabold text-sm text-stone-950 dark:text-stone-100">
              {TEACHER_GATE_HE}: תלמידים שהתחילו את המפגש ולא סיימו ({unfinished.length})
            </h3>
          </div>
          <ul className="flex flex-wrap gap-2">
            {unfinished.map((u) => (
              <li
                key={u.studentId}
                className="px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-stone-200 dark:border-stone-800 text-xs font-bold text-slate-800 dark:text-slate-200"
              >
                {u.anonymousLabel} · עצר במשימה {u.currentTask} מתוך 7
              </li>
            ))}
          </ul>
          {isMeeting2Open ? (
            <p className="text-xs text-stone-900 dark:text-stone-200">
              המפגש פתוח עכשיו, והם עדיין עובדים. כשתסגרו אותו בכפתור &quot;סגרו את המפגש&quot;, הם יעברו לטבלה שלמטה.
            </p>
          ) : (
            <>
              <p className="text-xs text-stone-900 dark:text-stone-200">
                המפגש נסגר לפני שהם סיימו, וכל מה שעשו נשמר. אם תפתחו אותו שוב לכיתה, הם ימשיכו מהמשימה שבה עצרו. מי שסיים את כל המשימות, או שכבר אישרתם לו מסלול, לא יעשה את המפגש שוב.
                כשתסגרו את המפגש בכפתור &quot;סגרו את המפגש&quot;, הם יעברו לטבלה שלמטה.
              </p>
              {onReopenMeeting2 && (
                <button
                  type="button"
                  onClick={onReopenMeeting2}
                  disabled={readOnly}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className="self-start min-h-11 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                >
                  פתחו שוב את {meetingShortLabelHe(2)}
                </button>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}

export default TeacherApprovalGate;
