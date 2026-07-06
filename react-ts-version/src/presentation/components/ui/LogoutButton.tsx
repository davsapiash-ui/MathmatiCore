import { useState } from "react";
import { LogOut } from "lucide-react";
import { useAuthStore } from "@/application/useAuthStore";
import { useNavigate } from "react-router-dom";

interface LogoutButtonProps {
  className?: string;
  showIconOnly?: boolean;
}

export function LogoutButton({ className = "", showIconOnly = false }: LogoutButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    // Optionally trigger a manual sync to firebase here if needed before logout
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className={`flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors font-medium ${className}`}
        title={showIconOnly ? "התנתק" : undefined}
      >
        <LogOut className="w-5 h-5" />
        {!showIconOnly && <span>התנתק</span>}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
          <div className="glass-card rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-in zoom-in-95 duration-300 border border-white/20">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <LogOut className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3 text-right">
              התנתקות מהמערכת
            </h3>
            <p className="text-slate-600 dark:text-slate-300 mb-8 text-right leading-relaxed">
              האם אתה בטוח שברצונך להתנתק? כל הנתונים שלך שמורים בענן.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleLogout}
                className="flex-1 px-5 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 active:scale-95 transition-all font-bold shadow-lg shadow-red-600/20"
              >
                כן, התנתק
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all font-bold"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
