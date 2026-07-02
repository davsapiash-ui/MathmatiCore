import { useState, useEffect, useRef, useCallback } from 'react';
import { database } from '@/infrastructure/firebase';
import { ref, push } from 'firebase/database';
import { useAuthStore } from './useAuthStore';

interface RadarOptions {
  taskId: string;
  idleThresholdMs?: number;
}

export function useSilentRadar({ taskId, idleThresholdMs = 30000 }: RadarOptions) {
  const { user } = useAuthStore();
  const [undoCount, setUndoCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentId = user?.uid || 'anonymous-student';

  const reportHesitation = useCallback(() => {
    // In the future this can write to Firebase
    console.log(`[Silent Radar] Hesitation detected for ${studentId} on task ${taskId}. Reporting to Firebase...`);
    
    // Example payload for the dashboard
    const payload = {
      type: 'HESITATION',
      studentId: user?.displayName || studentId,
      taskId,
      timestamp: Date.now(), // Use serverTimestamp() in real app
      unread: true
    };
    
    // Try reporting if database is connected, else just log
    try {
      push(ref(database, 'radar_alerts'), payload);
    } catch (err) {
      console.warn("Could not write to Firebase, radar alert logged locally.", err);
    }
  }, [studentId, taskId, user?.displayName]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      reportHesitation();
    }, idleThresholdMs);
  }, [idleThresholdMs, reportHesitation]);

  // Start timer on mount
  useEffect(() => {
    resetTimer();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [resetTimer]);

  const registerInteraction = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  const registerUndo = useCallback(() => {
    setUndoCount(prev => prev + 1);
    resetTimer();
    
    // Also track excessive undos as "Passive Cruising"
    if (undoCount + 1 >= 5) {
      console.log(`[Silent Radar] Excessive undos (Passive Cruising) detected for ${studentId} on task ${taskId}.`);
      try {
        push(ref(database, 'radar_alerts'), {
          type: 'PASSIVE_CRUISING',
          studentId: user?.displayName || studentId,
          taskId,
          timestamp: Date.now(),
          unread: true
        });
      } catch (err) {
        console.warn("Could not write passive cruising to Firebase.");
      }
    }
  }, [resetTimer, studentId, taskId, undoCount, user?.displayName]);

  return {
    undoCount,
    registerInteraction,
    registerUndo
  };
}
