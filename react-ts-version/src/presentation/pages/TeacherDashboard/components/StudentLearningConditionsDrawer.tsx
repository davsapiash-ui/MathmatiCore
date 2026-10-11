import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import { type StudentData, useStore } from '@/application/useStore';
import { READ_ONLY_TITLE, useIsReadOnlyStaff } from '@/application/useIsReadOnlyStaff';
import {
  X,
  Sliders,
  Video,
  MessageCircle, 
  RotateCcw, 
  Check, 
  BellRing, 
  ExternalLink
} from 'lucide-react';
import { ResetConfirmationModal } from './ResetConfirmationModal';
import { MediationLogSection } from './MediationLogSection';
import { LEARNER_RESET_TOOLTIP_HE, RESET_ACTION_HE } from '@/core/routeLabels';
import { clearHelpRequest } from '@/infrastructure/services/HelpRequestService';
import { toast } from 'sonner';
import type { ResetReason, SingleStudentResetScope } from '@/types';

interface Props {
  student: StudentData | null;
  onClose: () => void;
  onOpenChat?: (student: StudentData) => void;
  onOpenFullJourney?: (studentId: string) => void;
  /** The meeting the teacher currently has open (Module 14), for the level-2 reset dialog. */
  activeSessionNumber?: number | null;
}

/**
 * "חלונית הלומד" — the teacher's window for one learner: reset, chat, clearing a
 * help request, and the way into the full journey and replay.
 *
 * It used to be "התאמת תנאי למידה", with a per-learner quiet visual mode
 * (isASD). The owner removed that mode on 11.10.2026: the design is a gentle
 * UDL design for everyone, and only the device's reduced-motion setting turns
 * motion off. Nothing here writes isASD any more.
 */
