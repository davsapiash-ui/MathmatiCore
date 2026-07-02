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
        title="התנתק"
      >
        <LogOut className="w-5 h-5" />
        {!showIconOnly && <span>התנתק</span>}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 text-right">
              התנתקות מהמערכת
            </h3>
            <p className="text-slate-600 dark:text-slate-300 mb-6 text-right">
              האם אתה בטוח שברצונך להתנתק? כל השינויים שלך נשמרו בהצלחה.
            </p>
            <div className="flex flex-row-reverse justify-start gap-3">
              <button
                onClick={handleLogout}
                className="px-5 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium shadow-sm hover:shadow-md"
              >
                כן, התנתק
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-5 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
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
