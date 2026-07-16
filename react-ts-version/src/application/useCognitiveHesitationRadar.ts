import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from './useAuthStore';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';

const HESITATION_THRESHOLD_MS = 30 * 1000; // 30 seconds

interface UseCognitiveHesitationRadarProps {
  isActive: boolean;
  onHesitationDetected?: () => void;
}

/**
 * A silent pedagogical radar that tracks time between clicks/interactions.
 * Sends a silent alert to the teacher dashboard if the student 
 * exhibits 30 seconds of continuous cognitive hesitation.
 * Ensures NO visual indication is shown to the student.
 */
export function useCognitiveHesitationRadar({ 
  isActive, 
  onHesitationDetected 
}: UseCognitiveHesitationRadarProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (!isActive) return;

    timeoutRef.current = setTimeout(() => {
      // Trigger silent dashboard alert payload
      const { user } = useAuthStore.getState();
      const userId = user?.uid || user?.id || "unknown_student";
      
      AuditLogger.log(
        "COGNITIVE_HESITATION_ALERT", 
        userId as string, 
        "Student hesitated for >30s without interacting. Silent alert triggered."
      );
      
      // Deliberately NOT calling onHesitationDetected() by default 
      // to ensure NO visual indication is shown to the student, 
      // but we leave the optional callback in case it's needed for state logging later.
      if (onHesitationDetected && false) {
        onHesitationDetected?.();
      }
    }, HESITATION_THRESHOLD_MS);
  }, [isActive, onHesitationDetected]);

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
