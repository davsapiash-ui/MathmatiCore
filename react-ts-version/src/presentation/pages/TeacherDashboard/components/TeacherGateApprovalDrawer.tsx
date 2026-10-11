import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import { type StudentData, useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { READ_ONLY_TITLE, useIsReadOnlyStaff } from '@/application/useIsReadOnlyStaff';
import { approveTeacherGate } from '@/core/teacherGate';
import { recommendedPathOf } from '@/core/recommendedPath';
import type { PedagogicalPath } from '@/types';
import {
  X,
  Sparkles,
  CheckCircle2,
  Compass,
  ClipboardList
} from 'lucide-react';
import { toast } from 'sonner';
import { RECOMMENDED_MARK_HE, ROUTE_APPROVE_HE, ROUTE_NAME_HE, TEACHER_GATE_HE, asRoutePath, routePairFor } from '@/core/routeLabels';
import { ROUTE_COLOR } from '@/core/routeColors';
import { meetingShortLabelHe } from '@/core/stationNames';
import { NO_RECOMMENDATION_HE, type GateStudentItem } from '../gateEvidence';

/**
 * What the teacher reads after a gate approval, here and on the radar. It used
 * to end "ומפגש 3 נפתח": the approval only releases the learner from the
 * wait; a meeting opens when the teacher opens it. "ל" absorbs the definite
 * article: "למסלול הירוק", never "להמסלול הירוק".
 */
export function gateApprovedToastHe(studentNumber: string | number, path: PedagogicalPath): string {
  return `✓ ${TEACHER_GATE_HE}: תלמיד ${studentNumber} אושר ל${ROUTE_NAME_HE[path].replace(/^ה/, '')}.`;
}

/** The route cards (the learner sees the two of their pair): the number range of each route's bank (PRD Module 26). */
export const ROUTE_CARD_HE: Readonly<Record<PedagogicalPath, string>> = {
  green_path: 'חיבור וחיסור במאונך בתחום הרבבה, במספרים עד 10,000.',
  remediation_path: 'חיבור וחיסור במאונך בתחום המאה והאלף, במספרים עד 1,000, לצמצום פערי קדם.',
  graded_path: 'אותם נושאים בדירוג לחינוך המיוחד: חיבור וחיסור במאונך בתחום האלף.',
  graded_foundation_path: 'אותם נושאים לחינוך המיוחד, ברמת יסודות: חיבור וחיסור במאונך בתחום המאה, וערך המקום ממאות שלמות.',
};

interface Props {
  student: StudentData | null;
  /**
   * The learner's gate evidence — the same row the approvals table shows
   * (gateEvidence.ts): the matrix recommendation, the meeting-2 score and the
   * tasks that need support. PRD Module 20: the teacher decides by the matrix
   * recommendation, so the drawer shows it before the choice.
   */
  evidence?: GateStudentItem | null;
  onClose: () => void;
  onApproveSuccess?: () => void;
}

/** The diagnostic's recommendation: the evidence row first, else the learner's own record. */
function recommendationOf(student: Record<string, unknown>, evidence?: GateStudentItem | null): PedagogicalPath | null {
  // Read with the learner's current mark: toggled after meeting 2, the recommendation moves into the new pair.
  return evidence?.recommendedPath ?? recommendedPathOf(student, evidence?.gradedTrack ?? student.graded_track === true);
}

/**
 * What the drawer opens with: the path the gate already approved, else the
 * diagnostic's recommendation, else nothing — the teacher then chooses
 * herself (Module 20: the recommendation comes from the diagnostic, never from
 * a default colour). This used to fall back to green for everyone.
 */
function pathToPreselect(s: Record<string, unknown>, evidence?: GateStudentItem | null): PedagogicalPath | null {
  // The recommendation knows the graded mark (owner, 11.10.2026): graded_path or graded_foundation_path for a
  // marked learner. A marked learner with no recommendation yet opens on the graded path.
  return approvedPathOf(s, evidence) ?? recommendationOf(s, evidence) ?? (s.graded_track === true ? 'graded_path' : null);
}

/** Whether the gate already approved this learner. */
function isGateApproved(s: Record<string, unknown>, evidence?: GateStudentItem | null): boolean {
  return s.teacher_gate_approved === true || s.routeStatus === 'APPROVED' || evidence?.isApproved === true;
}

/** The path the gate approved, or null while none is. */
function approvedPathOf(s: Record<string, unknown>, evidence?: GateStudentItem | null): PedagogicalPath | null {
  if (!isGateApproved(s, evidence)) return null;
  return asRoutePath(s.pedagogicalPath);
}

export function TeacherGateApprovalDrawer({ student, evidence, onClose, onApproveSuccess }: Props) {
  const [isApproving, setIsApproving] = useState(false);
  const readOnly = useIsReadOnlyStaff();
  const sAny = (student || {}) as any;

  const [selectedPath, setSelectedPath] = useState<PedagogicalPath | null>(() => pathToPreselect(sAny, evidence));

  // Re-seed only when a different learner is opened, or when the learner's
  // recommendation itself arrives — never over a choice the teacher made.
  const recommendation = recommendationOf(sAny, evidence);
  useEffect(() => {
    if (student) {
      setSelectedPath(pathToPreselect(student as any, evidence));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.studentId, recommendation]);

  // מסמך העיצוב §1.2: Escape סוגר, הפוקוס נלכד בתוך המגירה, ובסגירה חוזר
  // לאלמנט שממנו היא נפתחה.
  const drawerRef = useDismissableOverlay<HTMLDivElement>(Boolean(student), onClose);

  if (!student) return null;

  const studentNum = student.studentId.replace(/\D/g, '') || student.studentId;
  const scorePercent = evidence?.scorePercent ?? null;
  const supportTasks = evidence?.errorNodes ?? [];
  // An approved learner is not "ממתין להחלטתכם", and there is nothing to
  // approve again: the drawer says so, and its button only changes the path.
  const alreadyApproved = isGateApproved(sAny, evidence);
  const approvedPath = approvedPathOf(sAny, evidence);
  const nothingToSave = alreadyApproved && approvedPath !== null && selectedPath === approvedPath;
  // The learner's own pair of levels: the graded mark decides which (owner, 11.10.2026). A path approved
  // before the mark changed stays visible, so the drawer never hides what the learner is on.
  const pair = routePairFor(evidence?.gradedTrack ?? sAny.graded_track === true);
  const pathOptions: PedagogicalPath[] = approvedPath && !pair.includes(approvedPath) ? [...pair, approvedPath] : [...pair];

  const handleApprove = async () => {
    if (!selectedPath) return;
    setIsApproving(true);
    try {
      // PRD v7.1 Module 20: the session-2 SessionDocument in Firestore is the sole
      // source of truth; approveTeacherGate performs the authoritative write and
      // mirrors to RTDB only so the learner's listener unlocks immediately.
      const teacherId = useAuthStore.getState().user?.uid || null;
      const result = await approveTeacherGate(student.studentId, selectedPath, teacherId);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      useStore.getState().approveRoute(student.studentId);
      toast.success(gateApprovedToastHe(studentNum, selectedPath));
      if (onApproveSuccess) onApproveSuccess();
      onClose();
    } catch (err) {
      console.error('Error approving gate:', err);
      toast.error(`שגיאה ב${TEACHER_GATE_HE}`);
    } finally {
      setIsApproving(false);
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/65 backdrop-blur-md z-[9998] transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`אישור מסלול ל${meetingShortLabelHe(3)} — תלמיד ${studentNum}`}
        className="fixed top-0 right-0 w-full sm:w-[620px] h-[100dvh] bg-white dark:bg-slate-900 shadow-2xl z-[9999] flex flex-col transform transition-transform duration-300 border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right"
        dir="rtl"
      >
        {/* Mobile handle */}
        <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden shrink-0" />

        {/* Header */}
        <div className="h-20 px-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-gradient-to-l from-violet-50/70 via-purple-50/40 to-white dark:from-violet-950/40 dark:via-purple-950/20 dark:to-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-600 text-white flex items-center justify-center font-bold shadow-md shadow-violet-600/20">
              <Sparkles className="w-5 h-5 text-stone-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  {TEACHER_GATE_HE} — תלמיד {studentNum}
                </h2>
                {alreadyApproved ? (
                  <span data-testid="gate-drawer-state" className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                    המסלול אושר
                  </span>
                ) : (
                  <span data-testid="gate-drawer-state" className="bg-stone-100 text-stone-800 dark:bg-stone-950 dark:text-stone-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-stone-200 dark:border-stone-800">
                    ממתין להחלטתכם
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {alreadyApproved
                  ? (approvedPath ? `המסלול שאושר: ${ROUTE_NAME_HE[approvedPath]}` : 'המסלול של התלמיד כבר אושר')
                  : `אישור מסלול לימוד ותוכנית תרגילים לקראת ${meetingShortLabelHe(3)}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-600 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            title="סגרו את החלון"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* STEP 1: THE DIAGNOSTIC EVIDENCE (PRD Module 20: המלצת המטריקס) */}
          <section className="space-y-3" aria-label="ממצאי האבחון">
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-violet-600" />
              <span>1. ממצאי האבחון ב{meetingShortLabelHe(2)}:</span>
            </h3>

            <dl className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 divide-y divide-slate-200 dark:divide-slate-700 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <dt className="font-bold text-slate-600 dark:text-slate-300">המלצת המטריקס</dt>
                <dd data-testid="gate-drawer-recommendation">
                  {recommendation ? (
                    <span className={`inline-flex px-3 py-1 rounded-full font-extrabold ${ROUTE_COLOR[recommendation].chip}`}>
                      {ROUTE_NAME_HE[recommendation]}
                    </span>
                  ) : (
                    <span className="inline-flex px-3 py-1 rounded-full font-extrabold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      {NO_RECOMMENDATION_HE}
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <dt className="font-bold text-slate-600 dark:text-slate-300">ציון האבחון</dt>
                <dd data-testid="gate-drawer-score" className="font-extrabold text-slate-900 dark:text-slate-100">
                  {scorePercent !== null ? `${Math.round(scorePercent)}% (7 משימות חובה)` : 'טרם חושב'}
                </dd>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                <dt className="font-bold text-slate-600 dark:text-slate-300">מוקדי חיזוק</dt>
                <dd data-testid="gate-drawer-support">
                  {supportTasks.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {supportTasks.map((task) => (
                        <li key={task} className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 font-bold">
                          {task}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-400">לא נמצאו משימות הדורשות חיזוק.</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {/* STEP 2: CHOOSE PEDAGOGICAL PATH */}
          <div className="space-y-3">
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
              <Compass className="w-4 h-4 text-violet-600" />
              <span>2. קביעת מסלול הלימוד ל{meetingShortLabelHe(3)} ואילך:</span>
            </label>

            {selectedPath === null && (
              <p data-testid="gate-drawer-choose-hint" className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2">
                טרם נקבעה המלצה. יש לבחור מסלול כדי לאשר.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* The learner's own two levels (owner, 11.10.2026); the other pair stays hidden. */}
              {pathOptions.map((path) => {
                const chosen = selectedPath === path;
                const isRecommended = recommendation === path;
                return (
                  <button
                    key={path}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => setSelectedPath(path)}
                    className={`text-right p-4 rounded-2xl border-2 transition-colors cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      chosen
                        ? ROUTE_COLOR[path].cardOn
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2">
                        <span aria-hidden="true" className={`w-3 h-3 rounded-full ${ROUTE_COLOR[path].dot}`} />
                        <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                          {ROUTE_NAME_HE[path]}
                        </span>
                        {isRecommended && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white text-slate-800 border border-slate-300">
                            {RECOMMENDED_MARK_HE}
                          </span>
                        )}
                      </div>
                      {chosen && (
                        <CheckCircle2 className="w-4 h-4 text-slate-800 dark:text-slate-100" aria-hidden="true" />
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {ROUTE_CARD_HE[path]}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer with Approve Action */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-gradient-to-l from-violet-50/70 via-purple-50/40 to-white dark:from-violet-950/40 dark:via-purple-950/20 dark:to-slate-900 backdrop-blur-md flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
          >
            ביטול
          </button>

          <button
            onClick={handleApprove}
            disabled={readOnly || isApproving || selectedPath === null || nothingToSave}
            title={readOnly ? READ_ONLY_TITLE : selectedPath === null ? 'יש לבחור מסלול לפני האישור' : nothingToSave ? 'כדי לשנות את המסלול, בחרו במסלול האחר' : undefined}
            className="px-7 py-3 bg-violet-700 hover:bg-violet-800 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-violet-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            <CheckCircle2 className="w-5 h-5 text-stone-300" />
            <span>
              {alreadyApproved
                ? (isApproving ? 'מעדכן...' : nothingToSave ? 'המסלול כבר אושר' : 'שנו את המסלול')
                : (isApproving ? 'מאשר ומפעיל...' : selectedPath ? ROUTE_APPROVE_HE[selectedPath] : `אשרו והפעילו את התוכנית ל${meetingShortLabelHe(3)}`)}
            </span>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