export function StudentLearningConditionsDrawer({ student, onClose, onOpenChat, onOpenFullJourney, activeSessionNumber = null }: Props) {
  const [isResetting, setIsResetting] = useState(false);
  const [isClearingHelp, setIsClearingHelp] = useState(false);
  const isClearingHelpRef = useRef(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const readOnly = useIsReadOnlyStaff();

  const sAny = (student || {}) as any;

  // מסמך העיצוב §1.2: Escape סוגר, הפוקוס נלכד בתוך המגירה, ובסגירה חוזר
  // לאלמנט שממנו היא נפתחה.
  const drawerRef = useDismissableOverlay<HTMLDivElement>(Boolean(student), onClose);

  if (!student) return null;

  const hasHelpRequest = sAny.helpRequested || sAny.handRaised || sAny.isStruggling;
  const studentNum = student.studentId.replace(/\D/g, '') || student.studentId;

  const handleConfirmResetStudent = async (
    reason: ResetReason,
    reasonNote?: string,
    options?: { scope: SingleStudentResetScope; sessionNumber: number | null }
  ) => {
    setIsResetting(true);
    try {
      // The store toasts its own success/failure once.
      await useStore.getState().resetStudentData(student.studentId, reason, reasonNote, options);
      setIsResetModalOpen(false);
      onClose();
    } catch (err) {
      console.error('Reset error:', err);
      throw err; // keep the confirmation dialog open — nothing was reset
    } finally {
      setIsResetting(false);
    }
  };

  const handleClearHelpRequest = async () => {
    if (!student.studentId || isClearingHelp || isClearingHelpRef.current) return;
    isClearingHelpRef.current = true;
    setIsClearingHelp(true);
    try {
      // The same write the side action queue makes (HelpRequestService).
      await clearHelpRequest(student.studentId);
      toast.success('בקשת העזרה סומנה כטופלה');
    } catch (err) {
      console.error('Failed to clear help request:', err);
      toast.error('סימון הטיפול נדחה בשרת. נסו שוב.');
    } finally {
      setIsClearingHelp(false);
      isClearingHelpRef.current = false;
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[9998] transition-opacity animate-in fade-in"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`חלונית הלומד — תלמיד ${studentNum}`}
        className="fixed top-0 right-0 w-full sm:w-[580px] h-[100dvh] bg-white dark:bg-slate-900 shadow-2xl z-[9999] flex flex-col transform transition-transform duration-300 border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right"
        dir="rtl"
      >
        {/* Mobile handle */}
        <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden shrink-0" />
        
        {/* Header */}
        <div className="h-20 px-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-50 dark:bg-violet-950/60 border border-violet-100 dark:border-violet-800 flex items-center justify-center text-violet-600 dark:text-violet-400 font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  חלונית הלומד — תלמיד {studentNum}
                </h2>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                שחזור מהלכים, צ'אט ואיפוס
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsResetModalOpen(true)}
              disabled={readOnly || isResetting}
              className="px-2.5 py-1.5 rounded-xl border border-stone-300 hover:border-stone-400 bg-stone-50/70 hover:bg-stone-100 text-stone-800 dark:bg-stone-900/40 dark:text-stone-200 dark:border-stone-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
              // The dialog offers both scopes, the meeting alone by default (PRD 23א §ב.2).
              title={readOnly ? READ_ONLY_TITLE : LEARNER_RESET_TOOLTIP_HE}
              aria-label={`${RESET_ACTION_HE.learner} של תלמיד ${studentNum}`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{RESET_ACTION_HE.learner}</span>
            </button>

            {onOpenChat && (
              <button 
                onClick={() => onOpenChat(student)}
                className="p-2 hover:bg-violet-50 dark:hover:bg-slate-800 rounded-xl transition-colors text-violet-600 dark:text-violet-400 cursor-pointer"
                title="צ'אט ישיר עם התלמיד"
              >
                <MessageCircle className="w-5 h-5" />
              </button>
            )}

            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-600 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              title="סגרו את החלון"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alert Banner for Help Requests */}
        {hasHelpRequest && (
          <div className="px-6 py-3 bg-stone-50 dark:bg-stone-950/40 border-b border-stone-200 dark:border-stone-900 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-bold text-stone-900 dark:text-stone-200">
              <BellRing className="w-4 h-4 text-stone-600" />
              {/* No count: nothing in the system writes one, so it always read "0 קריאות תועדו". */}
              <span>התלמיד ביקש עזרה</span>
            </div>
            <button
              onClick={handleClearHelpRequest}
              disabled={readOnly || isClearingHelp}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className="px-3 py-1.5 rounded-xl bg-stone-600 hover:bg-stone-700 disabled:bg-stone-400 disabled:cursor-not-allowed text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
            >
              {isClearingHelp ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>{isClearingHelp ? 'מעדכן...' : 'סמנו כטופל'}</span>
            </button>
          </div>
        )}

        {/* Body: one panel, so no tabs. */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Measure 5 (PRD module 18): "בחלונית הלומד מתעדים כל אירוע לחוד" —
              the same "תיעוד התיווך" section as in the radar tile's detail. */}
          <MediationLogSection studentNumber={Number(studentNum)} readOnly={readOnly} />

          {/* A per-learner "hesitation threshold" tab stood here, offering 15 /
              30 / 60 seconds. The learner never saw any of it: the radar hook
              and the dashboard's radar colouring both read the single
              admin-calibrated value from Module 26
              (getHesitationThresholdSeconds), so the choice was written to the
              student record and then ignored by everything that matters. The
              spec has no per-learner threshold either — Module 10 fixes the
              stages at 30s and 45s, and Module 26 owns the one calibratable
              value, for the whole cohort. Calibration lives in the admin
              catalog screen. */}
          {/* Replay & traces */}
          <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 text-center space-y-4 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 flex items-center justify-center mx-auto text-2xl shadow-inner">
                  <Video className="w-7 h-7 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    מסע הלמידה ושחזור מהלכים — תלמיד {studentNum}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                    התצוגה המלאה כוללת שחזור ויזואלי של מסך התלמיד, ציר החלטות מפורט ודוחות למידה לכל שמונת המפגשים בתצוגת מסך מפוצל.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenFullJourney) {
                        onOpenFullJourney(student.studentId);
                      } else {
                        onClose();
                      }
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold text-xs shadow-md shadow-violet-600/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>מעבר למסע לומד ושחזור מלא</span>
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* PRD v7.1 Module 23א §ה: level 2+ resets must never be single-click. */}
      <ResetConfirmationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        resetLevel="single_student"
        targetStudentId={student.studentId}
        targetStudentName={`תלמיד ${studentNum}`}
        activeSessionNumber={activeSessionNumber}
        onConfirm={handleConfirmResetStudent}
      />
    </>,
    document.body
  );
}
