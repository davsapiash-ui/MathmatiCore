import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from './useAuthStore';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { database } from '@/infrastructure/firebase';
import { ref, set } from 'firebase/database';
import { emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';

const HESITATION_THRESHOLD_MS = 45 * 1000; // 45 seconds per PRD v7.0 Module 10 & 12

interface UseCognitiveHesitationRadarProps {
  isActive: boolean;
  onHesitationDetected?: () => void;
}

/**
 * A silent pedagogical radar that tracks time between clicks/interactions.
 * Sends a silent alert to the teacher dashboard if the student 
 * exhibits 45 seconds of continuous cognitive hesitation.
 * Ensures NO visual indication is shown to the student.
 */
export function useCognitiveHesitationRadar({ 
  isActive, 
  onHesitationDetected 
}: UseCognitiveHesitationRadarProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store callback in a ref so changes to it don't reset the timer
  const onHesitationRef = useRef(onHesitationDetected);
  useEffect(() => { onHesitationRef.current = onHesitationDetected; }, [onHesitationDetected]);

  const lastActivityRef = useRef<number>(Date.now());

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    lastActivityRef.current = Date.now();
    
    if (!isActive) return;

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
      const measuredSeconds = Math.max(45, Math.round((Date.now() - lastActivityRef.current) / 1000));

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

      useWorkspaceStore.setState((s: any) => ({ hesitationCount: s.hesitationCount + 1 }));
      set(ref(database, `users/students/${userId}/hesitating`), {
        hesitating: true,
        timestamp: Date.now()
      }).catch(console.error);

      if (onHesitationRef.current) {
        onHesitationRef.current();
      }
    }, HESITATION_THRESHOLD_MS);
  }, [isActive]); // ← onHesitationDetected intentionally removed from deps

  useEffect(() => {
    if (!isActive) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    // Events that indicate active engagement
    const events = ['mousedown', 'touchstart', 'keydown', 'dragstart'];
    
    const handleActivity = () => {
      resetTimeout();
    };

    events.forEach(event => {
      // capture phase to catch it early
      window.addEventListener(event, handleActivity, { passive: true, capture: true });
    });

    // Start initial timeout
    resetTimeout();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, handleActivity, { capture: true });
      });
    };
  }, [isActive, resetTimeout]);
}
