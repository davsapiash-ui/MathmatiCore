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
    const unsub = onValue(sessionRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        if (val && val.active === true) {
          setSession({
            active: true,
            sessionNumber: Number(val.sessionNumber || 1),
            startedAt: Number(val.startedAt || Date.now()),
            teacherId: val.teacherId,
          });
          return;
        }
      }
      setSession(null);
    });
    return () => unsub();
  }, []);

  return session;
}
