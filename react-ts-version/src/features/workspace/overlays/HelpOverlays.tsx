import { useEffect, useRef, useState } from 'react';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspaceStore, getActiveTasks, socraticCardColumnIndex, staticCardContextFor } from '@/application/useWorkspaceStore';
import { useAuthStore, currentStudentUid } from '@/application/useAuthStore';
import { SocraticEngine, type SocraticChoice } from '@/infrastructure/services/SocraticEngine';
import { orderSocraticChoices } from '@/infrastructure/services/socraticOptionOrder';
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

  // Fast, smooth transition (300ms) for snappy help response without lag.
  useEffect(() => {
    if (helpState !== 'friction') return;
    const t = window.setTimeout(helpFrictionDone, 300);
    return () => window.clearTimeout(t);
  }, [helpState, helpFrictionDone]);

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
            <p className="font-display font-extrabold text-2xl text-white">נסו לחשוב…</p>
            <p className="text-white/80 font-medium">מכין רמז מותאם אישית...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * כרטיס החניכה הסוקרטי — חלונית צדדית.
 *
 * מסמך 03: הכרטיס מוצג "כרכיב צדדי עדין השומר על נראות מלאה של התרגיל", "בחלונית
 * צדדית"; מסמך 04 §א: "אך ורק כחלונית צדדית נשלפת מצד המסך המותירה את מרחב
 * העבודה במרכז פעיל". Register row 17 (25.9.2026): built as document 03 says.
 *
 * It used to float over the top centre of the screen, on top of the exercise
 * sheet. It is now a column of the workspace row itself — after the board, so
 * in RTL it slides out from the left edge of the screen — and the sheet and the
 * board share the rest of the row. Being in the layout, it cannot cover the
 * sheet, the board or the result row on any screen size. Nothing about its
 * behaviour changed: the 30-second lock on the answer buttons, the read-aloud
 * button, SOCRATIC_CARD_SHOWN / SOCRATIC_OPTION_SELECTED, Escape to close, no
 * focus trap (the keyboard and the board stay usable while it is open).
 */
