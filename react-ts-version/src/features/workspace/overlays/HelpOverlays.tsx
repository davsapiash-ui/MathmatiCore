import { useEffect, useRef, useState } from 'react';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import { AnimatePresence, motion } from 'framer-motion';
import {
  useWorkspaceStore,
  getActiveTasks,
  socraticCardColumnIndex,
  staticCardContextFor,
  SOCRATIC_CORRECT_AUTO_CLOSE_MS,
} from '@/application/useWorkspaceStore';
import { useAuthStore, currentStudentUid } from '@/application/useAuthStore';
import { SocraticEngine, cardFrameOf, type SocraticChoice } from '@/infrastructure/services/SocraticEngine';
import { orderSocraticChoices } from '@/infrastructure/services/socraticOptionOrder';
import { socraticCardTextDetails, socraticOptionKey } from '@/infrastructure/services/socraticCardText';
import { emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { MathText } from '../tasks/MathText';
import { joinSpokenSentences } from '../tasks/spokenSentences';
import { useStudentChatOpen } from '@/application/useStudentChatOpen';
import { coachingCardKey, showCoachingCard, useIsAdditionGridOverCard } from '@/application/useAdditionGridOverCard';
import { CARD_TAB_HE, CARD_TAB_LABEL_HE } from './StudentChatOverlay';
import { TaskZoneDrawerSlot } from './TaskZoneDrawerSlot';

/** The card's silent lock (PRD Module 12 §ב), said by the hint box's read-aloud button too. */
const LOCK_SENTENCE_HE = 'רגע לחשיבה. אפשר לבחור תשובה שוב עוד מעט.';

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

/**
 * The beat's second line: what comes next, addressed to the children (owner,
 * 1.10.2026, D11a). It said "מכין רמז מותאם אישית..." — masculine singular,
 * a voice the screens do not use, and a "hint" the card is not: the card asks
 * one question with three options.
 */
const FRICTION_NEXT_HE = 'עוד רגע תופיע שאלה שתעזור לכם.';

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
      {/* The 300 ms "נסו לחשוב…" beat before the card */}
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
            <p className="text-white/80 font-medium">{FRICTION_NEXT_HE}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * כרטיס החניכה הסוקרטי — חלונית צדדית נשלפת.
 *
 * PRD Module 12 §ב: the card opens "בחלונית צדדית נשלפת (Side Drawer) באגף
 * המשימה והמענה, כך שאגף הייצוגים ומרחב הלבנים הדיגיטליות נשארים גלויים".
 * In the meetings with a number house it is a column inside the task zone
 * (`inTaskZone`, StudentWorkspacePage): the zone keeps its 40% of the row and
 * the task card shares it with the drawer, so the board keeps its 60% (Module 7
 * §א) and nothing covers anything. In meeting 8, which has no board, it slides
 * out beside the centred task card. Nothing about its behaviour changed: the
 * lock on the answer buttons, the read-aloud button, SOCRATIC_CARD_SHOWN /
 * SOCRATIC_OPTION_SELECTED, Escape to close, no focus trap (the keyboard and
 * the board stay usable while it is open).
 */
/** Its width beside the centred card of meeting 8. */
const BESIDE_CARD_DRAWER_WIDTH = 'w-[clamp(236px,24vw,260px)] xl:w-[280px] 2xl:w-[340px]';

export function SocraticSidePanel({ inTaskZone = false }: { inTaskZone?: boolean }) {
  const helpState = useWorkspaceStore((s) => s.helpState);
  const closeHelp = useWorkspaceStore((s) => s.closeHelp);
  // Owner, 4.10.2026 (A7-002): the chat panel is fixed to the bottom-left
  // corner, over this column. While it is open the card folds into a small tab
  // beside it and comes back exactly as it was when the chat closes. Folding
  // changes nothing in the store: the card stays mounted, hidden — its chosen
  // option, its hint and a running 15-second lock go on as they were — and it
  // is not a help event, so it writes no telemetry. The column keeps its width,
  // so nothing else on the screen moves. Only its read-aloud stops: the speech
  // buttons unmount while folded, and each stops its own read as it goes.
  const chatOpen = useStudentChatOpen((s) => s.open);
  // Owner's decision, 4.10.2026: the same fold for the addition grid (enhanced
  // profile). The grid and the card are never shown together; the one that is
  // not shown is a tab in its own place (useAdditionGridOverCard.ts). While
  // the card is shown, the grid's amber "לוח החיבור" tab is beside it, in the
  // grid's slot. Pressing it shows the grid and folds the card — here the
  // column narrows to the card's "כרטיס החניכה" tab, to make room for the
  // grid. Pressing that tab, or closing the grid (X), brings the card back as
  // it was. Not a help event, no telemetry.
  const gridOverCard = useIsAdditionGridOverCard();
  const folded = helpState === 'socratic' && (chatOpen || gridOverCard);

  // מסמך העיצוב §1.2: כל חלונית נסגרת ב-Escape, דרך ההוק המשותף — אחרת
  // מסך אחד מתנהג אחרת מכל השאר. הכרטיס הזה נשאר עד כה בלי Escape בכלל:
  // ההתנהגות הייתה בנויה במגירה הישנה, שאיש לא הרכיב, ולכן הילד לא קיבל
  // אותה. `trapFocus: false` — הכרטיס אינו חוסם, והלומד חייב להמשיך
  // לנווט אל הלוח ואל כפתור הביטול בזמן שהוא פתוח (מודול 12 §ב).
  // Folded, Escape belongs to the chat: it closes the chat, and the card comes back.
  const cardRef = useDismissableOverlay<HTMLElement>(helpState === 'socratic' && !folded, closeHelp, { trapFocus: false, autoFocus: false });

  // The card comes back from under the grid (its tab, the chat's tab, or the
  // grid's X): the keyboard's focus comes to the card, instead of staying on
  // a control that is gone. Only for the same card: a new card that arrives
  // unfolded never takes the focus from the learner's typing.
  const cardKey = useWorkspaceStore(coachingCardKey);
  const wasOverRef = useRef<string | null>(null);
  useEffect(() => {
    const wasOverKey = wasOverRef.current;
    wasOverRef.current = gridOverCard ? cardKey : null;
    if (!gridOverCard && !folded && wasOverKey !== null && wasOverKey === cardKey) {
      cardRef.current?.focus({ preventScroll: true });
    }
  }, [gridOverCard, folded, cardKey, cardRef]);

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
  // A card that settles under the teacher's projector, pause or close screen
  // is not seen: the event waits until the screen is gone (1.10.2026).
  const classScreenUp = useWorkspaceStore((s) => s.classScreenUp);
  const cardShownRef = useRef(false);
  useEffect(() => {
    if (helpState !== 'socratic') {
      cardShownRef.current = false;
      return;
    }
    // A card that settles while folded under the chat is not seen yet either.
    if (cardShownRef.current || socraticPending || !aiSocraticHint || classScreenUp || folded) return;
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
        // 1.10.2026: AI or static, which model, and the card's frame (situation, level) —
        // the research export tells them apart.
        card_source: aiSocraticHint.source === 'gemini' ? 'ai' : 'static',
        model_id: aiSocraticHint.source === 'gemini' ? aiSocraticHint.modelId ?? null : null,
        // 7.10.2026: why a static card was shown, and how long the hourglass turned —
        // so the research data counts what the child saw, not what the server sent.
        ...(aiSocraticHint.source !== 'gemini' && aiSocraticHint.fallbackReason ? { card_fallback_reason: aiSocraticHint.fallbackReason } : {}),
        ...(aiSocraticHint.source !== 'gemini' && aiSocraticHint.fallbackDetail ? { card_fallback_detail: aiSocraticHint.fallbackDetail } : {}),
        ...(typeof aiSocraticHint.waitMs === 'number' ? { card_wait_ms: Math.round(aiSocraticHint.waitMs) } : {}),
        card_situation: cardFrameOf(aiSocraticHint, task).situation,
        card_level: cardFrameOf(aiSocraticHint, task).level,
        // 2.10.2026: the card's own text — the question and the options in id
        // order — so the pilot's real cards can be read and the engine tuned.
        // Generated text, no PII; the chat's free text is never part of a card.
        ...socraticCardTextDetails(aiSocraticHint),
      },
    }).catch(console.error);
  }, [helpState, aiSocraticHint, socraticPending, classScreenUp, folded]);

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

  // PRD Module 7 §א rule 6 (v7.15): in the task-and-response zone the drawer
  // is laid over the instruction — "במקום הצעדים" — and the zone, the board
  // and the work area keep their places (TaskZoneDrawerSlot). It fades in and
  // out; nothing slides. Beside the centred card of meeting 8 it keeps its own
  // column, sliding out as before.
  const drawerMotion = inTaskZone
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0, pointerEvents: 'none' as const }, transition: { duration: 0.2 } }
    : { initial: { maxWidth: 0, opacity: 0 }, animate: { maxWidth: 400, opacity: 1 }, exit: { maxWidth: 0, opacity: 0, pointerEvents: 'none' as const }, transition: { duration: 0.25, ease: 'easeOut' as const } };
  const drawer = helpState === 'socratic' && (
        /* In the layout, not over the work: no backdrop, no z-index over the
           board, and the pointer is released the moment it starts leaving. */
        <motion.div
          key="socratic-side-panel"
          {...drawerMotion}
          className={inTaskZone
            ? `socratic-side-panel w-full min-h-0 flex flex-col ${gridOverCard ? 'items-end' : ''}`
            : `socratic-side-panel shrink-0 self-stretch min-h-0 max-h-full overflow-hidden ${gridOverCard ? 'w-16' : BESIDE_CARD_DRAWER_WIDTH}`}
          dir="rtl"
          data-testid="socratic-side-panel"
        >
            {/* The card folded for the addition grid: its tab, in the card's
                own column (under the chat the tab is in the chat's header). */}
            {gridOverCard && !chatOpen && (
              <button
                type="button"
                onClick={showCoachingCard}
                data-testid="socratic-card-tab"
                aria-label={CARD_TAB_LABEL_HE}
                title={CARD_TAB_LABEL_HE}
                className="pointer-events-auto shrink-0 w-16 min-h-[72px] px-1 py-2 rounded-2xl text-sm font-bold leading-tight flex flex-col items-center justify-center gap-1 border-2 border-indigo-200 dark:border-indigo-800/80 bg-ws-surface text-ws-ink hover:bg-ws-accentSoft/40 active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                <span aria-hidden="true">💡</span>
                <span className="text-center">{CARD_TAB_HE}</span>
              </button>
            )}
            <aside
              ref={cardRef}
              /* Fixed inner width, so the text does not reflow while the panel
                 slides out. The owner's rule (28.9.2026): no scroll, nothing
                 clipped, on every screen size — so the spacing and the type
                 follow the screen's height (clamp on vh) and every option and
                 the close button fit in the panel down to a 585px-high window.
                 overflow-y-auto stays only as a last resort for a still
                 shorter screen. */
              className={`${inTaskZone ? 'w-full min-h-0 pointer-events-auto' : `h-full min-h-0 ${BESIDE_CARD_DRAWER_WIDTH}`} flex-col bg-ws-surface rounded-3xl shadow-lg border-2 border-indigo-200 dark:border-indigo-800/80 ${inTaskZone ? 'p-2' : 'p-[clamp(0.625rem,1.8vh,1.25rem)]'} overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ws-accent ${
                gridOverCard ? 'hidden' : folded ? 'flex invisible pointer-events-none' : 'flex pointer-events-auto'
              }`}
              // Folded: hidden, unreachable by Tab and screen readers, still mounted.
              inert={folded || undefined}
              // Focusable by the page only (the card's return from under the grid), not by Tab.
              tabIndex={-1}
              data-folded={folded ? 'true' : undefined}
              // Owner, 9.10.2026 (RO1): in the task zone this drawer may scroll
              // inside itself (the work area never moves); the UX audit allows
              // this one scroll and no other.
              data-scroll-allowed={inTaskZone ? 'owner-2026-10-09' : undefined}
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
              <div className={`flow-root shrink-0 ${inTaskZone ? 'mb-1' : 'mb-[clamp(0.25rem,1vh,0.75rem)]'}`}>
                <div className="float-left flex items-center gap-1 ms-2 mb-1">
                  {!folded && <UdlSpeechButton
                    text={joinSpokenSentences([
                      shownCard?.questionHe || 'שאלה מנחה לחשיבה',
                      // הקראת השאלה בלי האפשרויות משאירה ילד שנעזר בהקראה
                      // מול שלוש אפשרויות שלא שמע. מודול 7 (UDL).
                      ...shownChoices.map((c) => c.textHe),
                    ])}
                    className="shrink-0"
                  />}
                  <button
                    onClick={closeHelp}
                    aria-label="סגירת חלונית העזרה"
                    className="w-11 h-11 rounded-full bg-ws-surface2 hover:bg-ws-surface2/80 text-ws-soft font-bold flex items-center justify-center text-sm transition-colors shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <CardTitle inTaskZone={inTaskZone} />
                <h2 className={`font-display font-black ${inTaskZone ? 'text-[clamp(0.9375rem,2.4vh,1.25rem)]' : 'text-[clamp(0.875rem,2.4vh,1.25rem)]'} text-ws-ink leading-tight`}>
                  <MathText text={shownCard?.questionHe || 'שאלה מנחה לחשיבה'} />
                </h2>
              </div>

              {/* 3 Closed Dynamic Options for Socratic Mentoring */}
              <SocraticPenaltyLockOptions choices={shownChoices} onClose={closeHelp} folded={folded} columns={inTaskZone} />
              </>)}
            </aside>
        </motion.div>
  );

  if (inTaskZone) {
    return (
      // Folded for the addition grid, only its tab is left: at the zone's top
      // corner, beside the station tag, over nothing the learner reads.
      <TaskZoneDrawerSlot atTop={gridOverCard} covering={helpState === 'socratic' && !gridOverCard && !folded}>
        <AnimatePresence initial={false}>{drawer}</AnimatePresence>
      </TaskZoneDrawerSlot>
    );
  }
  return <AnimatePresence initial={false}>{drawer}</AnimatePresence>;
}

