import { useState, useEffect, useRef } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { database, auth, authReady } from '@/infrastructure/firebase';
import { getClassSessionStatus, isClassSessionLive, type ActiveClassSessionRecord, type ClassSessionStatus } from '@/core/classSession';

export interface ActiveClassSession {
  /** The meeting is open (active or paused). */
  active: boolean;
  /** 'active' | 'paused' | 'closed' — see core/classSession.ts. */
  status: ClassSessionStatus;
  sessionNumber: number | null;
  startedAt: number | null;
  teacherId?: string;
  isLoaded: boolean;
}

export function useActiveClassSession() {
  const [session, setSession] = useState<ActiveClassSession>({
    active: false,
    status: 'closed',
    sessionNumber: null,
    startedAt: null,
    isLoaded: false,
  });

  const lastValRef = useRef<ActiveClassSessionRecord | null>(null);

  useEffect(() => {
    let unsubDB: (() => void) | null = null;
    let isSubscribed = true;
    let retryTimer: NodeJS.Timeout | null = null;

    // Session is live only while the teacher-disconnect 5-minute grace window
    // has not expired (core/classSession.ts).
    const applySessionState = () => {
      if (!isSubscribed) return;
      const val = lastValRef.current;
      if (val && isClassSessionLive(val)) {
        setSession({
          active: true,
          status: getClassSessionStatus(val),
          sessionNumber: Number(val.sessionNumber || 1),
          startedAt: Number(val.startedAt || Date.now()),
          teacherId: val.teacherId,
          isLoaded: true,
        });
        return;
      }
      setSession({
        active: false,
        status: 'closed',
        sessionNumber: null,
        startedAt: null,
        isLoaded: true,
      });
    };

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
            lastValRef.current = snap.exists() ? snap.val() : null;
            applySessionState();
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

    // 1. Initial setup + periodic grace-window re-check (expiry emits no server event)
    setupListener();
    const graceTimer = setInterval(applySessionState, 30000);

    // 1b. Self-healing read. The realtime listener is the primary signal, but a
    // learner's tab can lose it silently (socket dropped and not yet
    // re-established, tab throttled in the background, listener detached
    // during a token refresh). Then the teacher closes the session and the
    // learner keeps working as if nothing happened. A fresh read every 15s and
    // on every return to the foreground bounds that to seconds, at one small
    // read per learner.
    const refreshFromServer = () => {
      if (!isSubscribed) return;
      get(ref(database, 'active_class_session'))
        .then((snap) => {
          if (!isSubscribed) return;
          lastValRef.current = snap.exists() ? snap.val() : null;
          applySessionState();
        })
        .catch(() => { /* the listener and the next tick will try again */ });
    };
    const refreshTimer = setInterval(refreshFromServer, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') refreshFromServer(); };
    document.addEventListener('visibilitychange', onVisible);

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
      clearInterval(graceTimer);
      clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', onVisible);
      if (retryTimer) clearTimeout(retryTimer);
      if (unsubDB) unsubDB();
      if (unsubAuth) unsubAuth();
    };
  }, []);

  return session;
}

