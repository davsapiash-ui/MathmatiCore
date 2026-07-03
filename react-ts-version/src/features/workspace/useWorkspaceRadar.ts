import { useEffect, useRef } from 'react';
import { ref, push } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
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

type AlertType = 'HESITATION' | 'PASSIVE_DRIFTING' | 'HINT_REQUESTED' | 'TASK_ERROR';

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

      const alert = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        student: u?.username ?? 'unknown',
        username: u?.username ?? 'unknown',
        studentName: u?.displayName ?? u?.username ?? 'תלמיד',
        taskId: taskIdRef.current,
        sessionNumber,
        timestamp: Date.now(),
        unread: true,
        ...data,
      };
      // Fire-and-forget: monitoring must never block or surface to the student.
      try {
        push(ref(database, 'radar_alerts'), alert);
      } catch {
        /* dev config without live Firebase — silently drop */
      }
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
        // Tab hidden = the student isn't struggling, they're away; re-arm silently.
        if (document.hidden) {
          armHesitationTimer();
          return;
        }
        sendAlert('HESITATION', { idleMs: HESITATION_THRESHOLD_MS });
        // Fire once; do not re-arm until the next student action (vanilla behavior).
        hesitationArmed.current = false;
      }, HESITATION_THRESHOLD_MS);
    }

    registerRadar({
      recordAction: () => {
        hesitationArmed.current = true;
        armHesitationTimer();
      },
      recordDelete: () => {
        const now = Date.now();
        deleteTimestamps.current = [...deleteTimestamps.current.filter((t) => now - t < RAPID_DELETE_WINDOW_MS), now];
        if (deleteTimestamps.current.length === RAPID_DELETE_THRESHOLD) {
          sendAlert('PASSIVE_DRIFTING', { deleteCount: deleteTimestamps.current.length });
        }
      },
      recordUndo: () => {
        hesitationArmed.current = true;
        armHesitationTimer();
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

    armHesitationTimer();

    return () => {
      clearHesitationTimer();
      unregisterRadar();
    };
  }, [sessionNumber]);
}
