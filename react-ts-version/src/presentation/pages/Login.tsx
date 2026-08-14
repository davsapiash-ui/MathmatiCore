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

const SCHOOLS = [
  { id: "sch_control", name: "בית ספר ביקורת" },
];

const CLASSES = [
  { id: "cls_control", name: "המבקרים", type: "כיתת ביקורת" },
];

export function Login() {
  const { setUser } = useAuthStore();
  const { login } = useStore();
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | null>(null);
  const [selectedSchool, setSelectedSchool] = useState(SCHOOLS[0].id);
  const [selectedClass, setSelectedClass] = useState(CLASSES[0].id);
  const [selectedStudentNum, setSelectedStudentNum] = useState<number | null>(null);
  const [studentPassword, setStudentPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastStudentClickTime, setLastStudentClickTime] = useState(0);

  // Student Sequential Login Handler (Master PRD v3.3 Module 1)
  const handleStudentLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    tts.initializeAudioGate();

    const now = Date.now();
    if (now - lastStudentClickTime < 500) return;
    setLastStudentClickTime(now);

    if (!selectedSchool) {
      setErrorMsg("יש לבחור בית ספר");
      return;
    }

    if (!selectedClass) {
      setErrorMsg("יש לבחור כיתה");
      return;
    }

    if (!selectedStudentNum || selectedStudentNum < 1 || selectedStudentNum > 12) {
      setErrorMsg("יש לבחור מספר תלמיד");
      return;
    }

    if (studentPassword.trim() !== "10203040") {
      setErrorMsg("סיסמה שגויה");
      return;
    }

    setIsLoggingIn(true);
    setErrorMsg("");

    try {
      const studentId = `student_${selectedStudentNum}`;
      const className = CLASSES.find((c) => c.id === selectedClass)?.name || "המבקרים";
      const displayName = `תלמיד ${selectedStudentNum} (${className})`;

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

  // Teacher / Admin Google SSO Handler (Master PRD v3.3 Module 1)
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
      ? "כניסת תלמיד"
      : selectedRole === "teacher"
      ? "כניסת מורה"
      : selectedRole === "admin"
      ? "כניסת מנהל"
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
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-4 cursor-default select-none"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[hsl(var(--ws-blue))] to-[hsl(var(--ws-gold))] flex items-center justify-center text-white shadow-xl shadow-[hsl(var(--ws-blue)/0.2)] text-2xl font-black">
              M
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
                          setSelectedStudentNum(null);
                          setStudentPassword("");
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
                      setSelectedStudentNum(null);
                      setStudentPassword("");
                      setErrorMsg("");
                    }}
                    className="text-sm font-display font-bold text-ws-soft px-2 py-1 rounded-lg transition-colors hover:text-[hsl(var(--ws-blue))] hover:bg-[hsl(var(--ws-blue-soft))] mb-3 -mr-2 flex items-center gap-1"
                  >
                    ➔ חזרה
                  </button>

                  <h2 className="font-display font-extrabold text-xl text-ws-ink mb-4">{roleTitle}</h2>

                  {errorMsg && (
                    <div
                      role="alert"
                      className="mb-4 p-3.5 bg-rose-50 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50 rounded-2xl text-rose-600 dark:text-rose-400 text-sm font-bold shadow-sm"
                    >
                      {errorMsg}
                    </div>
                  )}

                  {/* Student Sequential Login Flow (PRD v3.3 Module 1) */}
                  {selectedRole === "student" && (
                    <form onSubmit={handleStudentLogin} className="flex flex-col gap-4">
                      {/* Step 1: School Selection Dropdown */}
                      <div className="flex flex-col gap-1.5 text-right">
                        <label className="text-xs font-black text-ws-ink/80">שם בית ספר</label>
                        <select
                          value={selectedSchool}
                          onChange={(e) => setSelectedSchool(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3 text-sm font-bold focus:border-[hsl(var(--ws-blue))] outline-none transition-all cursor-pointer"
                        >
                          {SCHOOLS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Step 2: Class Selection Dropdown (including המבקרים) */}
                      <div className="flex flex-col gap-1.5 text-right">
                        <label className="text-xs font-black text-ws-ink/80">שם הכיתה</label>
                        <select
                          value={selectedClass}
                          onChange={(e) => setSelectedClass(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3 text-sm font-bold focus:border-[hsl(var(--ws-blue))] outline-none transition-all cursor-pointer"
                        >
                          {CLASSES.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.type})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Step 3: Compact Numeric Keypad for ID Selection (1-12) */}
                      <div className="flex flex-col gap-1.5 text-right mt-1">
                        <label className="text-xs font-black text-ws-ink/80">מספר תלמיד (1-12)</label>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-w-[440px] mx-auto justify-items-center w-full">
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => {
                            const isSelected = selectedStudentNum === num;
                            return (
                              <button
                                type="button"
                                key={num}
                                onClick={() => {
                                  tts.initializeAudioGate();
                                  setSelectedStudentNum(num);
                                  setErrorMsg("");
                                }}
                                disabled={isLoggingIn}
                                className={`w-14 h-14 flex items-center justify-center rounded-xl border-2 font-black text-lg transition-all active:scale-95 shadow-sm ${
                                  isSelected
                                    ? "border-[hsl(var(--ws-blue))] bg-[hsl(var(--ws-blue))] text-white ring-2 ring-[hsl(var(--ws-blue)/0.4)]"
                                    : "border-ws-surface2 bg-ws-bg text-ws-ink hover:border-[hsl(var(--ws-blue)/0.5)] hover:bg-[hsl(var(--ws-blue-soft)/0.5)]"
                                }`}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Step 4: Password Input (No placeholders or hint descriptions per PRD v3.3) */}
                      <div className="flex flex-col gap-1.5 text-right mt-1">
                        <label className="text-xs font-black text-ws-ink/80">קוד גישה</label>
                        <input
                          type="password"
                          value={studentPassword}
                          onChange={(e) => {
                            setStudentPassword(e.target.value);
                            setErrorMsg("");
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3.5 text-center text-lg font-bold tracking-widest focus:border-[hsl(var(--ws-blue))] outline-none transition-all shadow-inner"
                          autoComplete="off"
                        />
                      </div>

                      <Button
                        type="submit"
                        variant="udl"
                        size="lg"
                        disabled={isLoggingIn || !selectedStudentNum}
                        className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl font-extrabold text-base transition-all shadow-md active:scale-95 bg-[hsl(var(--ws-blue))] text-white hover:brightness-105 disabled:opacity-50 mt-2"
                      >
                        <span>{isLoggingIn ? "מאמת..." : "כניסה לסביבה"}</span>
                      </Button>
                    </form>
                  )}

                  {/* Teacher & Admin Pure Google SSO Flow (PRD v3.3 Module 1 - No password inputs, placeholders or hints) */}
                  {(selectedRole === "teacher" || selectedRole === "admin") && (
                    <div className="flex flex-col gap-5">
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
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="max-w-md p-8 text-right flex flex-col gap-6 select-none relative z-10">
          <div className="w-16 h-16 rounded-3xl bg-[hsl(var(--ws-blue-soft))] flex items-center justify-center text-3xl text-[hsl(var(--ws-blue))] shadow-inner">
            📐
          </div>
          <div>
            <h3 className="font-display font-extrabold text-2xl text-ws-ink mb-2">מרחב למידה מתמטי אינטראקטיבי</h3>
            <p className="text-sm text-ws-soft leading-relaxed">
              פלטפורמה המשלבת המחשה וקטורית, פידבק בזמן אמת והתאמה אישית של רצף התרגול במודל VRA דיגיטלי בלבד.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
