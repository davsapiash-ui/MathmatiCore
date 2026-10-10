import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import { type StudentData, useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
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
import { ROUTE_NAME_HE, TEACHER_GATE_HE } from '@/core/routeLabels';
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

/** The two route cards: the number range of each route's bank (PRD Module 26). */
export const ROUTE_CARD_HE: Readonly<Record<PedagogicalPath, string>> = {
  green_path: 'חיבור וחיסור במאונך בתחום הרבבה, במספרים עד 10,000.',
  remediation_path: 'חיבור וחיסור במאונך בתחום המאה והאלף, במספרים עד 1,000, לצמצום פערי קדם.',
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
  return evidence?.recommendedPath ?? recommendedPathOf(student);
}

/**
 * What the drawer opens with: the path the gate already approved, else the
 * diagnostic's recommendation, else nothing — the teacher then chooses
 * herself (Module 20: the recommendation comes from the diagnostic, never from
 * a default colour). This used to fall back to green for everyone.
 */
function pathToPreselect(s: Record<string, unknown>, evidence?: GateStudentItem | null): PedagogicalPath | null {
  return approvedPathOf(s, evidence) ?? recommendationOf(s, evidence);
}

/** Whether the gate already approved this learner. */
function isGateApproved(s: Record<string, unknown>, evidence?: GateStudentItem | null): boolean {
  return s.teacher_gate_approved === true || s.routeStatus === 'APPROVED' || evidence?.isApproved === true;
}

/** The path the gate approved, or null while none is. */
function approvedPathOf(s: Record<string, unknown>, evidence?: GateStudentItem | null): PedagogicalPath | null {
  if (!isGateApproved(s, evidence)) return null;
  return s.pedagogicalPath === 'remediation_path' || s.pedagogicalPath === 'green_path' ? s.pedagogicalPath : null;
}

export function TeacherGateApprovalDrawer({ student, evidence, onClose, onApproveSuccess }: Props) {
  const [isApproving, setIsApproving] = useState(false);
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
                  {recommendation === 'green_path' ? (
                    <span className="inline-flex px-3 py-1 rounded-full font-extrabold bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {ROUTE_NAME_HE.green_path}
                    </span>
                  ) : recommendation === 'remediation_path' ? (
                    <span className="inline-flex px-3 py-1 rounded-full font-extrabold bg-stone-100 text-stone-800 dark:bg-stone-950/60 dark:text-stone-300">
                      {ROUTE_NAME_HE.remediation_path}
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
              {/* Green Path */}
              <button
                type="button"
                aria-pressed={selectedPath === 'green_path'}
                onClick={() => setSelectedPath('green_path')}
                className={`text-right p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                  selectedPath === 'green_path'
                    ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 shadow-sm ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                      {ROUTE_NAME_HE.green_path}
                    </span>
                  </div>
                  {selectedPath === 'green_path' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {ROUTE_CARD_HE.green_path}
                </p>
              </button>

              {/* Remediation Path */}
              <button
                type="button"
                aria-pressed={selectedPath === 'remediation_path'}
                onClick={() => setSelectedPath('remediation_path')}
                className={`text-right p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                  selectedPath === 'remediation_path'
                    ? 'border-stone-600 bg-stone-50/60 dark:bg-stone-950/40 shadow-sm ring-2 ring-stone-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-stone-500" />
                    <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                      {ROUTE_NAME_HE.remediation_path}
                    </span>
                  </div>
                  {selectedPath === 'remediation_path' && (
                    <CheckCircle2 className="w-4 h-4 text-stone-600" />
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {ROUTE_CARD_HE.remediation_path}
                </p>
              </button>
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
            disabled={isApproving || selectedPath === null || nothingToSave}
            title={selectedPath === null ? 'יש לבחור מסלול לפני האישור' : nothingToSave ? 'כדי לשנות את המסלול, בחרו במסלול האחר' : undefined}
            className="px-7 py-3 bg-violet-700 hover:bg-violet-800 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-violet-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            <CheckCircle2 className="w-5 h-5 text-stone-300" />
            <span>
              {alreadyApproved
                ? (isApproving ? 'מעדכן...' : nothingToSave ? 'המסלול כבר אושר' : 'שנו את המסלול')
                : (isApproving ? 'מאשר ומפעיל...' : `אשרו והפעילו את התוכנית ל${meetingShortLabelHe(3)}`)}
            </span>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
