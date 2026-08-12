import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

export interface ActiveClassSession {
  active: boolean;
  sessionNumber: number;
  startedAt: number;
  teacherId?: string;
}

export function useActiveClassSession() {
  const [session, setSession] = useState<ActiveClassSession | null>(null);

  useEffect(() => {
    const sessionRef = ref(database, 'active_class_session');
    const presenceRef = ref(database, 'active_teacher_presence');

    let currentSessionVal: any = null;
    let currentPresenceVal: any = null;

    const evaluate = () => {
      if (!currentSessionVal || !currentSessionVal.active) {
        setSession(null);
        return;
      }

      // Check if teacher presence is online and fresh (last heartbeat within 90s)
      const isTeacherOnline = Boolean(
        currentPresenceVal &&
        currentPresenceVal.online &&
        (Date.now() - Number(currentPresenceVal.lastHeartbeat || 0) < 90000)
      );

      if (!isTeacherOnline) {
        // Teacher computer is NOT connected or active!
        setSession(null);
        return;
      }

      setSession({
        active: true,
        sessionNumber: Number(currentSessionVal.sessionNumber || 1),
        startedAt: Number(currentSessionVal.startedAt || Date.now()),
        teacherId: currentSessionVal.teacherId,
      });
    };

    const unsubSession = onValue(sessionRef, (snap) => {
      currentSessionVal = snap.exists() ? snap.val() : null;
      evaluate();
    });

    const unsubPresence = onValue(presenceRef, (snap) => {
      currentPresenceVal = snap.exists() ? snap.val() : null;
      evaluate();
    });

    const timer = setInterval(evaluate, 10000);

    return () => {
      unsubSession();
      unsubPresence();
      clearInterval(timer);
    };
  }, []);

  return session;
}
