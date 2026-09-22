import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore, currentStudentUid } from './useAuthStore';
import { useWorkspaceStore, activeExerciseId } from '@/application/useWorkspaceStore';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { database } from '@/infrastructure/firebase';
import { ref, set } from 'firebase/database';
import { emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';
import { getHesitationThresholdSeconds, useHesitationThresholdSeconds } from '@/core/hesitationCalibration';
import { GRID_STAGE_SECONDS, SOCRATIC_STAGE_SECONDS, shouldOpenAdaptiveGrid } from '@/core/hesitationStages';

interface UseCognitiveHesitationRadarProps {
  isActive: boolean;
  onHesitationDetected?: () => void;
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
    
    if (!isActive) return;

    // Module 10 — stage 1 (30s): open the adaptive addition grid. The rule for
    // who receives it lives in shouldOpenAdaptiveGrid(); this timer only
    // decides when to ask.
    gridTimeoutRef.current = setTimeout(() => {
      const wsState = useWorkspaceStore.getState();
      const authUser = useAuthStore.getState().user;
      const supportProfileId =
        (authUser as any)?.support_profile_id ?? (wsState as any).support_profile_id;
      if (
        shouldOpenAdaptiveGrid({
          supportProfileId,
          sessionNumber: wsState.sessionNumber,
          isAdditionHelperOpen: wsState.isAdditionHelperOpen,
        })
      ) {
        wsState.openAdditionHelper();
      }
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
      const activePlace = wsState.focusedPlace || 'units';
      const colIndex = activePlace === 'thousands' ? 3 : activePlace === 'hundreds' ? 2 : activePlace === 'tens' ? 1 : 0;
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
      set(ref(database, `users/students/${uid}/hesitating`), {
        hesitating: true,
        timestamp: Date.now()
      }).catch(console.error);
      hesitatingPublishedRef.current = true;
    }, getHesitationThresholdSeconds() * 1000);
  }, [isActive]); // ← onHesitationDetected intentionally removed from deps

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
    const selectCognitiveState = (s: any) =>
      `${JSON.stringify(s.counts)}|${JSON.stringify(s.answerDigits)}|${JSON.stringify(s.carryDigits)}|${s.selectedChoiceId ?? ''}|${JSON.stringify(s.operandDigits ?? {})}|${s.probeAnswer ?? ''}`;

    // Module 18 §ב: YELLOW means hesitating now. The flag was written at second
    // 45 and never cleared, and the radar did not read it: it multiplied a COUNT
    // of hesitations instead, so one pause kept a tile yellow until the next
    // exercise, and a pause in the last diagnostic task kept it yellow in every
    // later meeting. The learner's next cognitive action clears the flag; so does
    // opening the workspace, for a flag an older version left behind.
    const clearHesitating = () => {
      const uid = currentStudentUid();
      if (!uid) return;
      set(ref(database, `users/students/${uid}/hesitating`), { hesitating: false, timestamp: Date.now() }).catch(() => {});
      hesitatingPublishedRef.current = false;
    };
    clearHesitating();

    let lastSignature = selectCognitiveState(useWorkspaceStore.getState());
    const unsubscribe = useWorkspaceStore.subscribe((state: any) => {
      const next = selectCognitiveState(state);
      if (next !== lastSignature) {
        lastSignature = next;
        if (hesitatingPublishedRef.current) clearHesitating();
        resetTimeout();
      }
    });

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
    };
  }, [isActive, resetTimeout]);
}
