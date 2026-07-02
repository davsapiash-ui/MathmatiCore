import { useEffect, useRef } from 'react';
import { useAuthStore } from './useAuthStore';
import { useNavigate } from 'react-router-dom';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function useIdleTimeout() {
  const { isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      if (isAuthenticated) {
        // Auto-save logic can be triggered here if there are global stores to sync
        logout();
        navigate('/login', { replace: true });
        // Optional: show a toast or alert that they were logged out due to inactivity
      }
    }, IDLE_TIMEOUT_MS);
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    // Events that reset the idle timer
    const events = ['mousemove', 'keydown', 'wheel', 'mousedown', 'touchstart', 'touchmove'];
    
    const handleActivity = () => {
      resetTimeout();
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Start initial timeout
    resetTimeout();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isAuthenticated, logout, navigate]);
}
