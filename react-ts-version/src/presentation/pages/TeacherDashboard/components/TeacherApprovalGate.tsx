import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Sparkles, UserCheck } from 'lucide-react';
import type { PedagogicalPath } from '@/types';
import { ROUTE_NAME_HE, TEACHER_GATE_HE } from '@/core/routeLabels';
import { meetingShortLabelHe } from '@/core/stationNames';
import { NO_RECOMMENDATION_HE, type GateStudentItem, type UnfinishedMeeting2Item } from '../gateEvidence';

export type { GateStudentItem, UnfinishedMeeting2Item };

interface TeacherApprovalGateProps {
  students: GateStudentItem[];
  onApproveStudent: (studentId: string, path: PedagogicalPath) => Promise<boolean | void>;
  onApproveAll: (pathMap: Record<string, PedagogicalPath>) => Promise<void>;
  isLoading?: boolean;
  /** Learners who started meeting 2 and did not finish it (gateEvidence buildUnfinishedMeeting2Items). */
  unfinished?: UnfinishedMeeting2Item[];
  /** Meeting 2 is open (or paused) right now: the learners above are still working. */
  isMeeting2Open?: boolean;
  /** Opens meeting 2 again through the dashboard's activation window. */
  onReopenMeeting2?: () => void;
  /** Opens the learner's diagnostic report (the evidence behind the row). */
  onOpenLearner?: (studentId: string) => void;
}

/**
 * Module 20: Teacher Approval Gate (שער אישור מעבר פדגוגי - צד המורה)
 * Anonymous review of Session 2 diagnostic outcomes and path approvals for Session 3.
 * Zero-PII: Strictly anonymous student identifiers (תלמיד 1..12).
 */
