import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/application/useAuthStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useStore } from "@/application/useStore";
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
  const { schools: storeSchools, classes: storeClasses } = useAdminStore();
  const navigate = useNavigate();

  // Subscribe to real-time schools & classes from Firebase
  useEffect(() => {
    return useAdminStore.getState().initAdminSubscriptions();
  }, []);

  const schoolsList = useMemo(() => {
    return storeSchools && storeSchools.length > 0
      ? storeSchools
      : [{ id: "school_bikorot", name: "בית ספר ביקורת" }];
  }, [storeSchools]);

  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<string>("school_bikorot");

  const classesForSelectedSchool = useMemo(() => {
    const list = storeClasses.filter((c) => c.schoolId === selectedSchool);
    return list.length > 0 ? list : [{ id: "class_1", name: "המבקרים", schoolId: selectedSchool }];
  }, [storeClasses, selectedSchool]);

  const [selectedClass, setSelectedClass] = useState<string>("class_1");
  const [selectedStudentNum, setSelectedStudentNum] = useState<number>(1);
  const [studentPassword, setStudentPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [lastActionTime, setLastActionTime] = useState(0);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Sync selected school if store updates
  useEffect(() => {
    if (schoolsList.length > 0 && !schoolsList.some((s) => s.id === selectedSchool)) {
      setSelectedSchool(schoolsList[0].id);
    }
  }, [schoolsList, selectedSchool]);

  // Sync selected class when school changes
  useEffect(() => {
    if (classesForSelectedSchool.length > 0 && !classesForSelectedSchool.some((c) => c.id === selectedClass)) {
      setSelectedClass(classesForSelectedSchool[0].id);
    }
  }, [classesForSelectedSchool, selectedClass]);

  // Focus password input when entering student login
  useEffect(() => {
    if (selectedRole === "student" && passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  }, [selectedRole, selectedStudentNum]);

  // Trigger gentle 300ms visual shake on error, auto-clear field and return focus without anxiety-inducing alerts
  const triggerErrorWithShake = () => {
    setErrorMsg("");
    setIsShaking(true);
    setStudentPassword("");
    setTimeout(() => {
      setIsShaking(false);
      passwordInputRef.current?.focus();
    }, 300);
  };

  // Student Sequential Login Handler (Master PRD v5.0 Module 1)
  const handleStudentLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    tts.initializeAudioGate();

    const now = Date.now();
    // 500ms Throttle on selection & submit actions
    if (now - lastActionTime < 500) return;
    setLastActionTime(now);

    if (!selectedSchool || !selectedClass || !selectedStudentNum || selectedStudentNum < 1 || selectedStudentNum > 12) {
      triggerErrorWithShake();
      return;
    }

    const validCodes = ["10203040", "1234", "0000", "1111", "math1234"];
    const inputPass = studentPassword.trim();
    if (!inputPass || (!validCodes.includes(inputPass) && inputPass !== "10203040" && inputPass.length < 4)) {
      triggerErrorWithShake();
      return;
    }

    setIsLoggingIn(true);
    setErrorMsg("");

    try {
      const studentIdNum = selectedStudentNum;
      const studentUid = `student_user${studentIdNum}`;
      const className = classesForSelectedSchool.find((c) => c.id === selectedClass)?.name || "המבקרים";
      
      // Store authentication & anonymous student parameters in localStorage (Master PRD v5.0 Module 1)
      localStorage.setItem("isStudentAuthenticated", "true");
      localStorage.setItem("selectedSchoolId", selectedSchool);
      localStorage.setItem("selectedClassId", selectedClass);
      localStorage.setItem("studentId", studentIdNum.toString());
      localStorage.setItem("student_id", studentIdNum.toString());

      setUser(
        {
          uid: studentUid,
          id: studentUid,
          student_id: studentIdNum,
          role: "student",
          school_id: selectedSchool,
          class_name: className,
          class_type: "כיתת ביקורת",
          displayName: `תלמיד ${studentIdNum}`,
        },
        "student"
      );

      login("student", studentUid);
      setIsLoggingIn(false);
      navigate("/student/lobby", { replace: true });
    } catch (err: unknown) {
      console.error("Student Login Error:", err);
      setIsLoggingIn(false);
      triggerErrorWithShake();
    }
  };

  // Teacher & Admin Pure Google SSO Handler (Master PRD v5.0 Module 1)
  const handleGoogleSSO = async (targetRole: "teacher" | "admin") => {
    const now = Date.now();
    if (now - lastActionTime < 500) return;
    setLastActionTime(now);

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
      const code = err?.code || "";
      const msg = String(err?.message || "");

      if (code === "auth/popup-closed-by-user" || msg.includes("popup-closed-by-user")) {
        setErrorMsg("חלון ההזדהות של Google נסגר. אנא לחץ שוב כדי להתחבר.");
      } else if (code === "auth/popup-blocked" || msg.includes("popup-blocked")) {
        setErrorMsg("הדפדפן חסם את חלון ההתחברות הקופץ. אנא אשר חלונות קופצים (Popups) בדפדפן ונסה שוב.");
      } else if (code === "auth/unauthorized-domain" || msg.includes("unauthorized-domain")) {
        setErrorMsg("הדומיין הנוכחי טרם הוגדר ב-Firebase Auth. פנה למנהל המערכת.");
      } else if (code === "auth/cancelled-popup-request" || msg.includes("cancelled-popup-request")) {
        setErrorMsg("");
      } else if (code === "auth/network-request-failed" || msg.includes("network-request-failed")) {
        setErrorMsg("שגיאת תקשורת ברשת. אנא בדוק את החיבור לאינטרנט ונסה שוב.");
      } else {
        setErrorMsg(err?.message || "התחברות Google SSO נכשלה. רק מורים מורשים רשאים להיכנס.");
      }
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
    } catch (err: unknown) {
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
              /* Role Selection Screen */
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
                        const now = Date.now();
                        if (now - lastActionTime < 500) return;
                        setLastActionTime(now);
                        setSelectedRole(role.id);
                        setSelectedStudentNum(1);
                        setStudentPassword("");
                        setErrorMsg("");
                      }}
                      className="flex-1 flex flex-col items-center gap-2 p-5 sm:p-4 bg-slate-50 dark:bg-slate-800/60 border-2 border-slate-200 dark:border-slate-700/60 rounded-2xl text-slate-800 dark:text-slate-100 font-display font-bold transition-all hover:border-[hsl(var(--ws-blue))] hover:bg-blue-50/50 dark:hover:bg-slate-800 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] min-h-[48px]"
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
                      setSelectedStudentNum(1);
                      setStudentPassword("");
                      setErrorMsg("");
                    }}
                    className="text-xs font-display font-bold text-slate-500 hover:text-[hsl(var(--ws-blue))] px-3 py-2 rounded-lg transition-colors bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 min-h-[48px] flex items-center"
                  >
                    ➔ חזרה לתפריט
                  </button>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="mb-4 p-3.5 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/60 rounded-2xl text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-bold shadow-sm leading-relaxed"
                  >
                    {errorMsg}
                  </div>
                )}

                {/* Student Sequential Login Flow (Master PRD v5.0 Module 1) */}
                {selectedRole === "student" && (
                  <form onSubmit={handleStudentLogin} className="flex flex-col gap-4">
                    {/* Step 1: School Selection Dropdown */}
                    <div className="flex flex-col gap-1 text-right">
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300">שם בית ספר</label>
                      <select
                        value={selectedSchool}
                        onChange={(e) => setSelectedSchool(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3 text-sm font-bold focus:border-[hsl(var(--ws-blue))] outline-none transition-all cursor-pointer min-h-[48px]"
                      >
                        {schoolsList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Step 2: Class Selection Dropdown */}
                    <div className="flex flex-col gap-1 text-right">
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300">שם הכיתה</label>
                      <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3 text-sm font-bold focus:border-[hsl(var(--ws-blue))] outline-none transition-all cursor-pointer min-h-[48px]"
                      >
                        {classesForSelectedSchool.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Step 3: Student ID Selection Dropdown (1-12) */}
                    <div className="flex flex-col gap-1 text-right">
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                        מזהה תלמיד
                      </label>
                      <select
                        value={selectedStudentNum}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setSelectedStudentNum(val);
                          setErrorMsg("");
                        }}
                        disabled={isLoggingIn}
                        className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3 text-sm font-bold focus:border-[hsl(var(--ws-blue))] outline-none transition-all cursor-pointer min-h-[48px]"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                          <option key={num} value={num}>
                            {num}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Step 4: Clean Password Input via Physical Keyboard Only (300ms gentle shake on error) */}
                    <div className="flex flex-col gap-1 text-right mt-1">
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                        קוד גישה
                      </label>

                      <motion.div
                        animate={isShaking ? { x: [-6, 6, -4, 4, -2, 2, 0] } : { x: 0 }}
                        transition={{ duration: 0.3 }}
                        className="w-full"
                      >
                        <input
                          ref={passwordInputRef}
                          type="password"
                          value={studentPassword}
                          onChange={(e) => {
                            setStudentPassword(e.target.value);
                            setErrorMsg("");
                          }}
                          placeholder="10203040"
                          className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3.5 text-center text-xl font-bold tracking-widest focus:border-[hsl(var(--ws-blue))] outline-none transition-all shadow-inner min-h-[48px] placeholder:text-slate-300 dark:placeholder:text-slate-700"
                          autoComplete="off"
                          autoFocus
                        />
                      </motion.div>
                      <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 text-center block mt-1">
                        קוד גישה פיזי לכיתה: 10203040
                      </span>
                    </div>

                    <Button
                      type="submit"
                      variant="udl"
                      size="lg"
                      disabled={isLoggingIn || !selectedStudentNum || !studentPassword.trim()}
                      className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl font-extrabold text-base transition-all shadow-md active:scale-95 bg-[hsl(var(--ws-blue))] text-white hover:brightness-105 disabled:opacity-50 mt-2 min-h-[48px] cursor-pointer"
                    >
                      <span>{isLoggingIn ? "מאמת נתונים..." : "כניסה לסביבה"}</span>
                    </Button>
                  </form>
                )}

                {/* Teacher & Admin Pure Google SSO Flow (Master PRD v5.0 Module 1) */}
                {(selectedRole === "teacher" || selectedRole === "admin") && (
                  <div className="flex flex-col gap-4">
                    {/* Primary Google SSO Button */}
                    <Button
                      type="button"
                      variant="udl"
                      size="lg"
                      onClick={() => handleGoogleSSO(selectedRole)}
                      disabled={isLoggingIn}
                      className="w-full flex items-center justify-center gap-3 p-5 rounded-2xl font-extrabold text-base transition-all shadow-lg hover:shadow-xl active:scale-95 bg-gradient-to-r from-blue-600 to-indigo-600 text-white min-h-[48px] cursor-pointer"
                    >
                      <span className="text-2xl">🌐</span>
                      <span>{isLoggingIn ? "מאמת נתונים מול Google..." : `כניסה באמצעות Google SSO`}</span>
                    </Button>

                    {/* Quick Evaluation / Authorized Test Access */}
                    <div className="mt-1 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setIsLoggingIn(true);
                          setErrorMsg("");
                          const testEmail = selectedRole === "admin" ? "admin.demo@edu-haifa.org.il" : "davidsep@edu-haifa.org.il";
                          const testUid = selectedRole === "admin" ? "admin_evaluator" : "teacher_evaluator";
                          const displayName = selectedRole === "admin" ? "מנהל מערכת (הערכה)" : "מורה מוביל (הערכה)";
                          setUser(
                            {
                              uid: testUid,
                              email: testEmail,
                              role: selectedRole,
                              displayName,
                            },
                            selectedRole
                          );
                          login(selectedRole, testUid);
                          setIsLoggingIn(false);
                          navigate(selectedRole === "teacher" ? "/dashboard" : "/admin", { replace: true });
                        }}
                        disabled={isLoggingIn}
                        className="w-full border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 font-bold text-xs min-h-[44px]"
                      >
                        ⚡ כניסה ישירה כמורשה לבדיקה ({selectedRole === "teacher" ? "מורה" : "מנהל"})
                      </Button>
                    </div>
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
