import { useState, useEffect } from 'react';
import { Users, Sparkles, ChevronRight, CheckCircle2, ShieldCheck, RotateCcw, PanelLeftOpen } from 'lucide-react';
import { useStore, type StudentData } from '@/application/useStore';
import { ResetConfirmationModal } from './components/ResetConfirmationModal';
import { LearnerAccessCodes } from './components/LearnerAccessCodes';
import { ref, onValue, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { normalizeStudentId } from '@/application/useChatStore';
import { useAuthStore } from '@/application/useAuthStore';
import { approveTeacherGate } from '@/core/teacherGate';
import { recommendedPathOf } from '@/core/recommendedPath';
import { hasEnhancedSupport, buildSupportProfilePayload } from '@/core/supportProfile';
import { toast } from 'sonner';
import type { PedagogicalPath, ResetReason, SingleStudentResetScope } from '@/types';
import { LEARNER_RESET_TOOLTIP_HE, RESET_ACTION_HE, ROUTE_APPROVE_HE, ROUTE_NAME_HE, TEACHER_GATE_HE, asRoutePath } from '@/core/routeLabels';
import { meetingShortLabelHe } from '@/core/stationNames';

interface StudentRowState {
  id: string;
  studentNumber: number;
  session2Completed: boolean;
  /**
   * The matrix recommendation (PRD Module 20), null while there is none: green / remediation for a regular
   * learner, graded / graded foundations for a learner marked graded (owner, 11.10.2026).
   */
  recommendedPath: PedagogicalPath | null;
  isApproved: boolean;
  /** The path the teacher approved (teacher_selected_path), which may differ from the recommendation. */
  approvedPath: PedagogicalPath | null;
  /** The teacher marked the learner for the graded path before meeting 1 (graded_track). */
  gradedTrack: boolean;
  enhancedSupport: boolean;
  supportProfileVersion: number;
}

const INITIAL_ROWS: StudentRowState[] = Array.from({ length: 12 }, (_, index) => {
  const num = index + 1;
  return {
    id: `student_${num}`,
    studentNumber: num,
    session2Completed: false,
    recommendedPath: null,
    isApproved: false,
    approvedPath: null,
    gradedTrack: false,
    enhancedSupport: false,
    supportProfileVersion: 0,
  };
});

/** What each approve button looks like, pressed and not. */
const PATH_BUTTON_CLASS: Record<PedagogicalPath, { on: string; off: string }> = {
  green_path: { on: 'bg-emerald-700 text-white shadow-md', off: 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200' },
  remediation_path: { on: 'bg-stone-600 text-white shadow-md', off: 'bg-stone-100 text-stone-800 hover:bg-stone-200 dark:bg-stone-900/40 dark:text-stone-200' },
  graded_path: { on: 'bg-violet-700 text-white shadow-md', off: 'bg-violet-100 text-violet-900 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-200' },
  graded_foundation_path: { on: 'bg-teal-700 text-white shadow-md', off: 'bg-teal-100 text-teal-900 hover:bg-teal-200 dark:bg-teal-900/40 dark:text-teal-200' },
};

/** A switch the teacher reads at a glance: the state in words and in the knob's place. */
function TeacherSwitch({ checked, disabled, label, onToggle }: { checked: boolean; disabled?: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? '-translate-x-5' : '-translate-x-0.5'}`} />
    </button>
  );
}

/**
 * ניהול כיתה ותנאי למידה (owner, 11.10.2026): one row per learner (1–12, numbers only), holding every
 * decision the teacher makes about that learner, in one place:
 *   - the path: before meeting 1 she may mark the learner for the graded path (המסלול המדורג, special
 *     education), so that meeting 1's refresh and meeting 2's diagnostic are the graded ones; at the gate
 *     after meeting 2 she approves one of the four paths, next to the matrix recommendation (a marked
 *     learner is recommended the graded path or the graded foundations path);
 *   - the enhanced support profile (PRD Module 19): one switch, saved at once, never shown to the learner;
 *   - the learner's window (replay, chat, reset) and the learner reset.
 * There is no quiet visual mode any more: the design is gentle for everyone (owner, 11.10.2026).
 */
export function ClassManagement({
  activeSessionNumber = null,
  onDrillDown,
}: {
  allStudents: StudentData[];
  onDrillDown?: (studentId: string) => void;
  /** The meeting the teacher currently has open (Module 14), for the level-2 reset dialog. */
  activeSessionNumber?: number | null;
}) {
  const [rows, setRows] = useState<StudentRowState[]>(INITIAL_ROWS);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const studentsRef = ref(database, 'users/students');
    const unsub = onValue(
      studentsRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const raw = snapshot.val() || {};

        setRows((prev) => {
          return prev.map((s, index) => {
            const num = index + 1;
            const uid = `student_${num}`;
            // student_user{N} is the canonical node every live student write lands on; student_{N} is only a
            // write-side mirror alias, so the node the learner actually updates is preferred.
            const data = raw[`student_user${num}`] || raw[uid] || raw[`slot_${num}`] || {};

            const session2Done = Boolean(
              data.completedMeeting2 ||
              data.session_completed === 2 ||
              (typeof data.highestCompletedMeeting === 'number' && data.highestCompletedMeeting >= 2) ||
              data.routeStatus === 'PENDING_TEACHER_APPROVAL' ||
              data.routeStatus === 'APPROVED'
            );

            // core/recommendedPath.ts — the diagnostic's own result, never a default colour.
            const recommended = recommendedPathOf(data);
            const isApproved = data.teacher_gate_approved === true || data.routeStatus === 'APPROVED';
            // Module 20 / Appendix A: the approval's own field decides (teacher_selected_path); pedagogicalPath is
            // the copy older approvals carry (core/teacherGate.ts writes both).
            const approvedPath = isApproved ? asRoutePath(data.teacher_selected_path ?? data.pedagogicalPath) : null;

            return {
              id: uid,
              studentNumber: num,
              session2Completed: session2Done,
              recommendedPath: recommended,
              isApproved,
              approvedPath,
              gradedTrack: data.graded_track === true,
              enhancedSupport: hasEnhancedSupport(data),
              supportProfileVersion: typeof data.support_profile_version === 'number' ? data.support_profile_version : 0,
            };
          });
        });
      },
      (err) => {
        console.warn('[ClassManagement] studentsRef listener notice:', err);
      }
    );

    return () => unsub();
  }, []);

  /** Writes a teacher-owned field to the learner record and its mirror alias (the profile does the same). */
  const writeLearnerFields = async (row: StudentRowState, payload: Record<string, unknown>) => {
    await update(ref(database, `users/students/${row.id}`), payload);
    const normId = normalizeStudentId(row.id);
    if (normId !== row.id) {
      await update(ref(database, `users/students/${normId}`), payload);
    }
  };

  // Module 19: the enhanced support profile of one learner.
  const handleToggleEnhancedSupport = async (row: StudentRowState) => {
    setUpdatingId(row.id);
    try {
      // PRD v7.1 Module 19 §B: support_profile_id is the authoritative server field.
      const teacherId = useAuthStore.getState().user?.uid || null;
      await writeLearnerFields(row, buildSupportProfilePayload(!row.enhancedSupport, teacherId, row.supportProfileVersion));
    } catch (err) {
      console.error('Failed to update enhanced support profile:', err);
      // The switch renders from the live listener, so a denied write looked identical to a no-op.
      toast.error('עדכון פרופיל התמיכה נדחה בשרת. נסו שוב.');
    } finally {
      setUpdatingId(null);
    }
  };

  // The graded mark (owner, 11.10.2026): set before meeting 1; removable until the gate approves a path.
  const handleToggleGradedTrack = async (row: StudentRowState) => {
    setUpdatingId(row.id);
    try {
      await writeLearnerFields(row, { graded_track: row.gradedTrack ? null : true });
    } catch (err) {
      console.error('Failed to update the graded mark:', err);
      toast.error('סימון המסלול המדורג נדחה בשרת. נסו שוב.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Module 20: the gate, one of the four paths.
  const handleApproveGate = async (row: StudentRowState, path: PedagogicalPath) => {
    setUpdatingId(row.id);
    try {
      // PRD v7.1 Module 20: approval is written to the session-2 SessionDocument in Firestore — the sole
      // source of truth — never to a student-level flag.
      const teacherId = useAuthStore.getState().user?.uid || null;
      const result = await approveTeacherGate(row.id, path, teacherId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`✓ ${TEACHER_GATE_HE}: המסלול של תלמיד ${row.studentNumber} אושר`);
    } catch (err) {
      console.error('Failed to approve teacher gate:', err);
      toast.error(`שגיאה ב${TEACHER_GATE_HE}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const [studentToReset, setStudentToReset] = useState<{ id: string; name: string } | null>(null);

  const handleConfirmResetStudent = async (
    reason: ResetReason,
    reasonNote?: string,
    options?: { scope: SingleStudentResetScope; sessionNumber: number | null }
  ) => {
    if (!studentToReset) return;
    const { id: studentId, name: studentName } = studentToReset;
    setUpdatingId(studentId);
    try {
      // The store toasts its own success/failure once.
      await useStore.getState().resetStudentData(studentId, reason, reasonNote, options);
    } catch (err) {
      console.error(`Failed to reset ${studentName}:`, err);
      throw err; // keep the confirmation dialog open — nothing was reset
    } finally {
      setUpdatingId(null);
    }
  };

  // Two by two: the two regular paths, then the two special-education levels (owner, 11.10.2026).
  const PATHS: PedagogicalPath[] = ['green_path', 'remediation_path', 'graded_path', 'graded_foundation_path'];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full h-full flex flex-col space-y-8 animate-in fade-in duration-500" dir="rtl">

      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-violet-50 dark:bg-slate-900 p-8 text-slate-900 dark:text-white shadow-sm border border-violet-200 dark:border-violet-900/60">
        <div className="absolute top-0 right-0 w-80 h-80 bg-violet-200/50 dark:bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-violet-900 dark:text-violet-100">
              <span className="bg-white dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-200 px-3 py-1 rounded-full flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-300" />
                בית ספר ביקורת
              </span>
              <ChevronRight className="w-4 h-4 opacity-70 rotate-180" />
              <span className="bg-white dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-200 px-3 py-1 rounded-full">
                כיתת המבקרים
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <Users className="w-9 h-9 text-violet-700 dark:text-violet-200" />
              ניהול כיתה ותנאי למידה
            </h1>
            <p className="text-slate-600 dark:text-slate-300 text-sm md:text-base font-medium max-w-2xl">
              שורה אחת לכל לומד: המסלול, פרופיל התמיכה המוגבר, חלונית הלומד ואיפוס. כל שינוי נשמר מיד, והלומד אינו רואה על המסך שום סימון.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
            <div className="flex items-center gap-3 bg-white dark:bg-slate-950/40 border border-violet-200 dark:border-slate-700 px-4 py-3 rounded-2xl">
              <div className="text-center">
                <span className="text-[11px] text-slate-600 dark:text-slate-300 block font-semibold">תלמידי הפיילוט</span>
                <span className="text-xl font-black text-violet-800 dark:text-white">12 / 12</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* One row per learner: the path (graded mark before meeting 1, the gate after meeting 2) and the profile. */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none">
        <div className="mb-6 pb-4 border-b border-slate-100 dark:border-slate-800 space-y-2">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-violet-600" />
            התאמות לכל לומד
          </h2>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc pr-4">
            <li>
              <strong>{ROUTE_NAME_HE.graded_path}</strong>: ללומדים בחינוך המיוחד. אותם נושאים בדיוק, בדירוג: חיבור וחיסור במאונך בתחום האלף. סמנו לפני {meetingShortLabelHe(1)}, כדי שהריענון והאבחון יהיו מותאמים. אחרי האבחון לומד שסומן מקבל המלצה לאחת משתי רמות: {ROUTE_NAME_HE.graded_path}, או <strong>{ROUTE_NAME_HE.graded_foundation_path}</strong>, בתחום המאה ובמאות שלמות.
            </li>
            <li>
              <strong>{TEACHER_GATE_HE}</strong>: בסיום {meetingShortLabelHe(2)} הלומדים ממתינים, ואישור מסלול כאן משחרר אותם ל{meetingShortLabelHe(3)}.
            </li>
            <li>
              <strong>פרופיל תמיכה מוגבר</strong>: נעילת המקלדת בטורים שדורשים המרה עד ההמרה בלבני הדינס, לוח החיבור, וצבעי הטורים וכותרות ערך המקום בשורת התוצאה. אינו תלוי במסלול.
            </li>
          </ul>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-separate border-spacing-y-2">
            <thead>
              <tr className="text-slate-600 dark:text-slate-400">
                <th scope="col" className="px-3 py-1 font-bold">לומד</th>
                <th scope="col" className="px-3 py-1 font-bold">מצב</th>
                <th scope="col" className="px-3 py-1 font-bold">המלצת המטריקס</th>
                <th scope="col" className="px-3 py-1 font-bold">{ROUTE_NAME_HE.graded_path}</th>
                <th scope="col" className="px-3 py-1 font-bold">אישור מסלול</th>
                <th scope="col" className="px-3 py-1 font-bold">פרופיל תמיכה מוגבר</th>
                <th scope="col" className="px-3 py-1 font-bold"><span className="sr-only">פעולות</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = updatingId === row.id;
                const label = `תלמיד ${row.studentNumber}`;
                return (
                  <tr key={row.id} data-testid={`class-row-${row.studentNumber}`} className="bg-slate-50 dark:bg-slate-800/40">
                    <th scope="row" className="px-3 py-3 rounded-r-xl font-black text-sm text-slate-900 dark:text-white whitespace-nowrap">
                      {label}
                    </th>

                    <td className="px-3 py-3 whitespace-nowrap">
                      {row.isApproved ? (
                        <span className="inline-flex items-center gap-1 font-extrabold text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/60 px-2.5 py-1 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          מאושר ל{meetingShortLabelHe(3)}
                        </span>
                      ) : row.session2Completed ? (
                        <span className="inline-flex items-center gap-1 font-extrabold text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-900/60 px-2.5 py-1 rounded-lg">
                          ממתין ב{TEACHER_GATE_HE}
                        </span>
                      ) : (
                        <span className="font-bold text-slate-600 bg-slate-200 dark:bg-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-md">
                          טרם השלים את {meetingShortLabelHe(2)}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap font-bold text-slate-800 dark:text-slate-200">
                      {row.recommendedPath ? ROUTE_NAME_HE[row.recommendedPath] : 'טרם נקבעה'}
                    </td>

                    <td className="px-3 py-3">
                      <TeacherSwitch
                        checked={row.gradedTrack}
                        // Once a path is approved, the path decides; the mark only shapes meetings 1–2.
                        disabled={busy || row.isApproved}
                        label={`${ROUTE_NAME_HE.graded_path} — ${label}`}
                        onToggle={() => handleToggleGradedTrack(row)}
                      />
                    </td>

                    <td className="px-3 py-3">
                      <div className="grid grid-cols-2 gap-1.5 min-w-[22rem]">
                        {PATHS.map((path) => (
                          <button
                            key={path}
                            type="button"
                            onClick={() => handleApproveGate(row, path)}
                            disabled={busy || !row.session2Completed}
                            aria-pressed={row.approvedPath === path}
                            aria-label={`${ROUTE_APPROVE_HE[path]} — ${label}`}
                            title={!row.session2Completed ? `אפשר לאשר מסלול רק בסיום ${meetingShortLabelHe(2)}` : undefined}
                            className={`py-1.5 px-2.5 rounded-lg font-extrabold transition-all cursor-pointer active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed ${
                              row.approvedPath === path ? PATH_BUTTON_CLASS[path].on : PATH_BUTTON_CLASS[path].off
                            }`}
                          >
                            {ROUTE_APPROVE_HE[path]}
                          </button>
                        ))}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <TeacherSwitch
                        checked={row.enhancedSupport}
                        disabled={busy}
                        label={`פרופיל תמיכה מוגבר — ${label}`}
                        onToggle={() => handleToggleEnhancedSupport(row)}
                      />
                    </td>

                    <td className="px-3 py-3 rounded-l-xl">
                      <div className="flex items-center gap-1.5 justify-end">
                        {onDrillDown && (
                          <button
                            type="button"
                            onClick={() => onDrillDown(`student_user${row.studentNumber}`)}
                            aria-label={`חלונית הלומד — ${label}`}
                            title="שחזור מהלכים, צ'אט ואיפוס"
                            className="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-lg font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700 cursor-pointer"
                          >
                            <PanelLeftOpen className="w-3.5 h-3.5" />
                            <span>חלונית הלומד</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setStudentToReset({ id: row.id, name: label })}
                          disabled={busy}
                          className="p-2 rounded-lg border border-rose-200 hover:border-rose-400 bg-rose-50 hover:bg-rose-100 text-rose-600 transition-all cursor-pointer active:scale-[0.97]"
                          // The dialog offers both scopes, the meeting alone by default (PRD 23א §ב.2).
                          title={LEARNER_RESET_TOOLTIP_HE}
                          aria-label={`${RESET_ACTION_HE.learner} של ${label}`}
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modules 1 §א and 25 §ב.3: the learners' personal access codes. */}
      <LearnerAccessCodes />

      {/* The radar lives in its own tab only (owner, 30.9.2026): a second copy here doubled its listeners and its reset buttons. */}

      {/* PRD v7.1 Module 23א §ה: level 2+ resets must never be single-click. */}
      <ResetConfirmationModal
        isOpen={studentToReset !== null}
        onClose={() => setStudentToReset(null)}
        resetLevel="single_student"
        targetStudentId={studentToReset?.id}
        targetStudentName={studentToReset?.name}
        activeSessionNumber={activeSessionNumber}
        onConfirm={async (reason, reasonNote, options) => {
          await handleConfirmResetStudent(reason, reasonNote, options);
          setStudentToReset(null);
        }}
      />

    </div>
  );
}
