import { useState } from "react";
import { createPortal } from "react-dom";
import { LogOut } from "lucide-react";
import { useAuthStore, unifiedLogout } from "@/application/useAuthStore";
import { useNavigate } from "react-router-dom";

interface LogoutButtonProps {
  className?: string;
  showIconOnly?: boolean;
}

export function LogoutButton({ className = "", showIconOnly = false }: LogoutButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    unifiedLogout();
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

      {showConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xl animate-in fade-in duration-300"
            dir="rtl"
          >
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-in zoom-in-95 duration-300 border border-slate-200 dark:border-slate-800">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 shadow-sm">
                <LogOut className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 text-right tracking-tight">
                התנתקות מהמערכת
              </h3>
              <p className="text-slate-600 dark:text-slate-300 mb-8 text-right text-sm leading-relaxed font-medium">
                האם אתה בטוח שברצונך להתנתק? כל הנתונים שלך שמורים באופן מאובטח בענן.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleLogout}
                  className="flex-1 px-5 py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl transition-all font-bold shadow-md shadow-rose-600/30 text-sm"
                >
                  כן, התנתק
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl active:scale-95 transition-all font-bold text-sm"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
