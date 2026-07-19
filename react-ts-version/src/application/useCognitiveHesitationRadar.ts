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
  // Store callback in a ref so changes to it don't reset the timer
  const onHesitationRef = useRef(onHesitationDetected);
  useEffect(() => { onHesitationRef.current = onHesitationDetected; }, [onHesitationDetected]);

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (!isActive) return;

    timeoutRef.current = setTimeout(() => {
      // Trigger silent dashboard alert payload
      const { user } = useAuthStore.getState();
      const userId = user?.uid || user?.id;
      
      if (!userId) return;

      AuditLogger.log(
        "HESITATION", 
        userId as string, 
        "Student hesitated for >30s without interacting. Silent alert triggered."
      );
      
      // onHesitationDetected is intentionally NOT called here — no visual shown to student.
      // The ref is kept for possible future state-logging use.
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
