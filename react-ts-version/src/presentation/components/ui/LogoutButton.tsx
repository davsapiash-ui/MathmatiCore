import { LogOut } from "lucide-react";
import { unifiedLogout } from "@/application/useAuthStore";
import { useNavigate } from "react-router-dom";

interface LogoutButtonProps {
  className?: string;
  showIconOnly?: boolean;
}

export function LogoutButton({ className = "", showIconOnly = false }: LogoutButtonProps) {
  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    unifiedLogout();
    window.location.href = "/login";
  };

  return (
    <button
      onClick={handleLogout}
      type="button"
      className={`relative z-20 flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors font-bold cursor-pointer select-none ${className}`}
      title={showIconOnly ? "התנתק" : undefined}
      aria-label="התנתק מהמערכת"
    >
      <LogOut className="w-5 h-5 shrink-0" />
      {!showIconOnly && <span>התנתק</span>}
    </button>
  );
}