export function SocraticSidePanel() {
  const helpState = useWorkspaceStore((s) => s.helpState);
  const closeHelp = useWorkspaceStore((s) => s.closeHelp);

  // מסמך העיצוב §1.2: כל חלונית נסגרת ב-Escape, דרך ההוק המשותף — אחרת
  // מסך אחד מתנהג אחרת מכל השאר. הכרטיס הזה נשאר עד כה בלי Escape בכלל:
  // ההתנהגות הייתה בנויה במגירה הישנה, שאיש לא הרכיב, ולכן הילד לא קיבל
  // אותה. `trapFocus: false` — הכרטיס אינו חוסם, והלומד חייב להמשיך
  // לנווט אל הלוח ואל כפתור הביטול בזמן שהוא פתוח (מודול 12 §ב).
  const cardRef = useDismissableOverlay<HTMLElement>(helpState === 'socratic', closeHelp, { trapFocus: false, autoFocus: false });

  const aiSocraticHint = useWorkspaceStore((s) => s.aiSocraticHint);
  // Until the engine answers (at most 8 seconds) the card shows an hourglass,
  // then one card that does not change (owner, 28.9.2026; X22).
  const socraticPending = useWorkspaceStore((s) => s.socraticPending);

  // PRD Appendix A §3: SOCRATIC_CARD_SHOWN is emitted once per opening of the
  // card, from the component that actually renders it. It used to live in a
  // drawer nothing mounted, so the radar, the session report and the AI
  // analysis all counted zero cards. It is emitted when the one card appears,
  // never for the hourglass. error_category is the engine's classification,
  // or null when the static card is shown (PRD Module 13; owner, 28.9.2026;
  // X19): the store sets it that way when the card settles.
  const cardShownRef = useRef(false);
  useEffect(() => {
    if (helpState !== 'socratic') {
      cardShownRef.current = false;
      return;
    }
    if (cardShownRef.current || socraticPending || !aiSocraticHint) return;
    cardShownRef.current = true;

    const ws = useWorkspaceStore.getState();
    const studentId = currentStudentUid();
    const task = getActiveTasks(ws)[ws.standardTaskIdx] || null;
    // Every opening path records its trigger in the store; the fallback only
    // covers a card restored from a saved session.
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
      // A "four errors" card is about the streak's column, not the box the cursor moved to (שהB.2).
      column_index: socraticCardColumnIndex(ws),
      details: {
        trigger_reason: triggerReason,
        error_category: aiSocraticHint.error_category ?? null,
      },
    }).catch(console.error);
  }, [helpState, aiSocraticHint, socraticPending]);

  // A card open without content (restored from a saved session before the
  // store refilled it) shows the static card of the exercise on the screen —
  // the same one the store serves. It used to show a generic "נקודה למחשבה"
  // with a ten-rod picture and board lines, also in meeting 8, where there
  // are no blocks (PRD Module 13 §א).
  const fallbackCard = helpState === 'socratic' && !socraticPending && !aiSocraticHint
    ? (() => {
        const s = useWorkspaceStore.getState();
        const task = getActiveTasks(s)[s.standardTaskIdx] ?? undefined;
        return SocraticEngine.getSynchronousTaskHint(task, s.counts, staticCardContextFor(s, task?.id, task));
      })()
    : null;
  const shownCard = aiSocraticHint ?? fallbackCard;
  // The options, computed once so the buttons and the read-aloud show and say
  // the same list in the same order. The correct option is not always first
  // (owner, 28.9.2026; socraticOptionOrder.ts): one order per exercise and
  // question, the same for every learner and every reload, for static and AI
  // cards alike. Ids and isCorrect travel with the option, so
  // SOCRATIC_OPTION_SELECTED records what it recorded before. A card stored
  // without options gets those of the static card of the exercise on the
  // screen — the same one the store serves — not a generic one that could
  // speak of the tens in a units exercise, or of blocks in meeting 8.
  const shownChoices: SocraticChoice[] = helpState === 'socratic' && !socraticPending
    ? (() => {
        const s = useWorkspaceStore.getState();
        const task = getActiveTasks(s)[s.standardTaskIdx] ?? undefined;
        const source = aiSocraticHint?.choices && aiSocraticHint.choices.length > 0
          ? aiSocraticHint
          : fallbackCard ?? SocraticEngine.getSynchronousTaskHint(task, s.counts, staticCardContextFor(s, task?.id, task));
        return orderSocraticChoices(source.choices, task?.id, source.questionHe, source.correctChoiceId);
      })()
    : [];

  return (
    <AnimatePresence initial={false}>
      {helpState === 'socratic' && (
        /* In the workspace row, not over it: the panel takes its own width
           (max-width grows 0 → full in 250ms, so the sheet and the board ease
           aside instead of jumping) and releases the pointer the moment it
           starts leaving. No backdrop, no z-index over the work. */
        <motion.div
          key="socratic-side-panel"
          initial={{ maxWidth: 0, opacity: 0 }}
          animate={{ maxWidth: 400, opacity: 1 }}
          exit={{ maxWidth: 0, opacity: 0, pointerEvents: 'none' }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="socratic-side-panel shrink-0 self-stretch min-h-0 max-h-full overflow-hidden w-[clamp(236px,24vw,260px)] xl:w-[280px] 2xl:w-[340px]"
          dir="rtl"
          data-testid="socratic-side-panel"
        >
            <aside
              ref={cardRef}
              /* Fixed inner width, so the text does not reflow while the panel
                 slides out. The owner's rule (28.9.2026): no scroll, nothing
                 clipped, on every screen size — so the spacing and the type
                 follow the screen's height (clamp on vh) and every option and
                 the close button fit in the panel down to a 585px-high window.
                 overflow-y-auto stays only as a last resort for a still
                 shorter screen. */
              className="pointer-events-auto h-full min-h-0 flex flex-col w-[clamp(236px,24vw,260px)] xl:w-[280px] 2xl:w-[340px] bg-ws-surface rounded-3xl shadow-lg border-2 border-indigo-200 dark:border-indigo-800/80 p-[clamp(0.625rem,1.8vh,1.25rem)] overflow-y-auto"
              role="region"
              aria-label="כרטיס החניכה"
              aria-busy={socraticPending}
              data-testid="socratic-card"
            >
              {socraticPending ? (
                /* Until the engine answers (at most 8 seconds): the card's
                   hourglass (the same ⏳ as the card's silent lock, Module 12
                   §ב) and no text, then one card that stays (owner,
                   28.9.2026; X22). The ✕ stays: closing now means no card. */
                <div className="h-full flex flex-col" data-testid="socratic-card-pending">
                  <div className="flow-root shrink-0">
                    <button
                      onClick={closeHelp}
                      aria-label="סגירת חלונית העזרה"
                      className="float-left w-11 h-11 rounded-full bg-ws-surface2 hover:bg-ws-surface2/80 text-ws-soft font-bold flex items-center justify-center text-sm transition-colors shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <span aria-hidden="true" className="text-5xl motion-safe:animate-pulse">⏳</span>
                  </div>
                </div>
              ) : (<>
              {/* The read-aloud and ✕ buttons float at the top-left corner and
                  the question flows beside them, instead of a row of their
                  own above it: on a 585–700px-high window that row pushed the
                  close button below the panel (owner, 28.9.2026: no scroll
                  at any size). */}
              <div className="flow-root shrink-0 mb-[clamp(0.25rem,1vh,0.75rem)]">
                <div className="float-left flex items-center gap-1 ms-2 mb-1">
                  <UdlSpeechButton
                    text={[
                      shownCard?.questionHe || 'שאלה מנחה לחשיבה',
                      // הקראת השאלה בלי האפשרויות משאירה ילד שנעזר בהקראה
                      // מול שלוש אפשרויות שלא שמע. מודול 7 (UDL).
                      ...shownChoices.map((c) => c.textHe),
                    ].join('. ')}
                    className="shrink-0"
                  />
                  <button
                    onClick={closeHelp}
                    aria-label="סגירת חלונית העזרה"
                    className="w-11 h-11 rounded-full bg-ws-surface2 hover:bg-ws-surface2/80 text-ws-soft font-bold flex items-center justify-center text-sm transition-colors shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <h2 className="font-display font-black text-[clamp(0.875rem,2.4vh,1.25rem)] text-ws-ink leading-tight">
                  <span className="me-1" aria-hidden="true">💡</span>
                  {shownCard?.questionHe || 'שאלה מנחה לחשיבה'}
                </h2>
              </div>

              {/* 3 Closed Dynamic Options for Socratic Mentoring */}
              <SocraticPenaltyLockOptions choices={shownChoices} onClose={closeHelp} />
              </>)}
            </aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SocraticPenaltyLockOptions({ choices, onClose }: { choices: SocraticChoice[]; onClose: () => void }) {
  const socraticPenaltyLockoutUntil = useWorkspaceStore((s) => s.socraticPenaltyLockoutUntil);
  const triggerSocraticPenaltyLockout = useWorkspaceStore((s) => s.triggerSocraticPenaltyLockout);
  const getSocraticPenaltyRemaining = useWorkspaceStore((s) => s.getSocraticPenaltyRemaining);

  // PRD Module 12 §ב: "נעילה שקטה של לחצני המענה ... (pointer-events: none
  // בתוספת אינדיקטור שעון חול עדין)". The card only needs to know WHETHER the
  // buttons are locked; the seconds are never shown (they used to count down
  // on the card and on the close button, every second).
  const [locked, setLocked] = useState(() => getSocraticPenaltyRemaining() > 0);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [feedbackHint, setFeedbackHint] = useState<string | null>(null);

  useEffect(() => {
    const updateLock = () => setLocked(getSocraticPenaltyRemaining() > 0);
    updateLock();
    const interval = setInterval(updateLock, 500);
    return () => clearInterval(interval);
  }, [socraticPenaltyLockoutUntil, getSocraticPenaltyRemaining]);

  const wsState = useWorkspaceStore.getState();

  const options = choices.map((c) => {
    // orderSocraticChoices resolved an implicit isCorrect before moving anything.
    const isCorrect = c.isCorrect === true;
    // Meeting 8 has no number house on the screen (PRD Module 14 §ב).
    const noBoard = wsState.sessionNumber === 8;
    const hint = c.feedbackHe || c.hint || (isCorrect
      ? (noBoard ? 'תשובה נכונה! כעת כתבו בשורת התוצאה, טור אחר טור.' : 'תשובה נכונה! כעת בצעו את הפעולה בבית המספרים.')
      : (noBoard ? 'רמז: חשבו שוב, טור אחר טור. אפשר להשתמש בכפתור ביטול פעולה ↺.' : 'רמז: חשבו שוב כיצד לשמור על הכמות בבית המספרים. אפשר להשתמש בכפתור ביטול פעולה ↺.'));
    return {
      id: c.id,
      text: c.textHe,
      correct: isCorrect,
      hint
    };
  });

  // After the right answer the card stays open with its feedback until the
  // child presses "הבנתי" (owner, 30.9.2026; it used to close after 1.2 s, too
  // fast to read). The answer is given: the options take no second press.
  const answered = options.some((o) => o.id === selectedOpt && o.correct);

  const handleSelect = (opt: typeof options[0]) => {
    if (locked || answered) return;
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
    }
  };

  return (
    <div className="mt-[clamp(0.25rem,1.2vh,1rem)] flex flex-col gap-[clamp(0.25rem,0.9vh,0.625rem)] shrink-0">
      {/* While the answer buttons are locked the prompt's line goes to the
          hint; it comes back with the buttons. */}
      {!locked && !answered && <p className="font-extrabold text-xs text-ws-soft">בחרו את הדרך הנכונה להתקדם:</p>}
      {options.map((opt) => {
        const isChosen = selectedOpt === opt.id;
        const isWrongChosen = isChosen && !opt.correct;
        const isCorrectChosen = isChosen && opt.correct;
        const isOtherDisabled = (locked || answered) && !isChosen;

        return (
          <button
            key={opt.id}
            disabled={locked || answered}
            onClick={() => handleSelect(opt)}
            className={`px-3 py-[clamp(0.3125rem,1.3vh,0.75rem)] rounded-2xl border-2 text-right font-medium text-[clamp(0.75rem,2vh,0.875rem)] leading-snug transition-all flex items-start gap-2 ${
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

      {/* After a wrong choice the hint and the lock share one box: two boxes
          pushed the close button below a 585px-high window (28.9.2026). */}
      {feedbackHint ? (
        <div
          role="status"
          aria-live="assertive"
          className={`rounded-2xl px-3 py-[clamp(0.25rem,1vh,0.75rem)] text-[clamp(0.75rem,2vh,0.875rem)] leading-snug font-semibold ${
          selectedOpt && options.find(o => o.id === selectedOpt)?.correct
            ? 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
            : 'bg-rose-50 text-rose-950 dark:bg-rose-950/50 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
        }`}
        >
          <div>💡 {feedbackHint}</div>
          {locked && (
            // שעון חול עדין ומשפט אחד, בלי מספרים (מודול 12 §ב; ע1.5).
            <div data-testid="socratic-lock-indicator" className="mt-1 flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
              <span aria-hidden="true">⏳</span>
              <span>רגע לחשיבה. אפשר לבחור תשובה שוב עוד מעט.</span>
            </div>
          )}
        </div>
      ) : locked && (
        // שעון חול עדין ומשפט אחד, בלי מספרים. `role="status"` מכריז על
        // המשפט פעם אחת, כשהנעילה מתחילה.
        <div role="status" data-testid="socratic-lock-indicator"
          className="flex items-center justify-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-3 py-[clamp(0.25rem,1vh,0.75rem)] text-amber-900 dark:text-amber-200 text-[clamp(0.75rem,2vh,0.875rem)] leading-snug font-bold">
          <span aria-hidden="true" className="text-base">⏳</span>
          <span>רגע לחשיבה. אפשר לבחור תשובה שוב עוד מעט.</span>
        </div>
      )}

      {/* PRD Module 12 §ב locks "לחצני המענה בכרטיס בלבד" for 30 seconds. The
          close button was locked too, so the child could not dismiss the card
          for the whole penalty. The answer buttons stay locked; this does not. */}
      <button
        onClick={onClose}
        className="mt-[clamp(0.125rem,0.8vh,0.5rem)] w-full h-11 shrink-0 rounded-full font-display font-extrabold text-sm transition-all bg-ws-accent text-white hover:brightness-105 shadow-md"
      >
        {locked ? 'סגירה' : 'הבנתי, סגירת החלונית'}
      </button>
    </div>
  );
}
