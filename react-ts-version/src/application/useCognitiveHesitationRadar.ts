import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from './useAuthStore';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { database } from '@/infrastructure/firebase';
import { ref, set } from 'firebase/database';
import { emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';
import { getHesitationThresholdSeconds, useHesitationThresholdSeconds } from '@/core/hesitationCalibration';
import { GRID_STAGE_SECONDS, shouldOpenAdaptiveGrid } from '@/core/hesitationStages';

interface UseCognitiveHesitationRadarProps {
  isActive: boolean;
  onHesitationDetected?: () => void;
}

/**
 * A silent pedagogical radar that tracks time between clicks/interactions.
 *
 * It owns the entire Module 10 / Module 12 hesitation hierarchy, in two stages
 * measured from the same "last cognitive action" mark:
 *
 *   30s — Module 10: the adaptive addition grid opens, but only for learners
 *         carrying the `enhanced_cognitive_support` profile. Standard learners
 *         get no visible support at this stage.
 *   45s (Module 26 calibrated threshold) — Module 12: the silent teacher alert
 *         is emitted and the Socratic coach is offered.
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Module 10's 30s grid stage runs on its own deadline so that reaching it
  // never consumes or delays the 45s Socratic stage below.
  const gridTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store callback in a ref so changes to it don't reset the timer
  const onHesitationRef = useRef(onHesitationDetected);
  useEffect(() => { onHesitationRef.current = onHesitationDetected; }, [onHesitationDetected]);

  const lastActivityRef = useRef<number>(Date.now());
  // Module 26: subscribes this hook to the admin-configured threshold
  // (system_control/trace_calibration, default 45s per PRD). The return
  // value itself isn't needed here — resetTimeout reads the live value
  // directly at fire time via getHesitationThresholdSeconds() below — this
  // call just keeps the shared listener alive for as long as this hook is
  // mounted.
  useHesitationThresholdSeconds();

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (gridTimeoutRef.current) {
      clearTimeout(gridTimeoutRef.current);
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
      const { user } = useAuthStore.getState();
      const userId = user?.uid || user?.id;
      
      if (!userId) return;

      AuditLogger.log(
        "HESITATION", 
        userId as string, 
        "Student hesitated for >45s without interacting. Silent alert triggered."
      );
      
      const wsState = useWorkspaceStore.getState();
      const currentTasks = getActiveTasks(wsState);
      const currentTask = currentTasks[wsState.standardTaskIdx];
      const activePlace = wsState.focusedPlace || 'units';
      const colIndex = activePlace === 'thousands' ? 3 : activePlace === 'hundreds' ? 2 : activePlace === 'tens' ? 1 : 0;
      const measuredSeconds = Math.max(
        getHesitationThresholdSeconds(),
        Math.round((Date.now() - lastActivityRef.current) / 1000)
      );

      // Canonical HESITATION_DETECTED telemetry event (Module 5 §C & Appendix A §3)
      emitTelemetry({
        session_id: `session_${wsState.sessionNumber}_student_${userId}`,
        student_id: userId,
        exercise_id: currentTask?.id || `ex_${wsState.sessionNumber}_01`,
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
      set(ref(database, `users/students/${userId}/hesitating`), {
        hesitating: true,
        timestamp: Date.now()
      }).catch(console.error);

      if (onHesitationRef.current) {
        onHesitationRef.current();
      }
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
    const selectCognitiveState = (s: any) =>
      `${JSON.stringify(s.counts)}|${JSON.stringify(s.answerDigits)}|${JSON.stringify(s.carryDigits)}|${s.selectedChoiceId ?? ''}`;

    let lastSignature = selectCognitiveState(useWorkspaceStore.getState());
    const unsubscribe = useWorkspaceStore.subscribe((state: any) => {
      const next = selectCognitiveState(state);
      if (next !== lastSignature) {
        lastSignature = next;
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
      unsubscribe();
    };
  }, [isActive, resetTimeout]);
}
