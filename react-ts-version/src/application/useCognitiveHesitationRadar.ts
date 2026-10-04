import { useEffect, useRef, useCallback } from 'react';
import { currentStudentUid } from './useAuthStore';
import {
  useWorkspaceStore,
  activeExerciseId,
  cardFocusPlace,
  isAdditionExercise,
  placeToColumnIndex,
  selectStandardTask,
} from '@/application/useWorkspaceStore';
import { useBoardFocusStore } from '@/application/useBoardFocusStore';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { throttledRtdbUpdate } from '@/infrastructure/services/ThrottledRtdbWriter';
import { emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';
import { getHesitationThresholdSeconds, useHesitationThresholdSeconds } from '@/core/hesitationCalibration';
import { serverNow } from '@/infrastructure/firebase';
import { GRID_STAGE_SECONDS, SOCRATIC_STAGE_SECONDS, shouldOpenAdaptiveGrid } from '@/core/hesitationStages';

interface UseCognitiveHesitationRadarProps {
  isActive: boolean;
  onHesitationDetected?: () => void;
}

/**
 * Owner, 1.10.2026 (D2): besides the board, the digits and a choice, three
 * things the child does are work, not hesitation, and restart the count:
 *  - pressing a read-aloud button ("הקראה בקול" — UdlSpeechButton),
 *  - working in the addition grid (AdaptiveAdditionGrid),
 *  - typing or sending in the chat with the teacher (StudentChatOverlay).
 * They change nothing in the workspace store, so they are caught here, on the
 * page, by the controls' own names: a click on a read-aloud button or in the
 * grid; typing in the chat, or a press of one of its buttons. Closing the
 * grid or the chat (their "סגירת…" buttons) is not work.
 */
export const READ_ALOUD_SELECTOR = 'button[aria-label="הקראה בקול"]';
export const ADDITION_GRID_SELECTOR = '[data-testid="adaptive-addition-grid"]';
export const TEACHER_CHAT_SELECTOR = '[role="dialog"][aria-label="הודעות עם המורה"]';
const CLOSE_BUTTON_SELECTOR = 'button[aria-label^="סגירת"]';

/** Whether a DOM event is one of the D2 activities above. */
export function isLearnerActivityEvent(event: Pick<Event, 'type' | 'target'>): boolean {
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== 'function') return false;
  if (event.type === 'click') {
    if (target.closest(READ_ALOUD_SELECTOR)) return true;
    if (target.closest(CLOSE_BUTTON_SELECTOR)) return false;
    if (target.closest(ADDITION_GRID_SELECTOR)) return true;
    return Boolean(target.closest(TEACHER_CHAT_SELECTOR) && target.closest('button'));
  }
  if (event.type === 'input') return Boolean(target.closest(TEACHER_CHAT_SELECTOR));
  return false;
}

/**
 * A silent pedagogical radar that tracks time between clicks/interactions.
 *
 * It owns the entire Module 10 / Module 12 hesitation hierarchy, in three
 * stages measured from the same "last cognitive action" mark:
 *
 *   30s — Module 10: the adaptive addition grid opens, but only for learners
 *         carrying the `enhanced_cognitive_support` profile. Standard learners
 *         get no visible support at this stage.
 *   45s — Module 12: the Socratic coach is offered and HESITATION_DETECTED is
 *         emitted. Fixed, never calibrated: the module says the card fires
 *         "strictly upon: (a) 45 seconds of continuous column hesitation",
 *         and Appendix A §3 stamps the event `trigger_reason: 'hesitation_45s'`.
 *   the calibrated threshold (default 45s) — Module 18 §ב: the learner's tile
 *         turns yellow on the teacher's radar. This is the one an admin moves
 *         in Module 26's "כיול רדאר פדגוגי" panel, whose own save message
 *         promises exactly that ("יוחלו על לוח הבקרה"). Until now the slider
 *         moved the learner's coaching card with it, so an admin who set 60
 *         silently broke the module's "strictly" and left every hesitation in
 *         the research data labelled 45s while it was really 60s.
 *
 * Both stages are silent from the learner's perspective until they fire, and
 * neither is shown as a countdown. This hook is the single owner of the
 * hierarchy: earlier revisions also carried an ad-hoc 45s timer inside
 * VerticalAdditionTask (which collapsed both stages onto one deadline and
 * double-fired the Socratic transition) and a `tickHesitationTimer` store
 * action that nothing ever called. Both are gone; do not reintroduce a
 * competing timer.
 */
