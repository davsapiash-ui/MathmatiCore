import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore, getActiveTasks, placeToColumnIndex } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { HelpCircle, Clock, X, CheckCircle2, AlertCircle } from 'lucide-react';
import type { SocraticChoice } from '@/infrastructure/services/SocraticEngine';
import { emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';

interface SocraticDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
}

/**
 * SocraticDrawer (Modules 12–13: Socratic Dialogue Non-Modal Side Drawer)
 * Non-blocking: Canvas manipulations, undo, and keyboard remain 100% active while drawer is open.
 * The ONLY lockout is on the card choices for 30s upon picking an incorrect distractor.
 */
export function SocraticDrawer({ isOpen, onClose }: SocraticDrawerProps) {
  const helpState = useWorkspaceStore((s) => s.helpState);
  const closeHelp = useWorkspaceStore((s) => s.closeHelp);
  const aiSocraticHint = useWorkspaceStore((s) => s.aiSocraticHint);
  const isSocraticCardLocked = useWorkspaceStore((s) => s.isSocraticCardLocked);
  const socraticDistractorHint = useWorkspaceStore((s) => s.socraticDistractorHint);
  const triggerSocraticPenaltyLockout = useWorkspaceStore((s) => s.triggerSocraticPenaltyLockout);
  const getSocraticPenaltyRemaining = useWorkspaceStore((s) => s.getSocraticPenaltyRemaining);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ isCorrect: boolean; text: string } | null>(null);
  const hasEmittedShowRef = useRef(false);

  const isDrawerOpen = isOpen !== undefined ? isOpen : (helpState === 'socratic' || helpState === 'friction');

  useEffect(() => {
    if (isDrawerOpen && !hasEmittedShowRef.current) {
      hasEmittedShowRef.current = true;
      const wsState = useWorkspaceStore.getState();
      const studentId = useAuthStore.getState().user?.uid || 'student_1';
      const currentTask = getActiveTasks(wsState)[wsState.standardTaskIdx] || null;
      const colIdx = wsState.focusedPlace ? placeToColumnIndex(wsState.focusedPlace) : 0;
      
      const triggerReason: 'hesitation_45s' | 'consecutive_errors_4' | 'consecutive_undos_3' = 
        wsState.consecutiveErrorCount >= 4 
          ? 'consecutive_errors_4' 
          : wsState.undoCount >= 3 
          ? 'consecutive_undos_3' 
          : 'hesitation_45s';

      const errorCat = wsState.aiSocraticHint?.error_category ?? null;

      emitTelemetry({
        session_id: `session_${wsState.sessionNumber}_student_${studentId}`,
        student_id: studentId,
        exercise_id: currentTask?.id || `ex_${wsState.sessionNumber}_01`,
        event_type: 'SOCRATIC_CARD_SHOWN',
        column_index: colIdx,
        details: {
          trigger_reason: triggerReason,
          error_category: errorCat,
        },
      }).catch(console.error);
    } else if (!isDrawerOpen) {
      hasEmittedShowRef.current = false;
    }
  }, [isDrawerOpen]);

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = getSocraticPenaltyRemaining();
      setRemainingSeconds(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [getSocraticPenaltyRemaining, isSocraticCardLocked]);

  const handleClose = () => {
    setSelectedChoiceId(null);
    setFeedbackMsg(null);
    if (onClose) onClose();
    else closeHelp();
  };

  const handleSelectChoice = (choice: SocraticChoice) => {
    if (isSocraticCardLocked || remainingSeconds > 0) return;
    setSelectedChoiceId(choice.id);

    const isCorrect = choice.isCorrect !== undefined 
      ? choice.isCorrect 
      : (choice.id === aiSocraticHint?.correctChoiceId);

    const wsState = useWorkspaceStore.getState();
    const studentId = useAuthStore.getState().user?.uid || 'student_1';
    const currentTask = getActiveTasks(wsState)[wsState.standardTaskIdx] || null;
    const optionKey = (choice.id === 'opt_2' ? 'opt_2' : choice.id === 'opt_3' ? 'opt_3' : 'opt_1') as 'opt_1' | 'opt_2' | 'opt_3';

    emitTelemetry({
      session_id: `session_${wsState.sessionNumber}_student_${studentId}`,
      student_id: studentId,
      exercise_id: currentTask?.id || `ex_${wsState.sessionNumber}_01`,
      event_type: 'SOCRATIC_OPTION_SELECTED',
      details: {
        option_id: optionKey,
        is_correct: Boolean(isCorrect),
      },
    }).catch(console.error);

    if (isCorrect) {
      setFeedbackMsg({
        isCorrect: true,
        text: choice.feedbackHe || 'מצוין! זו בדיוק הדרך. בואו ננסה זאת עכשיו בבית המספרים!',
      });
      setTimeout(() => {
        handleClose();
      }, 2500);
    } else {
      const feedbackText = choice.feedbackHe || 'בחירה זו אינה מתאימה. קחו רגע קצר לחשוב על בית המספרים, ותוכלו לנסות שוב בעוד מספר שניות.';
      setFeedbackMsg({
        isCorrect: false,
        text: feedbackText,
      });
      triggerSocraticPenaltyLockout(choice.feedbackHe || 'בחירה שגויה בכרטיס סוקרטי — השהיית חשיבה למשך 30 שניות');
    }
  };

  const hint = aiSocraticHint || {
    questionHe: 'מה הפעולה המתמטית שנרצה לבצע בבית המספרים?',
    choices: [
      { id: 'opt_1', textHe: 'לבדוק את מספר הבלוקים בכל טור בבית המספרים ולחשב מחדש' },
      { id: 'opt_2', textHe: 'לפרוט עשרת אחת ל-10 יחידות' },
      { id: 'opt_3', textHe: 'לקבץ 10 יחידות לעשרת אחת' },
    ],
    correctChoiceId: 'opt_1',
  };

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <div 
          className="fixed top-0 right-0 bottom-0 z-40 pointer-events-none flex justify-end" 
          dir="rtl"
        >
          {/* Non-modal side sliding drawer (No blocking backdrop) */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="pointer-events-auto w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl border-l-2 border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between select-none"
            role="dialog"
            aria-label="חניכה סוקרטית"
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-display font-black text-xl text-slate-900 dark:text-white">
                      חניכה אישית
                    </h2>
                    <p className="text-xs text-slate-400 font-medium">רמז מחשבתי מנחה</p>
                  </div>
                </div>

                <button
                  onClick={handleClose}
                  className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
                  aria-label="סגור חלונית"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Serene 30s Reflection & Exploration Notice */}
              {(isSocraticCardLocked || remainingSeconds > 0) && (
                <div className="mt-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 flex items-center gap-3">
                  <Clock className="w-6 h-6 shrink-0 text-amber-600 animate-spin" />
                  <div>
                    <p className="font-extrabold text-sm">רגע לחשיבה: הכרטיס יתחדש בעוד {remainingSeconds} שניות</p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                      {socraticDistractorHint || 'קחו רגע לחקור את הלבנים בלוח ולחשוב על הצעד הבא.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Question */}
              <div className="mt-6">
                <h3 className="font-display font-extrabold text-lg text-slate-800 dark:text-slate-100 leading-relaxed">
                  {hint.questionHe}
                </h3>
              </div>

              {/* Distractor Choices (Disabled ONLY during 60s lockout) */}
              <div className="mt-6 flex flex-col gap-3">
                {hint.choices.map((choice) => {
                  const isSelected = selectedChoiceId === choice.id;
                  const isLocked = isSocraticCardLocked || remainingSeconds > 0;

                  return (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleSelectChoice(choice)}
                      className={`w-full p-4 text-right rounded-2xl border-2 transition-all font-bold text-sm flex items-start gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                      } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.99]'}`}
                    >
                      <span className="w-6 h-6 rounded-full border border-current shrink-0 flex items-center justify-center text-xs mt-0.5">
                        {choice.id.replace('opt_', '')}
                      </span>
                      <span className="flex-1">{choice.textHe}</span>
                    </button>
                  );
                })}
              </div>

              {/* Feedback Alert */}
              {feedbackMsg && (
                <div
                  className={`mt-6 p-4 rounded-2xl border flex items-center gap-3 ${
                    feedbackMsg.isCorrect
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-200'
                      : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-800 dark:text-amber-200'
                  }`}
                >
                  {feedbackMsg.isCorrect ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                  )}
                  <p className="text-xs font-extrabold">{feedbackMsg.text}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400 font-medium">
              פלטפורמת MathmatiCore — חניכה סוקרטית תומכת למידה (מרחב העבודה נשאר פעיל)
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default SocraticDrawer;
