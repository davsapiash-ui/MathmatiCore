import { useEffect, useRef, useCallback } from 'react';
import {
  useAuthStore,
  STUDENT_WINDOW_CLOSE_TIMEOUT_MS,
  touchStudentActivity,
  stampStudentWindowClosed,
} from './useAuthStore';
import { useNavigate } from 'react-router-dom';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity for staff

export function useIdleTimeout() {
  const { user, role, isAuthenticated, logout, isTokenExpired } = useAuthStore();
  const navigate = useNavigate();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      touchStudentActivity();
    }
    timeoutRef.current = setTimeout(() => {
      if (isAuthenticated) {
        handleLogout(isStudent ? 'החיבור נותק לאחר 5 דקות של חוסר פעילות.' : 'התנתקת עקב חוסר פעילות.');
      }
    }, currentIdleTimeout);
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

    // 2. Window close & background visibility handling for 5-minute disconnect
    const handleWindowUnload = () => {
      if (isStudent) {
        stampStudentWindowClosed();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (isStudent) {
          stampStudentWindowClosed();
        }
      } else if (document.visibilityState === 'visible') {
        if (isStudent) {
          if (isTokenExpired()) {
            handleLogout('החיבור נותק לאחר 5 דקות מסגירת החלון / שהייה ברקע.');
            return;
          }
          touchStudentActivity();
          resetTimeout();
        }
      }
    };

    window.addEventListener('beforeunload', handleWindowUnload);
    window.addEventListener('pagehide', handleWindowUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Periodic Expiry Check (every 10s for student, every 60s for others)
    const checkExpiry = () => {
      if (isTokenExpired()) {
        handleLogout(isStudent ? 'החיבור נותק לאחר 5 דקות מסגירת החלון / חוסר פעילות.' : 'פג תוקף אסימון ההתחברות (8 שעות). אנא בצע כניסה מחודשת.');
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
