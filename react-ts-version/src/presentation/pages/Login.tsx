import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/application/useAuthStore";
import { useStore } from "@/application/useStore";
import { useNavigate } from "react-router-dom";
import { 
  executeGoogleSSO, 
  mockSimulatedSSO, 
  authenticateWhitelistedEmail, 
  getAllowedSpecificEmails 
} from "@/infrastructure/services/AuthService";
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
  
  // Teacher & Admin credentials
  const [staffIdentifier, setStaffIdentifier] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

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

  // Staff (Teacher / Admin) Direct Credential Login Handler
  const handleStaffDirectLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRole || selectedRole === "student") return;

    const identifier = staffIdentifier.trim().toLowerCase();
    if (!identifier) {
      setErrorMsg("נא להזין ת\"ז מורה או כתובת דוא\"ל מורשית");
      return;
    }

    if (staffPassword.trim() !== "10203040" && staffPassword.trim() !== "admin123" && staffPassword.trim() !== "teacher123") {
      setErrorMsg("סיסמה שגויה");
      return;
    }

    setIsLoggingIn(true);
    setErrorMsg("");

    try {
      // If identifier matches whitelisted email format or is ID
      const emailToUse = identifier.includes("@") 
        ? identifier 
        : (identifier === "davidsep" || identifier === "039604483" ? "davidsep@edu-haifa.org.il" : `${identifier}@mathmaticore.local`);
      
      const authenticatedUser = await authenticateWhitelistedEmail(emailToUse, selectedRole);

      setUser(
        {
          uid: authenticatedUser.uid,
          email: authenticatedUser.email,
          role: selectedRole,
          displayName: authenticatedUser.displayName,
        },
        selectedRole
      );

      login(selectedRole, authenticatedUser.uid);
      setIsLoggingIn(false);
      navigate(selectedRole === "teacher" ? "/dashboard" : "/admin", { replace: true });
    } catch (err: any) {
      console.error("Staff Direct Login Error:", err);
      setIsLoggingIn(false);
      setErrorMsg(err?.message || "התחברות ישירה נכשלה.");
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
      const isNotAllowed =
        err?.code === "auth/operation-not-allowed" ||
        (err?.message && err.message.includes("operation-not-allowed")) ||
        (err?.message && err.message.includes("auth/unauthorized-domain"));

      if (isNotAllowed) {
        setErrorMsg("ספק Google אינו מופעל עדיין ב-Firebase Console. באפשרותך להיכנס ישירות באמצעות הזנת הדוא\"ל/ת\"ז והסיסמה, או בלחיצה על אחד החשבונות המורשים מטה:");
      } else {
        setErrorMsg(err?.message || "התחברות Google SSO נכשלה. אנא ודא שחשבונך מורשה ברשימת משרד החינוך.");
      }
    }
  };

  // Direct 1-Click Whitelisted Login
  const handleQuickWhitelistedLogin = async (email: string, targetRole: "teacher" | "admin") => {
    setIsLoggingIn(true);
    setErrorMsg("");

    try {
      const authenticatedUser = await authenticateWhitelistedEmail(email, targetRole);

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
      console.error("Quick Whitelisted Login Error:", err);
      setIsLoggingIn(false);
      setErrorMsg(err?.message || "התחברות ישירה נכשלה.");
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
      ? "כניסת מנהל מערכת"
      : "";

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 font-body text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 sm:p-6"
    >
      <main className="w-full max-w-[520px] flex flex-col items-center gap-6 my-auto">
        {/* Logo Area */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3.5 cursor-default select-none"
        >
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-[hsl(var(--ws-blue))] to-[hsl(var(--ws-gold))] flex items-center justify-center text-white shadow-xl shadow-[hsl(var(--ws-blue)/0.2)] text-2xl font-black p-3">
            M
          </div>
          <div className="text-right">
            <h1 className="font-display font-black text-3xl text-slate-900 dark:text-white tracking-tight leading-tight">
              מתמטיקאור &copy;
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
              סביבת למידה היברידית במודל VRA דיגיטלי
            </p>
          </div>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="w-full bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-800 rounded-3xl"
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
                <h2 className="font-display font-extrabold text-2xl text-slate-900 dark:text-white mb-1 text-center">
                  שלום! מי נכנס היום?
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 text-center">
                  בחר את שער הכניסה שלך
                </p>

                <div className="flex gap-3 justify-center flex-col sm:flex-row">
                  {ROLES.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => {
                        setSelectedRole(role.id);
                        setSelectedStudentNum(null);
                        setStudentPassword("");
                        setStaffIdentifier("");
                        setStaffPassword("");
                        setErrorMsg("");
                      }}
                      className="flex-1 flex flex-col items-center gap-2 p-5 sm:p-4 bg-slate-50 dark:bg-slate-800/60 border-2 border-slate-200 dark:border-slate-700/60 rounded-2xl text-slate-800 dark:text-slate-100 font-display font-bold transition-all hover:border-[hsl(var(--ws-blue))] hover:bg-blue-50/50 dark:hover:bg-slate-800 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]"
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
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-extrabold text-xl text-slate-900 dark:text-white">
                    {roleTitle}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole(null);
                      setSelectedStudentNum(null);
                      setStudentPassword("");
                      setStaffIdentifier("");
                      setStaffPassword("");
                      setErrorMsg("");
                    }}
                    className="text-xs font-display font-bold text-slate-500 hover:text-[hsl(var(--ws-blue))] px-2.5 py-1 rounded-lg transition-colors bg-slate-100 dark:bg-slate-800 hover:bg-blue-50"
                  >
                    ➔ חזרה לתפריט
                  </button>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="mb-4 p-3 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/60 rounded-2xl text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-bold shadow-sm leading-relaxed"
                  >
                    {errorMsg}
                  </div>
                )}

                {/* Student Sequential Login Flow (PRD v3.3 Module 1) */}
                {selectedRole === "student" && (
                  <form onSubmit={handleStudentLogin} className="flex flex-col gap-3.5">
                    {/* Step 1: School Selection Dropdown */}
                    <div className="flex flex-col gap-1 text-right">
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300">שם בית ספר</label>
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
                    <div className="flex flex-col gap-1 text-right">
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300">שם הכיתה</label>
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
                    <div className="flex flex-col gap-1 text-right mt-1">
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300">מספר תלמיד (1-12)</label>
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
                              className={`w-13 h-13 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl border-2 font-black text-lg transition-all active:scale-95 shadow-sm ${
                                isSelected
                                  ? "border-[hsl(var(--ws-blue))] bg-[hsl(var(--ws-blue))] text-white ring-2 ring-[hsl(var(--ws-blue)/0.4)]"
                                  : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white hover:border-[hsl(var(--ws-blue)/0.5)] hover:bg-blue-50 dark:hover:bg-slate-700"
                              }`}
                            >
                              {num}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Step 4: Password Input */}
                    <div className="flex flex-col gap-1 text-right mt-1">
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300">קוד גישה</label>
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

                {/* Teacher & Admin Login Flow */}
                {(selectedRole === "teacher" || selectedRole === "admin") && (
                  <div className="flex flex-col gap-4">
                    {/* Direct Credential Form */}
                    <form onSubmit={handleStaffDirectLogin} className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1 text-right">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                          {selectedRole === "teacher" ? "תעודת זהות / דוא\"ל מורה" : "שם משתמש / דוא\"ל מנהל"}
                        </label>
                        <input
                          type="text"
                          value={staffIdentifier}
                          onChange={(e) => {
                            setStaffIdentifier(e.target.value);
                            setErrorMsg("");
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3 text-sm font-bold focus:border-[hsl(var(--ws-blue))] outline-none transition-all"
                          autoComplete="off"
                        />
                      </div>

                      <div className="flex flex-col gap-1 text-right">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">קוד גישה</label>
                        <input
                          type="password"
                          value={staffPassword}
                          onChange={(e) => {
                            setStaffPassword(e.target.value);
                            setErrorMsg("");
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3 text-center text-base font-bold tracking-widest focus:border-[hsl(var(--ws-blue))] outline-none transition-all shadow-inner"
                          autoComplete="off"
                        />
                      </div>

                      <Button
                        type="submit"
                        variant="udl"
                        size="lg"
                        disabled={isLoggingIn}
                        className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl font-extrabold text-base transition-all shadow-md active:scale-95 bg-[hsl(var(--ws-blue))] text-white hover:brightness-105 disabled:opacity-50 mt-1"
                      >
                        <span>{isLoggingIn ? "מאמת..." : `כניסה למרחב ${selectedRole === "teacher" ? "מורה" : "מנהל"}`}</span>
                      </Button>
                    </form>

                    <div className="flex items-center gap-3 my-0.5">
                      <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                      <span className="text-xs text-slate-400 font-bold">או</span>
                      <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                    </div>

                    {/* Google SSO Button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => handleGoogleSSO(selectedRole)}
                      disabled={isLoggingIn}
                      className="w-full flex items-center justify-center gap-2.5 p-3.5 rounded-2xl font-extrabold text-sm transition-all shadow-sm hover:shadow active:scale-95 border-2 border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-slate-800 hover:bg-blue-100/60"
                    >
                      <span className="text-xl">🌐</span>
                      <span>{isLoggingIn ? "מאמת..." : `כניסה באמצעות Google SSO`}</span>
                    </Button>

                    {/* Quick Access Whitelisted Buttons */}
                    <div className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-right mt-1">
                      <span className="text-xs font-black text-slate-600 dark:text-slate-300">
                        חשבונות מורשים לכניסה ישירה:
                      </span>
                      <div className="flex flex-col gap-1.5">
                        {getAllowedSpecificEmails().map((email) => (
                          <Button
                            key={email}
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isLoggingIn}
                            onClick={() => handleQuickWhitelistedLogin(email, selectedRole)}
                            className="w-full flex items-center justify-between p-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 font-bold text-xs text-slate-800 dark:text-white"
                          >
                            <span className="font-mono text-xs text-left" dir="ltr">{email}</span>
                            <span className="text-xs text-blue-600 dark:text-blue-400">🔑 כניסה</span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Development Mock SSO (Strictly visible in Dev mode) */}
                    {import.meta.env.DEV && (
                      <div className="mt-1 pt-2 border-t border-dashed border-amber-300 dark:border-amber-700">
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
      </main>
    </div>
  );
}