/**
 * The card's own name, at its top (owner's decision, 4.10.2026): the tab the
 * card folds into is called "כרטיס החניכה", so the card itself says so — the
 * tab names something the learner has seen. One quiet line beside the
 * read-aloud and ✕ buttons, above the question, in the card's label style
 * ("בחרו את הדרך הנכונה להתקדם:"), so it does not read as the question's
 * first words. Not on the hourglass, which has no text (owner, 28.9.2026; X22).
 */
function CardTitle({ inTaskZone = false }: { inTaskZone?: boolean }) {
  return (
    <p
      // In the task zone no text is under 14px (PRD 7 §א rule 1).
      className={`font-extrabold ${inTaskZone ? 'text-sm' : 'text-xs'} text-ws-soft whitespace-nowrap mb-[clamp(0.125rem,0.5vh,0.375rem)]`}
      data-testid="socratic-card-title"
    >
      <span className="me-1" aria-hidden="true">💡</span>
      {CARD_TAB_HE}
    </p>
  );
}

/**
 * `columns`: in the task zone the drawer is as wide as the zone and lies over
 * the instruction, so its three options stand side by side — the drawer stays
 * as short as the instruction it covers (PRD Module 7 §א rule 6).
 */
function SocraticPenaltyLockOptions({ choices, onClose, folded = false, columns = false }: { choices: SocraticChoice[]; onClose: () => void; folded?: boolean; columns?: boolean }) {
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
      ? (noBoard ? 'נכון מאוד! עכשיו כתבו את הספרות בשורת התוצאה, טור אחר טור.' : 'נכון מאוד! עכשיו עשו את הפעולה בבית המספרים.')
      // A guiding question, like every wrong option's hint (owner, 30.9.2026; D10).
      : (noBoard ? 'רמז: באיזה טור כדאי לבדוק שוב את החישוב?' : 'רמז: האם בית המספרים עדיין מראה את הכמות שצריך?'));
    return {
      id: c.id,
      text: c.textHe,
      correct: isCorrect,
      hint
    };
  });

  // After the right answer the card keeps its feedback on the screen for
  // SOCRATIC_CORRECT_AUTO_CLOSE_MS, then closes by itself (owner, 1.10.2026,
  // D1); "הבנתי" closes it at once. On 30.9.2026 it stayed until "הבנתי" (it
  // used to close after 1.2 s, too fast to read), and a card answered and
  // left open blocked every later card of the exercise. The answer is given:
  // the options take no second press.
  const answered = options.some((o) => o.id === selectedOpt && o.correct);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!answered) return;
    // Only this card: the timer never closes a card that opened after it.
    const { taskId, cards } = useWorkspaceStore.getState().socraticCardHistory;
    const t = window.setTimeout(() => {
      const s = useWorkspaceStore.getState();
      const sameCard = s.socraticCardHistory.taskId === taskId && s.socraticCardHistory.cards.length === cards.length;
      if (s.helpState === 'socratic' && sameCard) onCloseRef.current();
    }, SOCRATIC_CORRECT_AUTO_CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [answered]);

  const handleSelect = (opt: typeof options[0]) => {
    if (locked || answered) return;
    setSelectedOpt(opt.id);
    setFeedbackHint(opt.hint);

    const wsState = useWorkspaceStore.getState();
    const studentId = currentStudentUid();
    const currentTask = getActiveTasks(wsState)[wsState.standardTaskIdx] || null;
    const optionKey = socraticOptionKey(opt.id);

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
    // The next card's request says whether this card's chosen option was right.
    wsState.recordSocraticAnswer(Boolean(opt.correct));

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

  // PRD Module 12 §ב locks "לחצני המענה בכרטיס בלבד" (15 seconds, owner 1.10.2026). The
  // close button was locked too, so the child could not dismiss the card
  // for the whole penalty. The answer buttons stay locked; this does not.
  const closeButton = (
    <button
      onClick={onClose}
      className={`${columns ? 'px-5' : 'mt-[clamp(0.125rem,0.8vh,0.5rem)] w-full'} h-11 shrink-0 rounded-full font-display font-extrabold text-sm transition-all bg-ws-accent text-white hover:brightness-105 shadow-md`}
    >
      {locked ? 'סגירה' : 'הבנתי, סגירת החלונית'}
    </button>
  );

  return (
    <div className={`${columns ? 'gap-1.5' : 'mt-[clamp(0.25rem,1.2vh,1rem)] gap-[clamp(0.25rem,0.9vh,0.625rem)]'} flex flex-col shrink-0`}>
      {/* While the answer buttons are locked the prompt's line goes to the
          hint; it comes back with the buttons. */}
      {/* In the task zone the drawer lies over the guide block and must stay as
          short as it (PRD 7 §א rule 6): the prompt and the close button share
          one row above the options, instead of a row each. */}
      {columns ? (
        <div className="flex items-center justify-between gap-2">
          <p className="font-extrabold text-sm text-ws-soft">{!locked && !answered ? 'בחרו תשובה:' : ''}</p>
          {closeButton}
        </div>
      ) : (!locked && !answered && <p className="font-extrabold text-xs text-ws-soft">בחרו תשובה:</p>)}
      {/* In the task zone, once the right answer is chosen the options are
          done (they take no second press) and the hint below says it: they
          give their row to the hint, so the drawer stays as short as the
          guide block it lies over (PRD 7 §א rules 6–7). */}
      {!(columns && answered) && <div className={columns ? 'grid grid-cols-3 gap-2' : 'contents'} data-testid="socratic-options">
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
            // At least 44px tall, the child's touch target (DESIGN_SYSTEM_RULES.md;
            // UX audit 4.10.2026: 36–42px on 585–729px-high windows).
            className={`min-h-11 ${columns ? 'px-2 py-1 justify-center text-center' : 'px-3 text-right py-[clamp(0.3125rem,1.3vh,0.75rem)]'} rounded-2xl border-2 font-medium ${columns ? 'text-sm' : 'text-[clamp(0.75rem,2vh,0.875rem)]'} leading-snug transition-all flex items-center gap-2 ${
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
            <span><MathText text={opt.text} /></span>
          </button>
        );
      })}
      </div>}

      {/* After a wrong choice the hint and the lock share one box: two boxes
          pushed the close button below a 585px-high window (28.9.2026). */}
      {feedbackHint ? (
        <div
          role="status"
          aria-live="assertive"
          className={`rounded-2xl px-3 ${columns ? 'py-1.5 text-sm' : 'py-[clamp(0.25rem,1vh,0.75rem)] text-[clamp(0.75rem,2vh,0.875rem)]'} leading-snug font-semibold ${
          selectedOpt && options.find(o => o.id === selectedOpt)?.correct
            ? 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
            : 'bg-rose-50 text-rose-950 dark:bg-rose-950/50 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
        }`}
        >
          {/* Read aloud like every instruction on the screen (PRD Module 7 §א),
              floated so it adds no row: the hint and, while the answers are
              locked, the lock sentence too. */}
          {!folded && <UdlSpeechButton
            text={locked ? joinSpokenSentences([feedbackHint, LOCK_SENTENCE_HE]) : feedbackHint}
            className="float-left ms-2 shrink-0"
          />}
          <div>💡 <MathText text={feedbackHint} /></div>
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
          className={`flex items-center justify-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-3 py-[clamp(0.25rem,1vh,0.75rem)] text-amber-900 dark:text-amber-200 ${columns ? 'text-sm' : 'text-[clamp(0.75rem,2vh,0.875rem)]'} leading-snug font-bold`}>
          <span aria-hidden="true" className="text-base">⏳</span>
          <span>רגע לחשיבה. אפשר לבחור תשובה שוב עוד מעט.</span>
          {!folded && <UdlSpeechButton text={LOCK_SENTENCE_HE} className="shrink-0" />}
        </div>
      )}

      {!columns && closeButton}
    </div>
  );
}
