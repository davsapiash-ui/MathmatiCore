import { useEffect, useRef } from 'react';
import { ref, push } from 'firebase/database';
import { database, authReady } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { registerRadar, unregisterRadar } from './radarBus';

/**
 * הרדאר הפדגוגי השקט — port of vanilla_audit/js/radar.js, spec-corrected.
 * מנטר בסתר: היסוס (30 שניות לפי האפיון),
 * מחיקות מהירות (3 בתוך 3 שניות), בקשות עזרה, וטעויות במשימות.
 * לעולם, בשום מצב, לא מציג דבר לתלמיד. התראות נשלחות לדשבורד המורה בלבד.
 */

const HESITATION_THRESHOLD_MS = 30000; // per spec (מסמך רצף הפעילויות, מפגש 2)
const RAPID_DELETE_THRESHOLD = 3;
const RAPID_DELETE_WINDOW_MS = 3000;

type AlertType = 'HESITATION' | 'PASSIVE_DRIFTING' | 'HINT_REQUESTED' | 'TASK_ERROR' | 'TAB_ESCAPE';

export function useWorkspaceRadar(sessionNumber: number) {
  const user = useAuthStore((s) => s.user);

  const taskIdRef = useRef<string>('');
  const hesitationTimer = useRef<number | null>(null);
  const hesitationArmed = useRef(true);
  const deleteTimestamps = useRef<number[]>([]);
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    function sendAlert(type: AlertType, data: Record<string, unknown> = {}) {
      const u = userRef.current;
      if (u?.role === 'teacher') return; // Do not send alerts in Projector Sandbox Mode

      // uid is the ONE canonical identity field (Login stores {uid, role, displayName}).
      const alert = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        student: u?.uid ?? 'unknown',
        username: u?.uid ?? 'unknown',
        studentName: u?.displayName ?? 'תלמיד',
        taskId: taskIdRef.current,
        sessionNumber,
        timestamp: Date.now(),
        unread: true,
        ...data,
      };
      // Fire-and-forget: monitoring must never block or surface to the student.
      // Waits for the auth session first — pre-auth pushes are rejected by the
      // locked rules; async rejections stay silenced with .catch.
      authReady
        .then((ok) => {
          if (!ok) return;
          push(ref(database, 'radar_alerts'), alert).catch(() => {});
        })
        .catch(() => {});
    }

    function clearHesitationTimer() {
      if (hesitationTimer.current !== null) {
        window.clearTimeout(hesitationTimer.current);
        hesitationTimer.current = null;
      }
    }

    function armHesitationTimer() {
      clearHesitationTimer();
      hesitationTimer.current = window.setTimeout(() => {
        sendAlert('HESITATION', { idleMs: HESITATION_THRESHOLD_MS });
        // Mirror into the workspace store so traceData reaches the teacher at reflection.
        useWorkspaceStore.setState((s) => ({ hesitationCount: s.hesitationCount + 1 }));
        // Fire once; do not re-arm until the next student action (vanilla behavior).
        hesitationArmed.current = false;
      }, HESITATION_THRESHOLD_MS);
    }

    function handleDriftAction() {
      hesitationArmed.current = true;
      armHesitationTimer();
      const now = Date.now();
      deleteTimestamps.current = [...deleteTimestamps.current.filter((t) => now - t < RAPID_DELETE_WINDOW_MS), now];
      if (deleteTimestamps.current.length >= RAPID_DELETE_THRESHOLD) {
        // משיג את התיעוד הכולל מה-Store של המרחב
        const totalDeletions = useWorkspaceStore.getState().undoCount || 0;
        
        sendAlert('PASSIVE_DRIFTING', { 
          recentDeletions: deleteTimestamps.current.length,
          totalDeletionsFromStart: totalDeletions
        });
        
        // איפוס חלון הזמן המקומי בלבד כדי לדרוש רצף מחיקות *חדש* להתראה נוספת
        deleteTimestamps.current = [];
      }
    }

    registerRadar({
      recordAction: () => {
        hesitationArmed.current = true;
        armHesitationTimer();
      },
      recordDelete: () => {
        handleDriftAction();
      },
      recordUndo: () => {
        handleDriftAction();
      },
      recordHintRequest: () => {
        sendAlert('HINT_REQUESTED');
        hesitationArmed.current = true;
        armHesitationTimer();
      },
      recordTaskError: (taskId, detail) => {
        sendAlert('TASK_ERROR', { taskId, detail });
      },
      setTask: (taskId) => {
        taskIdRef.current = taskId;
        deleteTimestamps.current = [];
        hesitationArmed.current = true;
        armHesitationTimer();
      },
    });

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendAlert('TAB_ESCAPE', { reason: 'Student switched tabs or minimized browser' });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    armHesitationTimer();

    return () => {
      clearHesitationTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unregisterRadar();
    };
  }, [sessionNumber]);
}
