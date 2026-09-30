import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Sparkles, UserCheck } from 'lucide-react';
import type { PedagogicalPath } from '@/types';
import { ROUTE_NAME_HE, TEACHER_GATE_HE } from '@/core/routeLabels';
import { meetingShortLabelHe } from '@/core/stationNames';
import { NO_RECOMMENDATION_HE, type GateStudentItem } from '../gateEvidence';

export type { GateStudentItem };

interface TeacherApprovalGateProps {
  students: GateStudentItem[];
  onApproveStudent: (studentId: string, path: PedagogicalPath) => Promise<boolean | void>;
  onApproveAll: (pathMap: Record<string, PedagogicalPath>) => Promise<void>;
  isLoading?: boolean;
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
            <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />
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
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-indigo-600/25 active:scale-[0.97] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Waiting Students Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200">
            תלמידים הממתינים לאישור כניסה ל{meetingShortLabelHe(3)} ({waitingStudents.length})
          </span>
        </div>

        {waitingStudents.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            אין תלמידים הממתינים לאישור כרגע. כל התלמידים שאובחנו אושרו למפגש הבא! ✨
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
                        {st.anonymousLabel}
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
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <Sparkles className="w-3 h-3" />
                            {ROUTE_NAME_HE.green_path}
                          </span>
                        ) : st.recommendedPath === 'remediation_path' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
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
                          className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
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
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] inline-flex items-center gap-1.5"
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
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{meetingShortLabelHe(3)} פתוח עבורם</span>
        </div>
      )}
    </div>
  );
}

export default TeacherApprovalGate;
