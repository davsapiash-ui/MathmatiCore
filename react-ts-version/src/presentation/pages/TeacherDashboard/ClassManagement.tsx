import { useState, useEffect } from 'react';
import { Users, CheckCircle2, RotateCcw, PanelLeftOpen, ClipboardList, Info } from 'lucide-react';
import { useStore, type StudentData } from '@/application/useStore';
import { ResetConfirmationModal } from './components/ResetConfirmationModal';
import { LearnerAccessCodes } from './components/LearnerAccessCodes';
import { TeacherApprovalGate, type TeacherApprovalGateProps } from './components/TeacherApprovalGate';
import { ref, onValue, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { normalizeStudentId } from '@/application/useChatStore';
import { useAuthStore } from '@/application/useAuthStore';
import { approveTeacherGate } from '@/core/teacherGate';
import { recommendedPathOf } from '@/core/recommendedPath';
import { hasEnhancedSupport, buildSupportProfilePayload } from '@/core/supportProfile';
import { toast } from 'sonner';
import type { PedagogicalPath, ResetReason, SingleStudentResetScope } from '@/types';
import {
  LEARNER_GROUP_HE,
  LEARNER_RESET_TOOLTIP_HE,
  RECOMMENDED_MARK_HE,
  RESET_ACTION_HE,
  ROUTE_APPROVE_HE,
  ROUTE_NAME_HE,
  TEACHER_GATE_HE,
  asRoutePath,
  routePairFor,
} from '@/core/routeLabels';
import { ROUTE_COLOR } from '@/core/routeColors';
import { meetingShortLabelHe } from '@/core/stationNames';

/** The page's one name, in the sidebar and as its title (owner, 11.10.2026). */
export const CLASS_MANAGEMENT_TITLE_HE = 'ניהול כיתה ומסלולים';

/** When to turn on the enhanced support profile (owner, 11.10.2026), next to the profile column. */
export const SUPPORT_PROFILE_WHEN_HE =
  'מתי כדאי להפעיל את פרופיל התמיכה המוגבר? כשהתלמיד מתקשה לזכור עובדות חיבור עד 20 (לוח החיבור); כשהוא נוטה להקליד תשובה בלי לבצע את ההמרה בלבנים (נעילת המקלדת עד ההמרה); או כשהוא מתבלבל בין הטורים (צבעי הטורים והכותרות). אפשר להפעיל לפני מפגש 1, לבדוק שוב אחרי האבחון, ולשנות בכל תחנה. הפרופיל אינו אוטומטי ואינו תלוי במסלול.';

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

/** A switch the teacher reads at a glance: the state in words and in the knob's place. 44px to touch. */
function TeacherSwitch({ checked, disabled, label, onToggle }: { checked: boolean; disabled?: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="group inline-flex min-h-11 min-w-11 items-center justify-center rounded-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? '-translate-x-5' : '-translate-x-0.5'}`} />
      </span>
    </button>
  );
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1';

/**
 * ניהול כיתה ומסלולים (owner, 11.10.2026): every decision the teacher makes about a learner, in one place.
 *   - At the top, שלב החלוקה למסלולים for the whole class (PRD Module 20): how many wait, approving every
 *     waiting learner's recommendation at once, and the learners who did not finish meeting 2 (Module 14 §ב).
 *   - Then one row per learner (1–12, numbers only), in two sections: the regular programme, and special
 *     education (the graded mark). Each row carries the mark, the matrix recommendation, the learner's own two
 *     levels to approve (the recommended one marked "מומלץ"), the diagnostic evidence, the enhanced support
 *     profile (PRD Module 19, never shown to the learner), the learner's window and the learner reset.
 * There is no quiet visual mode any more: the design is gentle for everyone (owner, 11.10.2026).
 */
export function ClassManagement({
  activeSessionNumber = null,
  onDrillDown,
  gate,
  onOpenGateEvidence,
  onOpenReport,
}: {
  allStudents: StudentData[];
  onDrillDown?: (studentId: string) => void;
  /** The meeting the teacher currently has open (Module 14), for the level-2 reset dialog. */
  activeSessionNumber?: number | null;
  /** שלב החלוקה למסלולים for the whole class (the dashboard owns the evidence and the activation window). */
  gate?: TeacherApprovalGateProps;
  /** Opens the gate drawer with the learner's diagnostic evidence (score, tasks needing support, recommendation). */
  onOpenGateEvidence?: (studentId: string) => void;
  /** Opens the learner's diagnostic report. */
  onOpenReport?: (studentId: string) => void;
}) {
  const [rows, setRows] = useState<StudentRowState[]>(INITIAL_ROWS);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // The section titles stick just under the dashboard's own sticky meeting bar, whatever its height.
  const [stickyTop, setStickyTop] = useState(0);
  useEffect(() => {
    const bar = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-testid="live-session-bar"]') : null;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const measure = () => setStickyTop(Math.round(bar.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

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

  // Module 20: the gate, one of the learner's two levels.
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

  // Two sections (owner, 11.10.2026): the mark decides the section, and with it the learner's pair of levels.
  const sections = [
    { key: 'regular', title: LEARNER_GROUP_HE.regular, rows: rows.filter((r) => !r.gradedTrack) },
    { key: 'graded', title: LEARNER_GROUP_HE.graded, rows: rows.filter((r) => r.gradedTrack) },
  ] as const;

  const renderRow = (row: StudentRowState) => {
    const busy = updatingId === row.id;
    const label = `תלמיד ${row.studentNumber}`;
    // The learner's own two levels; the other two are not offered (owner, 11.10.2026).
    const PATHS = routePairFor(row.gradedTrack);
    const levelColour = row.approvedPath ? ROUTE_COLOR[row.approvedPath] : null;
    return (
      <tr key={row.id} data-testid={`class-row-${row.studentNumber}`} className="bg-slate-50 dark:bg-slate-800/40 align-middle">
        <th scope="row" className="relative px-3 py-1 rounded-r-xl font-black text-sm text-slate-900 dark:text-white">
          {/* The approved level as a thin stripe on the row's edge; its name is on the pressed button. */}
          {levelColour && <span aria-hidden="true" data-testid={`class-row-stripe-${row.studentNumber}`} className={`absolute inset-y-1 right-0 w-1 rounded-full ${levelColour.stripe}`} />}
          {/* The learner and the state in one cell (one row per learner, owner 11.10.2026); the stage keeps its name (PRD Module 20). */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {onOpenReport ? (
              <button
                type="button"
                onClick={() => onOpenReport(`student_user${row.studentNumber}`)}
                title="פתיחת דוח האבחון של התלמיד"
                className={`min-h-11 whitespace-nowrap font-black underline decoration-dotted underline-offset-4 hover:text-violet-700 dark:hover:text-violet-300 cursor-pointer rounded ${FOCUS_RING}`}
              >
                {label}
              </button>
            ) : (
              <span className="whitespace-nowrap">{label}</span>
            )}
            <span data-testid={`class-row-state-${row.studentNumber}`} className="text-xs leading-tight">
              {row.isApproved ? (
                <span title={`מאושר ל${meetingShortLabelHe(3)}`} className="inline-flex items-center gap-1 font-extrabold text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/60 px-2 py-0.5 rounded-lg whitespace-nowrap">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  המסלול אושר
                </span>
              ) : row.session2Completed ? (
                <span className="inline-block font-extrabold text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-900/60 px-2 py-0.5 rounded-lg">
                  ממתין ב{TEACHER_GATE_HE}
                </span>
              ) : (
                <span title={`טרם השלים את ${meetingShortLabelHe(2)}`} className="inline-block font-bold text-slate-600 bg-slate-200 dark:bg-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-md">
                  טרם השלים את האבחון
                </span>
              )}
            </span>
          </div>
        </th>

        {/* The matrix recommendation; once meeting 2 is done it also opens the diagnostic evidence (the gate drawer). */}
        <td className="px-2 py-1.5 w-24 font-bold text-slate-800 dark:text-slate-200 leading-tight">
          {onOpenGateEvidence && row.session2Completed ? (
            <button
              type="button"
              onClick={() => onOpenGateEvidence(`student_user${row.studentNumber}`)}
              aria-label={`ראיות האבחון — ${label}`}
              title="ראיות האבחון: המלצת המטריקס, ציון האבחון ומוקדי החיזוק"
              className={`min-h-11 inline-flex items-center gap-1 text-right font-bold underline decoration-dotted underline-offset-4 hover:text-violet-700 dark:hover:text-violet-300 cursor-pointer rounded ${FOCUS_RING}`}
            >
              <ClipboardList className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{row.recommendedPath ? ROUTE_NAME_HE[row.recommendedPath] : 'טרם נקבעה'}</span>
            </button>
          ) : (
            row.recommendedPath ? ROUTE_NAME_HE[row.recommendedPath] : 'טרם נקבעה'
          )}
        </td>

        <td className="px-1 py-1">
          <TeacherSwitch
            checked={row.gradedTrack}
            // Once a path is approved, the path decides; the mark only shapes meetings 1–2.
            disabled={busy || row.isApproved}
            label={`${ROUTE_NAME_HE.graded_path} — ${label}`}
            onToggle={() => handleToggleGradedTrack(row)}
          />
        </td>

        <td className="px-2 py-1.5">
          <div className="flex flex-wrap gap-1.5" data-testid={`class-row-approve-${row.studentNumber}`}>
            {PATHS.map((path) => {
              const recommended = row.recommendedPath === path;
              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => handleApproveGate(row, path)}
                  disabled={busy || !row.session2Completed}
                  aria-pressed={row.approvedPath === path}
                  aria-label={`${ROUTE_APPROVE_HE[path]}${recommended ? ` (${RECOMMENDED_MARK_HE})` : ''} — ${label}`}
                  title={!row.session2Completed ? `אפשר לאשר מסלול רק בסיום ${meetingShortLabelHe(2)}` : ROUTE_APPROVE_HE[path]}
                  className={`min-h-11 inline-flex items-center gap-1 py-1 px-2 rounded-lg text-[11px] font-extrabold whitespace-nowrap transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING} ${
                    row.approvedPath === path ? ROUTE_COLOR[path].buttonOn : ROUTE_COLOR[path].buttonOff
                  }`}
                >
                  {row.approvedPath === path && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                  <span>{ROUTE_APPROVE_HE[path]}</span>
                  {recommended && (
                    <span data-testid="recommended-mark" className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white/80 text-slate-800 border border-slate-300">
                      {RECOMMENDED_MARK_HE}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </td>

        <td className="px-1 py-1">
          <TeacherSwitch
            checked={row.enhancedSupport}
            disabled={busy}
            label={`פרופיל תמיכה מוגבר — ${label}`}
            onToggle={() => handleToggleEnhancedSupport(row)}
          />
        </td>

        <td className="px-2 py-1.5 rounded-l-xl">
          <div className="flex items-center gap-1.5 justify-end">
            {onDrillDown && (
              <button
                type="button"
                onClick={() => onDrillDown(`student_user${row.studentNumber}`)}
                aria-label={`חלונית הלומד — ${label}`}
                title="שחזור מהלכים, צ'אט ואיפוס"
                className={`min-h-11 inline-flex items-center gap-1 py-1 px-2.5 rounded-lg font-bold whitespace-nowrap bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700 cursor-pointer ${FOCUS_RING}`}
              >
                <PanelLeftOpen className="w-3.5 h-3.5" aria-hidden="true" />
                {/* Named as in doc 04; on a narrower screen the icon carries it, with the same name to a screen reader. */}
                <span className="hidden 2xl:inline">חלונית הלומד</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setStudentToReset({ id: row.id, name: label })}
              disabled={busy}
              className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-rose-200 hover:border-rose-400 bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer ${FOCUS_RING}`}
              // The dialog offers both scopes, the meeting alone by default (PRD 23א §ב.2).
              title={LEARNER_RESET_TOOLTIP_HE}
              aria-label={`${RESET_ACTION_HE.learner} של ${label}`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="max-w-7xl mx-auto w-full flex flex-col gap-3" dir="rtl">

      {/* One title line and one sentence (owner, 11.10.2026: less scrolling). */}
      <header>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-violet-700 dark:text-violet-200" aria-hidden="true" />
          {CLASS_MANAGEMENT_TITLE_HE}
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">
          שורה אחת לכל לומד: המסלול, פרופיל התמיכה המוגבר, חלונית הלומד ואיפוס. כל שינוי נשמר מיד, והלומד אינו רואה על המסך שום סימון.
        </p>
      </header>

      {/* PRD Module 20: the stage, for the whole class. */}
      {gate && <TeacherApprovalGate {...gate} />}

      {/* One row per learner, in two sections. */}
      <section aria-label="התאמות לכל לומד" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 md:p-3">
        {/* One short line per concept: the pair of levels (the stage is above, the profile has its own help). */}
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
          לכל תלמיד שתי רמות. בתוכנית הרגילה: {ROUTE_NAME_HE.green_path} או {ROUTE_NAME_HE.remediation_path}. לתלמיד שסומן ל{ROUTE_NAME_HE.graded_path.replace(/^ה/, '')} לפני {meetingShortLabelHe(1)}: {ROUTE_NAME_HE.graded_path} או {ROUTE_NAME_HE.graded_foundation_path}.
        </p>

        {/* No horizontal page scroll: on a narrow tablet the table scrolls inside its own card (from 1024px it fits, and the section titles stay sticky). */}
        <div className="max-lg:overflow-x-auto max-lg:[contain:paint]">
        <table className="w-full text-right text-xs border-separate border-spacing-y-1">
          <thead>
            <tr className="text-slate-600 dark:text-slate-400 whitespace-nowrap align-bottom">
              <th scope="col" className="px-3 py-1 font-bold">לומד ומצב</th>
              <th scope="col" className="px-2 py-1 font-bold whitespace-normal">המלצת המטריקס</th>
              <th scope="col" className="px-1 py-1 font-bold whitespace-normal w-16">{ROUTE_NAME_HE.graded_path}</th>
              <th scope="col" className="px-2 py-1 font-bold">אישור מסלול</th>
              <th scope="col" className="relative px-1 py-1 font-bold whitespace-normal w-16">
                <span className="flex flex-col items-start">
                  פרופיל תמיכה מוגבר
                  {/* When to turn it on (owner, 11.10.2026): a small disclosure, never a modal. */}
                  <details data-testid="support-profile-help" className="inline-block font-normal">
                    <summary
                      aria-label="מתי כדאי להפעיל את פרופיל התמיכה המוגבר?"
                      title="מתי כדאי להפעיל?"
                      className={`list-none inline-flex items-center justify-center min-h-11 min-w-11 cursor-pointer text-violet-700 dark:text-violet-300 rounded-full ${FOCUS_RING}`}
                    >
                      <Info className="w-4 h-4" aria-hidden="true" />
                    </summary>
                    <p className="absolute z-20 top-full left-0 w-80 max-w-[80vw] text-right text-xs leading-relaxed text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-800 rounded-xl px-3 py-2 shadow-lg">
                      {SUPPORT_PROFILE_WHEN_HE}
                    </p>
                  </details>
                </span>
              </th>
              <th scope="col" className="px-2 py-1 font-bold"><span className="sr-only">פעולות</span></th>
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.key} data-testid={`class-section-${section.key}`}>
              <tr>
                {/* Sticky inside the page's own scroll: the section's name stays in view over its rows. */}
                <th
                  scope="colgroup"
                  colSpan={6}
                  style={{ top: stickyTop }}
                  className="sticky z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-2 pt-3 pb-1 text-right text-sm font-black text-slate-900 dark:text-white"
                >
                  {section.title} ({section.rows.length})
                </th>
              </tr>
              {section.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-slate-500 dark:text-slate-400">אין תלמידים בקבוצה זו.</td>
                </tr>
              ) : (
                section.rows.map(renderRow)
              )}
            </tbody>
          ))}
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
