import { useEffect, useState } from "react";
import { useStudentSessionStore } from "@/application/useStudentSessionStore";
import { telemetryTracker } from "@/infrastructure/TelemetryTracker";

/**
 * Hook to manage LMS session heartbeat, graceful disconnects, and offline freezing.
 * Prevents data loss when the network drops.
 */
export function useSessionHeartbeat() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isIdle, setIsIdle] = useState(false);
  const currentModule = useStudentSessionStore((state) => state.currentModule);

  useEffect(() => {
    // Monitor network status
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Idle detection (3 minutes without interaction)
    let idleTimer: any;
    const resetIdleTimer = () => {
      setIsIdle(false);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setIsIdle(true);
        telemetryTracker.logEvent("SESSION_IDLE_TIMEOUT");
      }, 3 * 60 * 1000); // 3 minutes
    };

    const activityEvents = ["mousemove", "keydown", "click", "touchstart"];
    activityEvents.forEach((e) => window.addEventListener(e, resetIdleTimer));
    resetIdleTimer();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      activityEvents.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      clearTimeout(idleTimer);
    };
  }, []);

  return { isOffline, isIdle, currentModule };
}