export function useCognitiveHesitationRadar({ 
  isActive, 
  onHesitationDetected 
}: UseCognitiveHesitationRadarProps) {
  /** Module 12 — the Socratic stage, fixed at SOCRATIC_STAGE_SECONDS. */
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Module 10's 30s grid stage runs on its own deadline so that reaching it
  // never consumes or delays the 45s Socratic stage below.
  const gridTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The 30-second grid stage came due while the coaching card was open. */
  const gridDeferredRef = useRef(false);
  /** Module 18 §ב — the teacher radar stage, on the admin-calibrated threshold. */
  const radarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store callback in a ref so changes to it don't reset the timer
  const onHesitationRef = useRef(onHesitationDetected);
  useEffect(() => { onHesitationRef.current = onHesitationDetected; }, [onHesitationDetected]);

  const lastActivityRef = useRef<number>(Date.now());
  /** True while this device has a live 'hesitating' flag on the radar that the next action must clear. */
  const hesitatingPublishedRef = useRef(false);
  // Module 26: subscribes this hook to the admin-configured radar threshold
  // (system_control/trace_calibration, default 45s). The return value itself
  // isn't needed here — resetTimeout reads the live value at fire time via
  // getHesitationThresholdSeconds() below — this call just keeps the shared
  // listener alive for as long as this hook is mounted. It governs the
  // teacher's radar only; the learner's card is on SOCRATIC_STAGE_SECONDS.
  useHesitationThresholdSeconds();

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (gridTimeoutRef.current) {
      clearTimeout(gridTimeoutRef.current);
    }
    if (radarTimeoutRef.current) {
      clearTimeout(radarTimeoutRef.current);
    }
    lastActivityRef.current = Date.now();
    // A cognitive action restarts the count: a grid that was waiting for the
    // coaching card to close is no longer due.
    gridDeferredRef.current = false;

    if (!isActive) return;

    // Module 10 — stage 1 (30s): open the adaptive addition grid. The rule for
    // who receives it lives in shouldOpenAdaptiveGrid(); this timer only
    // decides when to ask.
    gridTimeoutRef.current = setTimeout(() => {
      const wsState = useWorkspaceStore.getState();
      // Module 19 §ב: the profile applied at this exercise's start, never the live record.
      const supportProfileId = wsState.activeSupportProfileId;
      const due =
        shouldOpenAdaptiveGrid({
          supportProfileId,
          sessionNumber: wsState.sessionNumber,
          isAdditionHelperOpen: wsState.isAdditionHelperOpen,
        }) &&
        // Owner, 1.10.2026 (D7): the grid opens only in an addition exercise —
        // not in station 3's representations, not in a subtraction.
        isAdditionExercise(selectStandardTask(wsState));
      if (!due) return;
      // The grid and the coaching card are never shown together
      // (StudentWorkspacePage), so while the card is open the grid is not
      // opened over or behind it, and no ADAPTIVE_GRID_TOGGLED is written for
      // a grid that did not appear. It is offered: its "לוח החיבור" tab
      // appears beside the card, and the learner may press it. And it is
      // deferred, not dropped: it opens when the card closes, unless a
      // cognitive action came first or the learner opened it from the tab.
      // The same during the 300 ms "נסו לחשוב…" beat before a card: the card
      // is on its way, and a grid opened now would be hidden at once.
      if (wsState.helpState !== 'closed') {
        wsState.offerAdditionHelper();
        gridDeferredRef.current = true;
        return;
      }
      wsState.openAdditionHelper();
    }, GRID_STAGE_SECONDS * 1000);

    timeoutRef.current = setTimeout(() => {
      // Trigger silent dashboard alert payload
      // מזהה קנוני (student_user{N}) — זה גם הצומת שהרדאר של המורה קורא
      // ממנו. מזהה Auth גולמי היה נכתב לנתיב שהדשבורד לא מסתכל עליו, ואז
      // ההיסוס פשוט לא היה מגיע למורה.
      const userId = currentStudentUid();

      if (!userId) return;

      AuditLogger.log(
        "HESITATION", 
        userId as string, 
        "Student hesitated for >45s without interacting. Silent alert triggered."
      );
      
      const wsState = useWorkspaceStore.getState();
      // The active column (PRD 12 §ב: "בטור החישוב הפעיל"): the box the child
      // stands in, else the memory circle (meeting 8 records its conversions
      // there), else the first unsolved column — the column the card that
      // follows is about (cardFocusPlace). It used to be the units whenever no
      // box was focused.
      const activePlace = cardFocusPlace(
        wsState,
        selectStandardTask(wsState),
        'hesitation_45s',
        useBoardFocusStore.getState().focusedMemoryCircle
      );
      const colIndex = activePlace ? placeToColumnIndex(activePlace) : 0;
      const measuredSeconds = Math.max(
        SOCRATIC_STAGE_SECONDS,
        Math.round((Date.now() - lastActivityRef.current) / 1000)
      );

      // Canonical HESITATION_DETECTED telemetry event (Module 5 §C & Appendix A §3)
      emitTelemetry({
        session_id: `session_${wsState.sessionNumber}_student_${userId}`,
        student_id: userId,
        exercise_id: activeExerciseId(wsState),
        event_type: 'HESITATION_DETECTED',
        column_index: colIndex,
        details: {
          hesitation_seconds: measuredSeconds,
        },
      }).catch(console.error);

      // hesitationTimerSeconds carries the measured duration into the Socratic
      // prompt's trace summary ("השתהות Ns"). Nothing else advances it — the
      // store's per-second ticker was dead code — so writing it here is what
      // keeps that summary from always reading 0s. recordUserInteraction() and
      // resetHesitationTimer() zero it again on the next cognitive action.
      useWorkspaceStore.setState((s: any) => ({
        hesitationCount: s.hesitationCount + 1,
        hesitationTimerSeconds: measuredSeconds,
      }));
      if (onHesitationRef.current) {
        onHesitationRef.current();
      }
    }, SOCRATIC_STAGE_SECONDS * 1000);

    // Module 18 §ב — the teacher-facing stage, on the calibrated threshold.
    // Separate from the card above so that an admin who widens the radar to
    // 60s widens only what she watches; the child still gets the card at 45,
    // as Module 12 requires. At the default 45 the two fire together, which
    // is the behaviour this replaced.
    radarTimeoutRef.current = setTimeout(() => {
      const uid = currentStudentUid();
      if (!uid) return;
      // On the server clock, like the heartbeat (core/presence.ts): the teacher
      // counts "היסוס: N שנ׳" from this stamp, and the tablet's own clock put
      // its error into that number.
      throttledRtdbUpdate(`users/students/${uid}`, { hesitating: {
        hesitating: true,
        timestamp: serverNow()
      } }).catch(console.error);
      hesitatingPublishedRef.current = true;
    }, getHesitationThresholdSeconds() * 1000);
  }, [isActive]); // ← onHesitationDetected intentionally removed from deps

  // Module 18 §ב: YELLOW means hesitating now. The flag was written at second
  // 45 and never cleared, and the radar did not read it: it multiplied a COUNT
  // of hesitations instead, so one pause kept a tile yellow until the next
  // exercise, and a pause in the last diagnostic task kept it yellow in every
  // later meeting. The learner's next cognitive action clears the flag; so does
  // opening the workspace, for a flag an older version left behind.
  const clearHesitating = useCallback(() => {
    const uid = currentStudentUid();
    if (!uid) return;
    throttledRtdbUpdate(`users/students/${uid}`, { hesitating: { hesitating: false, timestamp: serverNow() } }).catch(() => {});
    hesitatingPublishedRef.current = false;
  }, []);

  useEffect(() => {
    if (!isActive) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (gridTimeoutRef.current) {
        clearTimeout(gridTimeoutRef.current);
      }
      if (radarTimeoutRef.current) {
        clearTimeout(radarTimeoutRef.current);
      }
      // The pause is not hesitation: while the projector is on, the lesson is
      // paused or closed, or the meeting is done, the child has nothing to
      // work on. A tile left yellow kept counting "היסוס: N שנ׳" through it.
      if (hesitatingPublishedRef.current) clearHesitating();
      return;
    }

    // Module 10 §ב: "הטיימר מתאפס על פעולות קוגניטיביות בלבד (גרירת לבנים,
    // הקלדה, המרה). תנועות עכבר אינן מאפסות את הטיימר."
    //
    // This used to listen for mousedown/touchstart/keydown/dragstart on the
    // window, which reset the clock on ANY click anywhere — including a click
    // on empty background. That inverted the module's intent: a learner who is
    // stuck and fidgeting with the mouse never reached 30s, so the adaptive
    // grid and the Socratic card never opened for exactly the learner who
    // needed them, while a learner sitting still and thinking got them.
    //
    // Instead of guessing intent from input events, watch the task state the
    // three cognitive actions actually change:
    //   counts        — block placement, decomposition and grouping
    //   answerDigits  — digits typed into the result row
    //   carryDigits   — digits typed into the memory circles
    //   selectedChoiceId — the learner answering a closed-choice task, which
    //                   offers no drag, typing or conversion at all and would
    //                   otherwise sit permanently at "hesitating"
    // A mouse move, a stray click, or a click on a lobby button changes none of
    // these, so none of them resets the clock — which is the rule.
    //   operandDigits — digits typed into the hidden operand cells of a skeleton
    //                   exercise; the only action some meeting-8 exercises offer
    //   probeAnswer   — the answer typed into a meeting-2 probe
    // Without these two a learner who was busy typing was reported as hesitating
    // at second 45, got a coaching card, and turned yellow then red on the radar.
    // The exercise itself: PRD Module 12 §ב counts the pause "באותו תרגיל". A
    // new exercise that opens on the same board (empty after the trash, or
    // the same preset) used to inherit the previous exercise's pause, and the
    // card opened seconds into it, before any action.
    const selectCognitiveState = (s: any) =>
      `${s.sessionNumber}:${s.standardTaskIdx}|${JSON.stringify(s.counts)}|${JSON.stringify(s.answerDigits)}|${JSON.stringify(s.carryDigits)}|${s.selectedChoiceId ?? ''}|${JSON.stringify(s.operandDigits ?? {})}|${s.probeAnswer ?? ''}`;

    clearHesitating();

    let lastSignature = selectCognitiveState(useWorkspaceStore.getState());
    let lastHelpState = useWorkspaceStore.getState().helpState;
    let lastGridOpen = useWorkspaceStore.getState().isAdditionHelperOpen;
    const unsubscribe = useWorkspaceStore.subscribe((state: any) => {
      const next = selectCognitiveState(state);
      if (next !== lastSignature) {
        lastSignature = next;
        if (hesitatingPublishedRef.current) clearHesitating();
        resetTimeout();
      }
      // The coaching card closed: a grid that came due behind it opens now,
      // on the same rule as at 30 seconds — and only into an exercise the
      // learner is still working on. The card also closes when the exercise
      // was just solved (the last one drops its card on the way to the next
      // screen): the wait ends there, and nothing opens. (If this same change
      // was a cognitive action, resetTimeout above has already cleared the wait.)
      // The grid opened, by any way (the learner's press on its tab under the
      // card): the wait is over. If the learner then closes it, it stays
      // closed — the card's closing does not open it again.
      if (state.isAdditionHelperOpen && !lastGridOpen) gridDeferredRef.current = false;
      lastGridOpen = state.isAdditionHelperOpen;
      // "Closed" from the card or from the beat before it: a card refused
      // after the beat releases the wait too.
      const cardClosed = lastHelpState !== 'closed' && state.helpState === 'closed';
      lastHelpState = state.helpState;
      if (cardClosed && gridDeferredRef.current) {
        gridDeferredRef.current = false;
        if (
          state.flowStatus === 'task' &&
          !state.awaitingNext &&
          shouldOpenAdaptiveGrid({
            supportProfileId: state.activeSupportProfileId,
            sessionNumber: state.sessionNumber,
            isAdditionHelperOpen: state.isAdditionHelperOpen,
          }) &&
          isAdditionExercise(selectStandardTask(state))
        ) {
          state.openAdditionHelper();
        }
      }
    });

    // D2 (owner, 1.10.2026): a read-aloud press, work in the addition grid,
    // and typing or sending in the chat restart the count too
    // (isLearnerActivityEvent). Capture phase: a control that stops the event
    // still counts. Only those controls: a click anywhere else is still no
    // action (Module 10 §ב — mouse movements do not reset the clock).
    const onActivity = (event: Event) => {
      if (!isLearnerActivityEvent(event)) return;
      if (hesitatingPublishedRef.current) clearHesitating();
      resetTimeout();
    };
    const activityEvents = ['click', 'input'] as const;
    for (const type of activityEvents) document.addEventListener(type, onActivity, true);

    // Start initial timeout
    resetTimeout();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (gridTimeoutRef.current) {
        clearTimeout(gridTimeoutRef.current);
      }
      if (radarTimeoutRef.current) {
        clearTimeout(radarTimeoutRef.current);
      }
      unsubscribe();
      for (const type of activityEvents) document.removeEventListener(type, onActivity, true);
    };
  }, [isActive, resetTimeout, clearHesitating]);
}