export function TeacherApprovalGate({
  students,
  onApproveStudent,
  onApproveAll,
  isLoading = false,
  unfinished = [],
  isMeeting2Open = false,
  onReopenMeeting2,
  onOpenLearner,
}: TeacherApprovalGateProps) {
  const [approvingId, setApprovingId] = useState<string | null>(null);
  // Manual path overrides only. The effective path for a learner is the
  // override if the teacher touched the select, else the LIVE recommendation.
  // This state used to be seeded once from the students prop — which is empty
  // on first render (the gate list arrives from an async Firestore listener) —
  // and `|| 'green_path'` then silently approved a struggling learner onto the
  // green (10,000-range) bank, the exact routing Module 26 forbids.
  const [selectedPaths, setSelectedPaths] = useState<Record<string, PedagogicalPath>>({});

  // Null when the diagnostic has no recommendation and the teacher has not
  // chosen yet: the learner is then not approved — not even by the batch button
  // — until the teacher picks a path herself (Module 20: the recommendation
  // comes from the diagnostic, never from a default).
  const effectivePath = (s: GateStudentItem): PedagogicalPath | null =>
    selectedPaths[s.studentId] ?? s.recommendedPath;

  const waitingStudents = students.filter((s) => !s.isApproved);
  const approvedStudents = students.filter((s) => s.isApproved);
  const readyStudents = waitingStudents.filter((s) => effectivePath(s) !== null);
  const undecidedCount = waitingStudents.length - readyStudents.length;

  const handlePathChange = (studentId: string, path: PedagogicalPath) => {
    setSelectedPaths((prev) => ({ ...prev, [studentId]: path }));
  };

  const handleSingleApprove = async (studentId: string) => {
    const st = students.find((x) => x.studentId === studentId);
    if (!st) return;
    const path = effectivePath(st);
    if (!path) return;
    setApprovingId(studentId);
    try {
      await onApproveStudent(studentId, path);
    } finally {
      setApprovingId(null);
    }
  };

  const handleBatchApprove = async () => {
    setApprovingId('ALL');
    try {
      // Built at click time from the learners actually waiting — never from a
      // stale map, and never re-approving already-approved learners. A learner
      // with no recommendation and no choice is left waiting.
      const pathMap: Record<string, PedagogicalPath> = {};
      waitingStudents.forEach((s) => {
        const path = effectivePath(s);
        if (path) pathMap[s.studentId] = path;
      });
      await onApproveAll(pathMap);
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div dir="rtl" className="w-full flex flex-col gap-6 font-body">
      {/* Header & Batch Action */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-violet-500 inline-block" />
            <h2 className="text-xl font-display font-black text-slate-900 dark:text-white">
              {TEACHER_GATE_HE} לפני {meetingShortLabelHe(3)} 🛡️
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            אישור מעבר מ{meetingShortLabelHe(2)} ל{meetingShortLabelHe(3)} ובחירת מסלול מותאם לפי תוצאות האבחון.
          </p>
        </div>

        {waitingStudents.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleBatchApprove}
              disabled={isLoading || approvingId === 'ALL' || readyStudents.length === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-violet-600/25 active:scale-[0.97] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserCheck className="w-4 h-4" />
              <span>
                {undecidedCount === 0
                  ? `אישור כל ${waitingStudents.length} התלמידים הממתינים`
                  : `אישור ${readyStudents.length} התלמידים שנקבע להם מסלול`}
              </span>
            </button>
            {undecidedCount > 0 && (
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {undecidedCount === 1
                  ? 'לתלמיד אחד טרם נקבעה המלצה. יש לבחור עבורו מסלול בטבלה.'
                  : `ל-${undecidedCount} תלמידים טרם נקבעה המלצה. יש לבחור עבורם מסלול בטבלה.`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Started meeting 2 and did not finish (owner decision 2.10.2026): a
          close by time completes no one and keeps their work; the teacher can
          open the meeting again so they finish from where they stopped. */}
      {unfinished.length > 0 && (
        <section
          aria-labelledby="gate-unfinished-title"
          className="bg-stone-50 dark:bg-stone-950/30 p-5 rounded-3xl border border-stone-200 dark:border-stone-900 flex flex-col gap-3"
        >
          <div>
            <p className="text-[11px] font-bold text-stone-800 dark:text-stone-300">{meetingShortLabelHe(2)}</p>
            <h3 id="gate-unfinished-title" className="font-extrabold text-sm text-stone-950 dark:text-stone-100">
              תלמידים שהתחילו את המפגש ולא סיימו ({unfinished.length})
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
                  className="self-start px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-xs rounded-2xl shadow-sm transition-all cursor-pointer active:scale-[0.97]"
                >
                  פתחו שוב את {meetingShortLabelHe(2)}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* Waiting Students Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200">
            תלמידים הממתינים לאישור כניסה ל{meetingShortLabelHe(3)} ({waitingStudents.length})
          </span>
        </div>

        {waitingStudents.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            {/* After level 3 nobody has finished meeting 2: "all approved" was not true then. */}
            {approvedStudents.length === 0
              ? `עדיין אף תלמיד לא סיים את ${meetingShortLabelHe(2)}, ולכן אין תלמידים שממתינים לאישור.`
              : 'אין תלמידים הממתינים לאישור כרגע. כל התלמידים שאובחנו אושרו למפגש הבא! ✨'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <th className="p-4">מזהה תלמיד</th>
                  <th className="p-4">תוצאות אבחון מיומנויות</th>
                  <th className="p-4">מסלול מומלץ</th>
                  <th className="p-4">מסלול מאושר</th>
                  <th className="p-4 text-left">פעולה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {waitingStudents.map((st) => {
                  const currentPath = effectivePath(st);
                  const isBusy = approvingId === st.studentId || approvingId === 'ALL';

                  return (
                    <tr key={st.studentId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 font-black text-slate-900 dark:text-white">
                        {onOpenLearner ? (
                          <button
                            type="button"
                            onClick={() => onOpenLearner(st.studentId)}
                            title="פתיחת דוח האבחון של התלמיד"
                            className="font-black underline decoration-dotted underline-offset-4 hover:text-violet-700 dark:hover:text-violet-300 cursor-pointer"
                          >
                            {st.anonymousLabel}
                          </button>
                        ) : (
                          st.anonymousLabel
                        )}
                      </td>

                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {st.scoreSummary || `הושלם אבחון ${meetingShortLabelHe(2)}`}
                          </span>
                          {st.errorNodes && st.errorNodes.length > 0 && (
                            <span className="text-[10px] text-rose-500 font-medium">
                              מוקדי חיזוק: {st.errorNodes.join(', ')}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-4">
                        {st.recommendedPath === 'green_path' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                            <Sparkles className="w-3 h-3" />
                            {ROUTE_NAME_HE.green_path}
                          </span>
                        ) : st.recommendedPath === 'remediation_path' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-stone-100 text-stone-800 dark:bg-stone-950/60 dark:text-stone-300">
                            <AlertCircle className="w-3 h-3" />
                            {ROUTE_NAME_HE.remediation_path}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {NO_RECOMMENDATION_HE}
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <select
                          value={currentPath ?? ''}
                          onChange={(e) => handlePathChange(st.studentId, e.target.value as PedagogicalPath)}
                          aria-label={`מסלול מאושר — ${st.anonymousLabel}`}
                          className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-violet-500"
                        >
                          {currentPath === null && (
                            <option value="" disabled>בחרו מסלול</option>
                          )}
                          <option value="green_path">{ROUTE_NAME_HE.green_path}</option>
                          <option value="remediation_path">{ROUTE_NAME_HE.remediation_path}</option>
                        </select>
                      </td>

                      <td className="p-4 text-left">
                        <button
                          type="button"
                          onClick={() => handleSingleApprove(st.studentId)}
                          disabled={isBusy || currentPath === null}
                          title={currentPath === null ? 'יש לבחור מסלול לפני האישור' : undefined}
                          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isBusy ? 'מאשר...' : 'אשרו את המסלול'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approved Students Summary */}
      {approvedStudents.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 flex items-center justify-between">
          <span>תלמידים שכבר אושרו ל{meetingShortLabelHe(3)}: {approvedStudents.length}</span>
          {/* The approval lets them in; the meeting itself opens only when the
              teacher opens it for the class (PRD 14 §ב0). */}
          <span className="font-bold text-violet-600 dark:text-violet-400">ייכנסו כשתפתחו את המפגש לכיתה</span>
        </div>
      )}
    </div>
  );
}

export default TeacherApprovalGate;
