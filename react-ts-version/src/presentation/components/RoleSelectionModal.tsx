import { motion } from "framer-motion";
import { useAuthStore } from "@/application/useAuthStore";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, GraduationCap, ArrowRight } from "lucide-react";

export function RoleSelectionModal() {
  const { user, selectRole, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleSelectRole = (role: "teacher" | "admin") => {
    selectRole(role);
    if (role === "teacher") {
      navigate("/dashboard", { replace: true });
    } else if (role === "admin") {
      navigate("/admin", { replace: true });
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-[600px] min-h-[380px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="font-display font-extrabold text-2xl text-slate-900 dark:text-white">
                בחירת תפקיד במערכת
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                זוהו הרשאות מרובות עבור המשתמש. בחר את מרחב העבודה הרצוי:
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-[hsl(var(--ws-blue))]">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Teacher Role Card */}
            <button
              type="button"
              onClick={() => handleSelectRole("teacher")}
              className="flex flex-col items-center text-center p-6 bg-slate-50 dark:bg-slate-800/60 border-2 border-slate-200 dark:border-slate-700 rounded-2xl hover:border-[hsl(var(--ws-blue))] hover:bg-blue-50/40 dark:hover:bg-slate-800 transition-all group min-h-[140px] justify-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-[hsl(var(--ws-blue))] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <GraduationCap className="w-7 h-7" />
              </div>
              <span className="font-display font-bold text-lg text-slate-900 dark:text-white">
                מרחב מורה
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                דשבורד מעקב כיתתי, רדאר פדגוגי ואבחון
              </span>
            </button>

            {/* Admin Role Card */}
            <button
              type="button"
              onClick={() => handleSelectRole("admin")}
              className="flex flex-col items-center text-center p-6 bg-slate-50 dark:bg-slate-800/60 border-2 border-slate-200 dark:border-slate-700 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-slate-800 transition-all group min-h-[140px] justify-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <span className="font-display font-bold text-lg text-slate-900 dark:text-white">
                מנהל מערכת
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                הקמת כיתות, ניהול תוכנית לימודים וסקירה כוללת
              </span>
            </button>
          </div>
        </div>

        <div className="pt-6 mt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={logout}
            className="text-xs font-bold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <span>ביטול והתנתקות</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
