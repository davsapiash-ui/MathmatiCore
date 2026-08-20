import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { database, auth, authReady } from '@/infrastructure/firebase';

export interface ActiveClassSession {
  active: boolean;
  sessionNumber: number | null;
  startedAt: number | null;
  teacherId?: string;
  isLoaded: boolean;
}

export function useActiveClassSession() {
  const [session, setSession] = useState<ActiveClassSession>({
    active: false,
    sessionNumber: null,
    startedAt: null,
    isLoaded: false,
  });

  useEffect(() => {
    let unsubDB: (() => void) | null = null;
    let isSubscribed = true;
    let retryTimer: NodeJS.Timeout | null = null;

    const setupListener = () => {
      if (!isSubscribed) return;
      if (unsubDB) {
        unsubDB();
        unsubDB = null;
      }
      try {
        const sessionRef = ref(database, 'active_class_session');
        unsubDB = onValue(
          sessionRef,
          (snap) => {
            if (!isSubscribed) return;
            if (snap.exists()) {
              const val = snap.val();
              if (val && val.active === true) {
                setSession({
                  active: true,
                  sessionNumber: Number(val.sessionNumber || 1),
                  startedAt: Number(val.startedAt || Date.now()),
                  teacherId: val.teacherId,
                  isLoaded: true,
                });
                return;
              }
            }
            setSession({
              active: false,
              sessionNumber: null,
              startedAt: null,
              isLoaded: true,
            });
          },
          (err) => {
            console.warn('[useActiveClassSession] Listener notice:', err);
            if (isSubscribed) {
              setSession((prev) => ({ ...prev, isLoaded: true }));
              if (retryTimer) clearTimeout(retryTimer);
              retryTimer = setTimeout(() => {
                if (isSubscribed) setupListener();
              }, 1200);
            }
          }
        );
      } catch (e) {
        console.warn('[useActiveClassSession] setup error:', e);
      }
    };

    // 1. Initial setup
    setupListener();

    // 2. Re-attach on authReady resolution
    authReady.then(() => {
      if (isSubscribed) setupListener();
    }).catch(console.warn);

    // 3. Re-attach on Firebase auth changes (e.g. anonymous token issued)
    let unsubAuth: (() => void) | null = null;
    try {
      if (auth && 'onAuthStateChanged' in auth) {
        unsubAuth = onAuthStateChanged(auth, (u) => {
          if (u && isSubscribed) {
            setupListener();
          }
        });
      }
    } catch (e) {
      console.warn('[useActiveClassSession] auth listen error:', e);
    }

    return () => {
      isSubscribed = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsubDB) unsubDB();
      if (unsubAuth) unsubAuth();
    };
  }, []);

  return session;
}

