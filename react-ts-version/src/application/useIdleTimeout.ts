import { useEffect, useRef, useCallback } from 'react';
import {
  useAuthStore,
  STUDENT_WINDOW_CLOSE_TIMEOUT_MS,
  touchStudentActivity,
  stampStudentWindowClosed,
  STORAGE_KEY_STAFF_LAST_ACTIVE,
} from './useAuthStore';
import { useNavigate } from 'react-router-dom';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity for staff

/**
 * The 30-minute staff limit is the browser's, not the tab's. A staff sign-out
 * signs every tab of the browser out of Firebase (one Firebase user per
 * profile), so a per-tab timer let an untouched projector window sign the
 * teacher out of the dashboard she was working in. Each tab records activity
 * here, and a tab whose timer runs out first checks whether another tab was
 * used since. Writes are spaced out: the events below fire many times a second.
 */
const STAFF_ACTIVITY_WRITE_EVERY_MS = 5 * 1000;

function readStaffLastActive(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STAFF_LAST_ACTIVE);
    const value = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStaffLastActive(now: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_STAFF_LAST_ACTIVE, String(now));
  } catch {
    // Storage unavailable: the tab's own timer still applies.
  }
}

export function useIdleTimeout() {
  const { user, role, isAuthenticated, logout, isTokenExpired } = useAuthStore();
  const navigate = useNavigate();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staffStampWrittenAtRef = useRef(0);
  const tokenCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeRole = role || (user?.role as string) || '';
  const isStudent = activeRole === 'student';
  const currentIdleTimeout = isStudent ? STUDENT_WINDOW_CLOSE_TIMEOUT_MS : IDLE_TIMEOUT_MS;

  const handleLogout = useCallback((reason?: string) => {
    logout();
    navigate('/login', { replace: true, state: { logoutReason: reason } });
  }, [logout, navigate]);

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (isStudent) {
      // A learner is never signed out for sitting still. The timer used to run
      // for them too, on a five-minute constant whose actual job is presence
      // detection, and it fired in exactly the situations the product asks a
      // child to stop touching the screen: the teacher explaining at the
      // projector, a paused session, or a third-grader thinking about
      // 7,651 − 3,381. PRD Module 14 §ב1: "חל איסור מוחלט על ... ניתוק הלומד".
      // Presence is still stamped, so the teacher's dashboard shows them idle,
      // and a genuinely closed window is still handled below.
      touchStudentActivity();
      return;
    }
    const now = Date.now();
    if (now - staffStampWrittenAtRef.current >= STAFF_ACTIVITY_WRITE_EVERY_MS) {
      staffStampWrittenAtRef.current = now;
      writeStaffLastActive(now);
    }
    const expire = () => {
      if (!isAuthenticated) return;
      // Used in another tab since: wait out the rest of its 30 minutes.
      const lastActive = readStaffLastActive();
      const idleFor = lastActive === null ? Infinity : Date.now() - lastActive;
      if (idleFor < currentIdleTimeout) {
        timeoutRef.current = setTimeout(expire, currentIdleTimeout - idleFor);
        return;
      }
      handleLogout('התנתקת עקב חוסר פעילות.');
    };
    timeoutRef.current = setTimeout(expire, currentIdleTimeout);
  }, [isAuthenticated, isStudent, currentIdleTimeout, handleLogout]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial activity touch
    if (isStudent) {
      touchStudentActivity();
    }

    // 1. Inactivity Reset Listeners
    const events = ['mousemove', 'keydown', 'wheel', 'mousedown', 'touchstart', 'touchmove', 'click', 'scroll'];
    
    const handleActivity = () => {
      resetTimeout();
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Start initial inactivity timeout
    resetTimeout();

    // 2. A learner's window that really closed: 5 minutes, then a new sign-in.
    // Only a genuine close counts (pagehide / beforeunload). A hidden page is
    // not a closed window: a tablet's screen lock, a laptop lid, the OS going
    // to sleep, or the child looking at the projector while the teacher
    // explains all hide the page, and none of them may sign the learner out —
    // register: "הטיימר הוסר עבור לומדים; חותם הנוכחות נשאר ... וחלון שנסגר
    // באמת עדיין מטופל"; PRD Module 14 §ב1 forbids disconnecting the learner.
    const handleWindowUnload = () => {
      if (isStudent) {
        stampStudentWindowClosed();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !isStudent) return;
      // Back on screen. A page restored from the back-forward cache did go
      // through pagehide, so its close stamp is honoured; a page that was only
      // hidden or asleep has none, and simply carries on.
      if (isTokenExpired()) {
        handleLogout('החיבור נותק לאחר 5 דקות מסגירת החלון.');
        return;
      }
      touchStudentActivity();
      resetTimeout();
    };

    window.addEventListener('beforeunload', handleWindowUnload);
    window.addEventListener('pagehide', handleWindowUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Periodic Expiry Check (every 10s for student, every 60s for others)
    const checkExpiry = () => {
      if (isTokenExpired()) {
        handleLogout(isStudent ? 'החיבור נותק לאחר 5 דקות מסגירת החלון.' : 'פג תוקף אסימון ההתחברות (8 שעות). אנא בצע כניסה מחודשת.');
      } else if (isStudent) {
        touchStudentActivity();
      }
    };

    const checkIntervalMs = isStudent ? 10 * 1000 : 60 * 1000;
    tokenCheckIntervalRef.current = setInterval(checkExpiry, checkIntervalMs);
    checkExpiry();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (tokenCheckIntervalRef.current) {
        clearInterval(tokenCheckIntervalRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('beforeunload', handleWindowUnload);
      window.removeEventListener('pagehide', handleWindowUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, isStudent, currentIdleTimeout, handleLogout, resetTimeout, isTokenExpired]);
}
