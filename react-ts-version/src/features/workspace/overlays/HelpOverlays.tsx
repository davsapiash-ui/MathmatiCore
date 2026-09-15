import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspaceStore, getActiveTasks, placeToColumnIndex } from '@/application/useWorkspaceStore';
import { useAuthStore, currentStudentUid } from '@/application/useAuthStore';
import { SUPPORT_CONTENT, getDynamicSocraticHint } from '@/data/sessionTasks';
import type { SocraticChoice } from '@/infrastructure/services/SocraticEngine';
import { emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

/**
 * PRD Module 12: the only in-task help is the Socratic coaching card —
 * a non-blocking side card with one guiding question and three closed options.
 * It opens on Module 12's triggers and after a mistake (a 300ms "let's think"
 * beat, then the card). Nothing else pops up.
 *
 * A "which help would you like?" palette with a thinking hint and a worked
 * example used to live here. No button ever opened it, so no learner ever saw
 * it; the owner had it deleted (14.9.2026) rather than wired up — the PRD has
 * no such palette, and a worked example is what document 03 §1.3 ד calls a
 * "פתרון מוכן".
 */

export function HelpOverlays() {
  const helpState = useWorkspaceStore((s) => s.helpState);
  const helpFrictionDone = useWorkspaceStore((s) => s.helpFrictionDone);
  const closeHelp = useWorkspaceStore((s) => s.closeHelp);

  // Fast, smooth transition (300ms) for snappy help response without lag.
  useEffect(() => {
    if (helpState !== 'friction') return;
    const t = window.setTimeout(helpFrictionDone, 300);
    return () => window.clearTimeout(t);
  }, [helpState, helpFrictionDone]);

  const aiSocraticHint = useWorkspaceStore((s) => s.aiSocraticHint);

  // PRD Appendix A §3: SOCRATIC_CARD_SHOWN is emitted once per opening of the
  // card, from the component that actually renders it. It used to live in a
  // drawer nothing mounted, so the radar, the session report and the AI
  // analysis all counted zero cards. Emission waits for the first hint so the
  // error_category (Module 18 distribution) is real, not always null.
  const cardShownRef = useRef(false);
  useEffect(() => {
    if (helpState !== 'socratic') {
      cardShownRef.current = false;
      return;
    }
    if (cardShownRef.current || !aiSocraticHint) return;
    cardShownRef.current = true;

    const ws = useWorkspaceStore.getState();
    const studentId = currentStudentUid();
    const task = getActiveTasks(ws)[ws.standardTaskIdx] || null;
    // The store records the trigger for the Module 12 paths. A card opened by
    // the after-mistake beat has no Module 12 trigger of its own and is
    // labelled by the error streak that opened it.
    const triggerReason =
      ws.socraticTriggerReason ??
      (ws.sessionNumber === 8 && (ws.consecutiveUndoCount ?? 0) >= 3
        ? 'consecutive_undos_3'
        : 'consecutive_errors_4');

    emitTelemetry({
      session_id: `session_${ws.sessionNumber}_student_${studentId}`,
      student_id: studentId,
      exercise_id: task?.id || `ex_${ws.sessionNumber}_01`,
      event_type: 'SOCRATIC_CARD_SHOWN',
      column_index: ws.focusedPlace ? placeToColumnIndex(ws.focusedPlace) : (ws.activeColumnIndex || 0),
      details: {
        trigger_reason: triggerReason,
        error_category: aiSocraticHint.error_category ?? null,
      },
    }).catch(console.error);
  }, [helpState, aiSocraticHint]);

  // Strict fallback: when the AI hint is not available the card shows the
  // static Socratic content, with the line adapted to the task's target node.
  let content = helpState === 'socratic' && !aiSocraticHint ? { ...SUPPORT_CONTENT.socratic } : null;
  if (content) {
    const s = useWorkspaceStore.getState();
    const task = getActiveTasks(s)[s.standardTaskIdx];
    if (task?.targetNode) {
      content.lines = [getDynamicSocraticHint(task.targetNode, s.counts, task, s.answerDigits, s.carryDigits)];
    }
  }

  return (
    <>
      {/* 3s friction overlay */}
      <AnimatePresence>
        {helpState === 'friction' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            /* Every overlay here releases the pointer the instant it starts
               leaving: a fading element is invisible long before AnimatePresence
               unmounts it, and with pointer events still on it kept swallowing
               the learner's drags onto the number house. */
            exit={{ opacity: 0, pointerEvents: 'none' }}
            className="fixed inset-0 z-50 bg-ws-ink/50 backdrop-blur-sm flex flex-col items-center justify-center gap-4"
            role="status"
            aria-live="polite"
          >
            <motion.span
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-6xl"
              aria-hidden="true"
            >
              🤔
            </motion.span>
            <p className="font-display font-extrabold text-2xl text-white">בואו נחשוב רגע יחד…</p>
            <p className="text-white/80 font-medium">מכין רמז מותאם אישית...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Socratic content card: non-intrusive floating card (NO blocking backdrop per PRD Modules 10 & 12) */}
      <AnimatePresence>
        {helpState === 'socratic' && (
          <motion.div
            key="socratic-overlay-wrapper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, pointerEvents: 'none' }}
            className="fixed inset-0 z-40 pointer-events-none flex items-start justify-center pt-16 sm:pt-20 px-4"
            dir="rtl"
            data-testid="socratic-overlay-wrapper"
          >
            <motion.aside
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95, pointerEvents: 'none' }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              /* Floats cleanly docked near top-center / above board columns so active
                 place-value columns and the bottom block palette remain 100% visible and unblocked.
                 Outer wrapper has pointer-events-none; only this card has pointer-events-auto. */
              className="pointer-events-auto max-w-sm sm:max-w-md w-[92vw] sm:w-[440px] bg-ws-surface rounded-3xl shadow-2xl border-2 border-indigo-200 dark:border-indigo-800/80 p-6 max-h-[calc(100dvh-6rem)] overflow-y-auto"
              role="region"
              aria-label="חונך דיגיטלי סוקרטי"
              data-testid="socratic-card"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden="true">💡</span>
                  <h2 className="font-display font-black text-lg sm:text-xl text-ws-ink leading-tight">
                    {aiSocraticHint?.questionHe || content?.titleHe || 'שאלה מנחה לחשיבה'}
                  </h2>
                  <UdlSpeechButton
                    text={[
                      aiSocraticHint?.questionHe || content?.titleHe || 'שאלה מנחה לחשיבה',
                      ...(!aiSocraticHint ? content?.lines ?? [] : []),
                    ].join('. ')}
                    className="shrink-0"
                  />
                </div>
                <button
                  onClick={closeHelp}
                  aria-label="סגור חלונית עזרה"
                  className="w-11 h-11 rounded-full bg-ws-surface2 hover:bg-ws-surface2/80 text-ws-soft font-bold flex items-center justify-center text-sm transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>

              {content && (
                /* Visual 10 ↔ ten-units equivalence (vanilla socratic graphic) */
                <div className="flex items-center justify-center gap-4 mb-4 bg-ws-surface2/50 rounded-2xl p-3" dir="ltr" aria-hidden="true">
                  <div className="w-[80px] h-[10px] rounded-[2px]" style={{ backgroundColor: 'var(--block-ten)' }} />
                  <span className="font-black text-xl text-ws-soft">=</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <span key={i} className="w-2.5 h-2.5 rounded-[1px] inline-block" style={{ backgroundColor: 'var(--block-unit)' }} />
                    ))}
                  </div>
                </div>
              )}

              {content?.lines && content.lines.length > 0 && !aiSocraticHint && (
                <ul className="flex flex-col gap-2 mb-3">
                  {content.lines.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-base text-ws-ink leading-relaxed font-semibold">
                      <span className="text-ws-accent font-black shrink-0 mt-0.5" aria-hidden="true">•</span>
                      {line}
                    </li>
                  ))}
                </ul>
              )}

              {/* 3 Closed Dynamic Options for Socratic Mentoring */}
              <SocraticPenaltyLockOptions onClose={closeHelp} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SocraticPenaltyLockOptions({ onClose }: { onClose: () => void }) {
  const aiSocraticHint = useWorkspaceStore((s) => s.aiSocraticHint);
  const socraticPenaltyLockoutUntil = useWorkspaceStore((s) => s.socraticPenaltyLockoutUntil);
  const triggerSocraticPenaltyLockout = useWorkspaceStore((s) => s.triggerSocraticPenaltyLockout);
  const getSocraticPenaltyRemaining = useWorkspaceStore((s) => s.getSocraticPenaltyRemaining);

  const [lockSeconds, setLockSeconds] = useState(() => getSocraticPenaltyRemaining());
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [feedbackHint, setFeedbackHint] = useState<string | null>(null);

  useEffect(() => {
    const updateTimer = () => {
      const remaining = getSocraticPenaltyRemaining();
      setLockSeconds(remaining);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [socraticPenaltyLockoutUntil, getSocraticPenaltyRemaining]);

  const wsState = useWorkspaceStore.getState();
  const currentTask = getActiveTasks(wsState)[wsState.standardTaskIdx] || null;
  const isSubtraction = Boolean(currentTask?.isSubtraction || (typeof (currentTask as any)?.exercise === 'string' && (currentTask as any).exercise.includes('-')));

  const defaultChoices: SocraticChoice[] = isSubtraction
    ? [
        { id: 'A', textHe: 'נפרוט בלוק מהטור הגבוה השכן (מאה לעשרות / עשרת ליחידות) כדי שנוכל לחסר.', isCorrect: true, feedbackHe: 'תשובה נכונה! לחצו על הבלוק בבית המספרים כדי לפרוט אותו.' },
        { id: 'B', textHe: 'נחסר את המספר הקטן מהגדול גם אם הוא למטה, ללא פריטה.', isCorrect: false, feedbackHe: 'רמז: בחיסור חובה לחסר את המספר התחתון מהעליון. אם חסר — יש לפרוט!' },
        { id: 'C', textHe: 'נוסיף בלוקים חדשים מהמחסן אל המספר הראשון.', isCorrect: false, feedbackHe: 'רמז: בחיסור בונים רק את המספר הראשון ומוציאים מתוכו בלוקים לפח.' },
      ]
    : (currentTask?.id === 's1_t8' || (currentTask?.numberA && currentTask?.numberB && Math.floor((currentTask.numberA % 100) / 10) + Math.floor((currentTask.numberB % 100) / 10) >= 10))
    ? [
        { id: 'A', textHe: 'נקבץ 10 עשרות לטור המאות (מאה אחת) ונשאיר את שאר העשרות בטור העשרות.', isCorrect: true, feedbackHe: 'תשובה נכונה! קבצו 10 עשרות למאה אחת בטור המאות.' },
        { id: 'B', textHe: 'נמחק 10 עשרות בפח האשפה מבלי להוסיף מאה.', isCorrect: false, feedbackHe: 'רמז: מחיקת בלוקים משנה את ערך המספר הכולל. יש להמיר למאה!' },
        { id: 'C', textHe: 'נרשום מספר דו-ספרתי בתוך משבצת העשרות.', isCorrect: false, feedbackHe: 'רמז: בכל משבצת בבית המספרים מותרת ספרה אחת בלבד (0 עד 9).' },
      ]
    : [
        { id: 'A', textHe: 'נבדוק את הטורים מימין לשמאל: אם יש 10 בלוקים בטור, נקבץ אותם לטור הבא.', isCorrect: true, feedbackHe: 'תשובה נכונה! כעת בצעו את הפעולה בלוח הדינס.' },
        { id: 'B', textHe: 'נמחק בלוקים לפח מבלי לבצע קיבוץ או המרה.', isCorrect: false, feedbackHe: 'רמז: מחיקת בלוקים משנה את ערך המספר הכולל! אפשר להשתמש בביטול ↩️.' },
        { id: 'C', textHe: 'נרשום מספר דו-ספרתי בתוך משבצת יחידה.', isCorrect: false, feedbackHe: 'רמז: בכל משבצת מותרת ספרה אחת בלבד (0 עד 9).' },
      ];

  const rawChoices: SocraticChoice[] = (aiSocraticHint?.choices && aiSocraticHint.choices.length > 0)
    ? aiSocraticHint.choices
    : defaultChoices;

  const options = rawChoices.map((c, idx) => {
    const isCorrect = c.isCorrect !== undefined
      ? c.isCorrect
      : (aiSocraticHint?.correctChoiceId ? c.id === aiSocraticHint.correctChoiceId : idx === 0);
    const hint = c.feedbackHe || c.hint || (isCorrect
      ? 'תשובה נכונה! כעת בצעו את הפעולה בלוח הדינס.'
      : 'רמז: חשבו שוב כיצד לשמר את הכמות בבית המספרים. אפשר להשתמש בביטול ↩️.');
    return {
      id: c.id,
      text: c.textHe,
      correct: isCorrect,
      hint
    };
  });

  const handleSelect = (opt: typeof options[0]) => {
    if (lockSeconds > 0) return;
    setSelectedOpt(opt.id);
    setFeedbackHint(opt.hint);

    const wsState = useWorkspaceStore.getState();
    const studentId = currentStudentUid();
    const currentTask = getActiveTasks(wsState)[wsState.standardTaskIdx] || null;
    const optionKey = (opt.id === 'opt_2' || opt.id === 'B' ? 'opt_2' : opt.id === 'opt_3' || opt.id === 'C' ? 'opt_3' : 'opt_1') as 'opt_1' | 'opt_2' | 'opt_3';

    emitTelemetry({
      session_id: `session_${wsState.sessionNumber}_student_${studentId}`,
      student_id: studentId,
      exercise_id: currentTask?.id || `ex_${wsState.sessionNumber}_01`,
      event_type: 'SOCRATIC_OPTION_SELECTED',
      details: {
        option_id: optionKey,
        is_correct: Boolean(opt.correct),
      },
    }).catch(console.error);

    if (!opt.correct) {
      // PRD Module 12: 30-second penalty lock on the card's answer buttons after a wrong distractor
      triggerSocraticPenaltyLockout(opt.hint);
    } else {
      const state = useWorkspaceStore.getState();
      if (state.keyboardState === 'SOCRATIC_ONLY') {
        state.unlockKeyboard();
      }
      // PRD Module 12: Smooth auto-dismiss after affirmative feedback display
      setTimeout(() => {
        if (useWorkspaceStore.getState().helpState === 'socratic') {
          useWorkspaceStore.getState().closeHelp();
        }
      }, 1200);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-2.5">
      <p className="font-extrabold text-xs text-ws-soft">בחרו את הדרך הנכונה להתקדם:</p>
      {options.map((opt) => {
        const isChosen = selectedOpt === opt.id;
        const isWrongChosen = isChosen && !opt.correct;
        const isCorrectChosen = isChosen && opt.correct;
        const isOtherDisabled = lockSeconds > 0 && !isChosen;

        return (
          <button
            key={opt.id}
            disabled={lockSeconds > 0}
            onClick={() => handleSelect(opt)}
            className={`p-3 rounded-2xl border-2 text-right font-medium text-xs sm:text-sm transition-all flex items-start gap-2 ${
              isCorrectChosen
                ? 'border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100'
                : isWrongChosen
                ? 'border-rose-500 bg-rose-100 text-rose-950 dark:bg-rose-950/60 dark:text-rose-100 font-bold'
                : isOtherDisabled
                ? 'border-ws-surface2 opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800'
                : 'border-ws-surface2 bg-ws-surface hover:border-ws-accent hover:bg-ws-accentSoft/30'
            }`}
          >
            {isWrongChosen && <span className="text-rose-600 font-black shrink-0" aria-hidden="true">❌</span>}
            {isCorrectChosen && <span className="text-emerald-600 font-black shrink-0" aria-hidden="true">✅</span>}
            <span>{opt.text}</span>
          </button>
        );
      })}

      {lockSeconds > 0 && (
        <div role="status"
          className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3 text-center text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-bold space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-base font-black">
            <span>⏳</span>
            <span>החלונית נעולה לחשיבה: {lockSeconds} שניות</span>
          </div>
          <p className="text-xs text-amber-800/90 dark:text-amber-300/90 font-medium">
            לוח הדינס וכפתור הביטול (↩️) פתוחים ופעילים. נסו לחקור את הבלוקים עד שהחלונית תיפתח מחדש.
          </p>
        </div>
      )}

      {feedbackHint && (
        <div
          role="status"
          aria-live="assertive"
          className={`rounded-2xl p-3 text-xs sm:text-sm font-semibold ${
          selectedOpt && options.find(o => o.id === selectedOpt)?.correct
            ? 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
            : 'bg-rose-50 text-rose-950 dark:bg-rose-950/50 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
        }`}
        >
          💡 {feedbackHint}
        </div>
      )}

      {/* PRD Module 12 §ב locks "לחצני המענה בכרטיס בלבד" for 30 seconds. The
          close button was locked too, so the child could not dismiss the card
          for the whole penalty. The answer buttons stay locked; this does not. */}
      <button
        onClick={onClose}
        className="mt-2 w-full h-11 rounded-full font-display font-extrabold text-sm transition-all bg-ws-accent text-white hover:brightness-105 shadow-md"
      >
        {lockSeconds > 0 ? `סגור לעת עתה (המענה ייפתח בעוד ${lockSeconds}ש')` : 'הבנתי, סגור חלונית'}
      </button>
    </div>
  );
}
