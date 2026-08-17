import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore, JWT_EXPIRY_MS } from './useAuthStore';
import { useNavigate } from 'react-router-dom';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity

export function useIdleTimeout() {
  const { user, isAuthenticated, logout, isTokenExpired } = useAuthStore();
  const navigate = useNavigate();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleLogout = useCallback((reason?: string) => {
    logout();
    navigate('/login', { replace: true, state: { logoutReason: reason } });
  }, [logout, navigate]);

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      if (isAuthenticated) {
        handleLogout("התנתקת עקב חוסר פעילות.");
      }
    }, IDLE_TIMEOUT_MS);
  }, [isAuthenticated, handleLogout]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Inactivity Reset Listeners
    const events = ['mousemove', 'keydown', 'wheel', 'mousedown', 'touchstart', 'touchmove'];
    
    const handleActivity = () => {
      resetTimeout();
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Start initial inactivity timeout
    resetTimeout();

    // 2. Continuous 8-Hour Token Expiry Check (Master PRD v5.0 Module 2)
    const checkExpiry = () => {
      if (isTokenExpired()) {
        handleLogout("פג תוקף אסימון ההתחברות (8 שעות). אנא בצע כניסה מחודשת.");
      }
    };

    // Check periodically every minute
    tokenCheckIntervalRef.current = setInterval(checkExpiry, 60 * 1000);
    // Also check immediately on mount
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
    };
  }, [isAuthenticated, handleLogout, resetTimeout, isTokenExpired]);
}
