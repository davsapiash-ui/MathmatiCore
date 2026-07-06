import { useState, useEffect, useRef, useCallback } from 'react';
import { database } from '@/infrastructure/firebase';
import { ref, push } from 'firebase/database';
import { useAuthStore } from './useAuthStore';
import { useStore } from './useStore';

interface RadarOptions {
  taskId: string;
  idleThresholdMs?: number;
}

export function useSilentRadar({ taskId, idleThresholdMs = 30000 }: RadarOptions) {
  const { user } = useAuthStore();
  const { incrementHesitation, incrementUndo } = useStore();
  const [undoCount, setUndoCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentId = user?.uid || 'anonymous-student';

  const reportHesitation = useCallback(() => {
    incrementHesitation(studentId);
    console.log(`[Silent Radar] Hesitation detected for ${studentId} on task ${taskId}.`);
    
    const payload = {
      type: 'HESITATION',
      studentId: user?.displayName || studentId,
      taskId,
      timestamp: Date.now(), 
      unread: true
    };
    
    try {
      push(ref(database, 'radar_alerts'), payload);
    } catch (err) {
      console.warn("Could not write to Firebase, radar alert logged locally.", err);
    }
  }, [studentId, taskId, user?.displayName, incrementHesitation]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      reportHesitation();
    }, idleThresholdMs);
  }, [idleThresholdMs, reportHesitation]);

  useEffect(() => {
    const handleActivity = () => {
      resetTimer();
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    resetTimer();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [resetTimer]);

  const registerUndo = useCallback(() => {
    setUndoCount(prev => prev + 1);
    incrementUndo(studentId);
    resetTimer();
    
    if (undoCount + 1 >= 5) {
      try {
        push(ref(database, 'radar_alerts'), {
          type: 'PASSIVE_CRUISING',
          studentId: user?.displayName || studentId,
          taskId,
          timestamp: Date.now(),
          unread: true
        });
      } catch {
        console.warn("Could not write passive cruising to Firebase.");
      }
    }
  }, [resetTimer, studentId, taskId, undoCount, user?.displayName, incrementUndo]);

  return {
    undoCount,
    registerUndo
  };
}
