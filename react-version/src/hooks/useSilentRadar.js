import { useState, useEffect, useCallback, useRef } from 'react';

const IDLE_TIMEOUT_MS = 30000; // 30 seconds

export default function useSilentRadar(studentId) {
  const [hesitationEvents, setHesitationEvents] = useState(0);
  const [undoClicks, setUndoClicks] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  
  const timerRef = useRef(null);

  const resetTimer = useCallback(() => {
    setHasInteracted(true);
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    // Start idle timer
    timerRef.current = setTimeout(() => {
      // Record a hesitation event
      setHesitationEvents(prev => prev + 1);
      
      // MOCK: Async network request to update Teacher Dashboard
      console.log(`[Silent Radar] Async: Hesitation recorded for student ${studentId}.`);
      
      // Auto-restart timer to continue tracking long pauses
      resetTimer();
    }, IDLE_TIMEOUT_MS);
  }, [studentId]);

  const registerUndo = useCallback(() => {
    setUndoClicks(prev => prev + 1);
    resetTimer(); // An undo is an interaction
  }, [resetTimer]);

  // Start the timer when the hook mounts
  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  return {
    traceData: {
      hesitationEvents,
      undoClicks,
    },
    hasInteracted,
    resetTimer,
    registerUndo
  };
}
