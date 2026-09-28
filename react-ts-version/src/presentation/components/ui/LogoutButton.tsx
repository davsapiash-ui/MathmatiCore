import { useState } from "react";
import { LogOut } from "lucide-react";
import { unifiedLogout } from "@/application/useAuthStore";
import { useNavigate } from "react-router-dom";
import { LOGGING_OUT_HE, LOGOUT_ARIA_HE, LOGOUT_HE } from "@/core/toolbarNames";

interface LogoutButtonProps {
  className?: string;
  showIconOnly?: boolean;
  /** Classes for the visible name, e.g. to keep it for screen readers only on narrow screens. */
  labelClassName?: string;
}

export function LogoutButton({ className = "", showIconOnly = false, labelClassName = "" }: LogoutButtonProps) {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      unifiedLogout();
    } catch (err) {
      console.warn('[LogoutButton] unifiedLogout notice:', err);
    } finally {
      // Instant client-side transition (0ms latency, no full-page reload)
      navigate("/login", { replace: true });
      // Fallback only if route change didn't unmount
      setTimeout(() => {
        if (window.location.pathname !== "/login") {
          window.location.replace("/login");
        }
      }, 300);
    }
  };

  return (
    <button
      onClick={handleLogout}
      type="button"
      disabled={isLoggingOut}
      style={{ touchAction: 'manipulation' }}
      className={`relative z-20 flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors font-bold cursor-pointer select-none touch-manipulation disabled:opacity-50 ${className}`}
      title={LOGOUT_HE}
      aria-label={LOGOUT_ARIA_HE}
    >
      {/* One name, neutral, for every screen (owner, 28.9.2026; core/toolbarNames). */}
      <LogOut aria-hidden="true" className={`w-5 h-5 shrink-0 ${isLoggingOut ? 'animate-spin' : ''}`} />
      {!showIconOnly && <span className={labelClassName}>{isLoggingOut ? LOGGING_OUT_HE : LOGOUT_HE}</span>}
    </button>
  );
}
