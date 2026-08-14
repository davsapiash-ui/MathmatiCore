import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/application/useAuthStore";
import { useStore } from "@/application/useStore";
import { useNavigate } from "react-router-dom";
import { executeGoogleSSO, mockSimulatedSSO } from "@/infrastructure/services/AuthService";
import { tts } from "@/infrastructure/services/TTSService";
import { Button } from "@/components/ui/button";

const ROLES = [
  { id: "student" as const, icon: "🎓", label: "תלמיד" },
  { id: "teacher" as const, icon: "📊", label: "מורה" },
  { id: "admin" as const, icon: "⚙️", label: "מנהל מערכת" },
];

export function Login() {
  const { setUser } = useAuthStore();
  const { login } = useStore();
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastStudentClickTime, setLastStudentClickTime] = useState(0);

  // Student Anonymous 12-Slot Grid Handler (PRD v3.0 Module 1)
  const handleStudentSelect = async (studentNum: number) => {
    tts.initializeAudioGate();

    // 500ms Throttle to prevent rapid clicking
    const now = Date.now();
    if (now - lastStudentClickTime < 500) return;
    setLastStudentClickTime(now);

    if (studentNum < 1 || studentNum > 12) {
      setErrorMsg("מזהה תלמיד חייב להיות מספר שלם בין 1 ל-12 בלבד.");
      return;
    }

    setIsLoggingIn(true);
    setErrorMsg("");

    try {
      const studentId = `student_${studentNum}`;
      const displayName = `תלמיד ${studentNum}`;

      setUser(
        {
          uid: studentId,
          role: "student",
          displayName: displayName,
        },
        "student"
      );

      login("student", studentId);
      setIsLoggingIn(false);
      navigate("/hub", { replace: true });
    } catch (err: any) {
      console.error("Student Login Error:", err);
      setIsLoggingIn(false);
      setErrorMsg("התחברות תלמיד נכשלה. אנא נסה שוב.");
    }
  };

  // Teacher / Admin Google SSO Handler
  const handleGoogleSSO = async (targetRole: "teacher" | "admin") => {
    setIsLoggingIn(true);
    setErrorMsg("");

    try {
      const authenticatedUser = await executeGoogleSSO(targetRole);

      setUser(
        {
          uid: authenticatedUser.uid,
          email: authenticatedUser.email,
          role: targetRole,
          displayName: authenticatedUser.displayName,
        },
        targetRole
      );

      login(targetRole, authenticatedUser.uid);
      setIsLoggingIn(false);
      navigate(targetRole === "teacher" ? "/dashboard" : "/admin", { replace: true });
    } catch (err: any) {
      console.error(`${targetRole} Google SSO Error:`, err);
      setIsLoggingIn(false);
      setErrorMsg(err?.message || "התחברות Google SSO נכשלה. אנא ודא שחשבונך מורשה ברשימת משרד החינוך.");
    }
  };

  // Simulated SSO Mock (Active strictly in Development mode)
  const handleDevMockSSO = async (targetRole: "teacher" | "admin") => {
    if (!import.meta.env.DEV) return;
    setIsLoggingIn(true);
    setErrorMsg("");

    try {
      const mockUser = await mockSimulatedSSO(targetRole);

      setUser(
        {
          uid: mockUser.uid,
          email: mockUser.email,
          role: targetRole,
          displayName: mockUser.displayName,
        },
        targetRole
      );

      login(targetRole, mockUser.uid);
      setIsLoggingIn(false);
      navigate(targetRole === "teacher" ? "/dashboard" : "/admin", { replace: true });
    } catch (err: any) {
      console.error("Mock SSO Error:", err);
      setIsLoggingIn(false);
      setErrorMsg("הזדהות פיתוח נכשלה.");
    }
  };

  const roleTitle =
    selectedRole === "student"
      ? "כניסת תלמיד — בחירה אנונימית"
      : selectedRole === "teacher"
      ? "כניסת מורה — הזדהות מאובטחת"
      : selectedRole === "admin"
      ? "כניסת מנהל — גישה מאובטחת"
      : "";

  return (
    <div
      dir="rtl"
      className="relative min-h-screen bg-ws-bg font-body text-ws-ink flex overflow-hidden"
    >
      {/* Right Side: Main Portal Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative z-10 w-full overflow-y-auto">
        <div className="w-full max-w-[540px] flex flex-col items-center gap-8 z-10">
          {/* Logo Area */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="flex items-center gap-4"
          >
            <div className="w-16 h-16 rounded-3xl ws-brand flex items-center justify-center rotate-[-4deg] shadow-lg">
              <span className="text-[2.2rem] font-black leading-none font-display">מ</span>
            </div>
            <div className="text-right">
              <h1 className="font-display font-black text-3xl text-ws-ink tracking-tight leading-tight">מתמטיקאור &copy;</h1>
              <p className="text-sm text-ws-soft mt-0.5">סביבת למידה היברידית מוגברת טכנולוגיה</p>
            </div>
          </motion.div>

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="w-full ws-card p-8 shadow-2xl shadow-black/5 border border-ws-surface2/60 backdrop-blur-xl bg-white/70 dark:bg-ws-surface/70"
          >
            <AnimatePresence mode="wait" initial={false}>
              {!selectedRole ? (
                /* Role Selection */
                <motion.div
                  key="roles"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                >
                  <h2 className="font-display font-extrabold text-2xl text-ws-ink mb-1">שלום! מי נכנס היום?</h2>
                  <p className="text-sm text-ws-soft mb-6">בחר את שער הכניסה שלך</p>

                  <div className="flex gap-3 justify-center flex-col sm:flex-row">
                    {ROLES.map((role) => (
                      <button
                        key={role.id}
                        onClick={() => {
                          setSelectedRole(role.id);
                          setErrorMsg("");
                        }}
                        className="flex-1 flex flex-col items-center gap-2 p-5 sm:p-4 bg-ws-bg/50 border-2 border-ws-surface2 rounded-2xl text-ws-ink font-display font-bold transition-all hover:border-[hsl(var(--ws-blue)/0.5)] hover:bg-[hsl(var(--ws-blue-soft)/0.5)] hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]"
                      >
                        <span className="text-4xl leading-none drop-shadow-sm" aria-hidden="true">
                          {role.icon}
                        </span>
                        <span>{role.label}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                /* Authenticated Entry Form */
                <motion.div
                  key="form"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole(null);
                      setErrorMsg("");
                    }}
                    className="text-sm font-display font-bold text-ws-soft px-2 py-1 rounded-lg transition-colors hover:text-[hsl(var(--ws-blue))] hover:bg-[hsl(var(--ws-blue-soft))] mb-3 -mr-2 flex items-center gap-1"
                  >
                    ➔ חזרה
                  </button>

                  <h2 className="font-display font-extrabold text-xl text-ws-ink mb-3">{roleTitle}</h2>

                  {errorMsg && (
                    <div
                      role="alert"
                      className="mb-4 p-3.5 bg-rose-50 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50 rounded-2xl text-rose-600 dark:text-rose-400 text-sm font-bold shadow-sm"
                    >
                      {errorMsg}
                    </div>
                  )}

                  {/* Student 12-Slot Anonymous Grid (PRD v3.0 Module 1) */}
                  {selectedRole === "student" && (
                    <div>
                      <p className="mb-5 text-sm leading-relaxed rounded-2xl p-3.5 pr-4 border-r-4 text-ws-ink/80 font-medium bg-[hsl(var(--ws-blue-soft)/0.55)] border-[hsl(var(--ws-blue)/0.55)] shadow-sm">
                        בחר את מספר המושב האישי שלך כדי להיכנס לסביבת התרגול ללא שמירת פרטים מזהים.
                      </p>

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-w-[440px] mx-auto justify-items-center">
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                          <button
                            key={num}
                            onClick={() => handleStudentSelect(num)}
                            disabled={isLoggingIn}
                            className="w-[100px] h-[100px] flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-ws-surface2 bg-ws-bg hover:border-[hsl(var(--ws-blue))] hover:bg-[hsl(var(--ws-blue-soft))] transition-all active:scale-95 shadow-sm group"
                          >
                            <span className="text-2xl font-black text-ws-ink group-hover:text-[hsl(var(--ws-blue))]">
                              {num}
                            </span>
                            <span className="text-xs font-bold text-ws-soft">תלמיד</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Teacher & Admin Pure Google SSO Flow (PRD v3.0 Module 1 & 2) */}
                  {(selectedRole === "teacher" || selectedRole === "admin") && (
                    <div className="flex flex-col gap-5">
                      <p className="text-sm leading-relaxed rounded-2xl p-4 border-r-4 text-ws-ink/80 font-medium bg-[hsl(var(--ws-blue-soft)/0.55)] border-[hsl(var(--ws-blue)/0.55)] shadow-sm">
                        הכניסה למרחב {selectedRole === "teacher" ? "המורה" : "הניהול"} מתבצעת באופן מאובטח באמצעות חשבון Google SSO מורשה של משרד החינוך.
                      </p>

                      <Button
                        type="button"
                        variant="udl"
                        size="lg"
                        onClick={() => handleGoogleSSO(selectedRole)}
                        disabled={isLoggingIn}
                        className="w-full flex items-center justify-center gap-3 p-5 rounded-2xl font-extrabold text-base transition-all shadow-lg hover:shadow-xl active:scale-95 bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                      >
                        <span className="text-2xl">🌐</span>
                        <span>{isLoggingIn ? "מאמת נתונים מול Google..." : `כניסה באמצעות Google SSO`}</span>
                      </Button>

                      {/* Development Mock SSO (Strictly visible in Dev mode) */}
                      {import.meta.env.DEV && (
                        <div className="mt-4 pt-4 border-t border-dashed border-amber-300 dark:border-amber-700">
                          <div className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1.5">
                            <span>🛠️</span>
                            <span>סביבת פיתוח מקומית (Simulated SSO Mock)</span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDevMockSSO(selectedRole)}
                            disabled={isLoggingIn}
                            className="w-full border-amber-400 text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 font-bold text-xs"
                          >
                            התחבר כ-{selectedRole === "teacher" ? "מורה" : "מנהל"} מדמה (Local Dev Only)
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>

      {/* Left Side: Atmosphere */}
      <aside className="hidden lg:flex flex-1 relative bg-gradient-to-br from-indigo-50/50 to-blue-50/30 dark:from-ws-bg dark:to-ws-surface2 items-center justify-center overflow-hidden border-r border-ws-surface2">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none animate-breathe mix-blend-multiply dark:mix-blend-screen opacity-70 dark:opacity-40"
        >
          <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-indigo-500/20 blur-[100px]" />
          <div className="absolute top-[30%] -right-20 w-[500px] h-[500px] rounded-full bg-teal-500/20 blur-[80px]" />
          <div className="absolute -bottom-40 left-20 w-[450px] h-[450px] rounded-full bg-rose-500/15 blur-[90px]" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center max-w-md px-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", duration: 1.5, bounce: 0.4 }}
            className="w-32 h-32 mx-auto bg-white/80 dark:bg-ws-surface/80 rounded-[2.5rem] shadow-2xl mb-10 flex items-center justify-center rotate-3 border-4 border-white dark:border-ws-surface2 backdrop-blur-md"
          >
            <span className="text-7xl drop-shadow-md">🚀</span>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h2 className="text-4xl font-display font-black text-ws-ink mb-5 leading-tight">
              מתמטיקה, <br />
              בקצב שלך.
            </h2>
            <p className="text-ws-soft text-lg font-medium leading-relaxed max-w-sm mx-auto">
              סביבת הלמידה שמזהה איך אתה חושב, ומתאימה את עצמה בדיוק אליך.
            </p>
          </motion.div>
        </div>
      </aside>
    </div>
  );
}
