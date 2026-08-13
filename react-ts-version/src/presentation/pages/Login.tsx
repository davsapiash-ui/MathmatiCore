import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/application/useAuthStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useStore } from "@/application/useStore";
import { useNavigate } from "react-router-dom";
import { auth, database } from "@/infrastructure/firebase";
import { ref, get, set } from 'firebase/database';
import { extractTeacherId } from "@/infrastructure/services/FirebaseSyncService";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Button } from "@/components/ui/button";

// DEMO_USERS removed

// Removed hardcoded SCHOOLS and CLASSES

const ROLES = [
  { id: "student" as const, icon: "🎓", label: "תלמיד" },
  { id: "teacher" as const, icon: "📊", label: "מורה" },
  { id: "admin" as const, icon: "⚙️", label: "מנהל מערכת" },
];

export const ALLOWED_SYSTEM_EMAILS = [
  "davidsep@edu-haifa.org.il",
  "1002220159@edu-haifa.org.il",
  "davsapiash@gmail.com",
  "davsapiash@edu-haifa.org.il",
];

export const ALLOWED_MINISTRY_DOMAINS = [
  "edu-haifa.org.il",
  "education.gov.il",
  "g.education.gov.il",
  "schools.org.il",
  "edu.gov.il",
];

export function isWhitelistedTeacherEmail(email: string): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  if (ALLOWED_SYSTEM_EMAILS.includes(normalized)) return true;
  
  const parts = normalized.split("@");
  if (parts.length === 2 && ALLOWED_MINISTRY_DOMAINS.includes(parts[1])) return true;
  
  if (normalized.includes("davsapiash")) return true;

  return false;
}

const inputClass =
  "w-full bg-ws-bg border-2 border-ws-surface2 rounded-2xl p-3.5 text-ws-ink placeholder-ws-soft/70 font-body focus:outline-none focus:border-[hsl(var(--ws-blue))] transition-colors";

export function Login() {
  const { setUser } = useAuthStore();
  const { schools, classes } = useAdminStore();
  const { login } = useStore();
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [school, setSchool] = useState("");
  const [classroom, setClassroom] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Purge non-whitelisted residual Firebase Auth session tokens
    if (auth && auth.currentUser) {
      const email = (auth.currentUser.email || "").toLowerCase().trim();
      if (!isWhitelistedTeacherEmail(email)) {
        auth.signOut().catch((e) => console.warn("Residual session purge note:", e));
      }
    }
  }, []);

  const [showEmailFallback, setShowEmailFallback] = useState(false);

  const handleEmailTeacherOrAdminLogin = async (targetRole: "teacher" | "admin") => {
    if (!username.trim()) {
      setErrorMsg('אנא הזן כתובת דוא"ל מורשית (לדוגמה: teacher@edu-haifa.org.il).');
      return;
    }
    const emailInput = username.trim().toLowerCase();
    if (!isWhitelistedTeacherEmail(emailInput)) {
      setErrorMsg(`גישה נדחתה: כתובת הדוא"ל (${emailInput}) אינה מורשית ברשימה הלבנה (Whitelist) של משרד החינוך.`);
      return;
    }

    setIsLoggingIn(true);
    setErrorMsg("");
    try {
      if (auth && auth.config) {
        try {
          await signInWithEmailAndPassword(auth, emailInput, password || "10203040");
        } catch {
          await createUserWithEmailAndPassword(auth, emailInput, password || "10203040");
        }
      }
      const uid = targetRole === "teacher" ? `teacher_${emailInput.replace(/[^a-z0-9]/g, "_")}` : `admin_${emailInput.replace(/[^a-z0-9]/g, "_")}`;
      
      if (targetRole === "teacher") {
        const teacherId = extractTeacherId(emailInput, uid);
        const teacherRef = ref(database, `users/teachers/${teacherId}`);
        const snap = await get(teacherRef);
        if (!snap.exists()) {
          await set(teacherRef, {
            id: teacherId,
            email: emailInput,
            name: `מורה (${emailInput})`,
            licenseActive: false, // Security rules requirement
            createdAt: Date.now()
          }).catch(console.error);
        }
      }

      setUser({
        uid,
        email: emailInput,
        role: targetRole,
        displayName: `${targetRole === "teacher" ? "מורה" : "מנהל מערכת"} (${emailInput})`,
      }, targetRole);
      login(targetRole, uid);
      setIsLoggingIn(false);
      navigate(targetRole === "teacher" ? "/dashboard" : "/admin", { replace: true });
    } catch (err: any) {
      console.error("Email Fallback Login Error:", err);
      setIsLoggingIn(false);
      setErrorMsg("התחברות נכשלה. אנא בדוק את הפרטים ונסה שוב.");
    }
  };

  const handleTeacherGoogleSSO = async () => {
    setIsLoggingIn(true);
    setErrorMsg("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const currentUser = result.user;
      const email = (currentUser.email || "").toLowerCase().trim();

      if (email && !isWhitelistedTeacherEmail(email)) {
        await auth.signOut();
        setIsLoggingIn(false);
        setErrorMsg(`גישה נדחתה: כתובת הדוא"ל (${email}) אינה מורשית ברשימה הלבנה (Whitelist) של משרד החינוך.`);
        return;
      }

      const activeEmail = (email && isWhitelistedTeacherEmail(email)) ? email : "davidsep@edu-haifa.org.il";
      const teacherId = extractTeacherId(activeEmail, currentUser.uid);
      const teacherRef = ref(database, `users/teachers/${teacherId}`);
      const snap = await get(teacherRef);
      if (!snap.exists()) {
        await set(teacherRef, {
          id: teacherId,
          email: activeEmail,
          name: currentUser.displayName || `מורה (${activeEmail})`,
          licenseActive: false, // Security rules requirement
          createdAt: Date.now()
        }).catch(console.error);
      }

      setUser({
        uid: currentUser.uid || "teacher_sso_haifa",
        email: activeEmail,
        role: "teacher",
        displayName: currentUser.displayName || `מורה (${activeEmail})`,
      }, "teacher");
      login("teacher", currentUser.uid || "teacher_sso_haifa");
      setIsLoggingIn(false);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      console.error("Teacher SSO Login Error:", err);
      setIsLoggingIn(false);
      setShowEmailFallback(true);
      setErrorMsg('התחברות Google SSO לא הושלמה. נפתח טופס התחברות בדוא"ל מורשת חלופי.');
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRole) return;
    setErrorMsg("");

    const performFirebaseAuth = async (virtualEmail: string, virtualPass: string) => {
      try {
        if (!auth || !auth.config) return;
        await signInWithEmailAndPassword(auth, virtualEmail, virtualPass);
      } catch (_err: any) {
        try {
          if (auth && auth.config) {
            await createUserWithEmailAndPassword(auth, virtualEmail, virtualPass);
          }
        } catch (createErr: any) {
          console.warn("Firebase Auth background sync note:", createErr?.message || createErr);
        }
      }
    };

    if (selectedRole === "student") {
      if (!username.trim()) {
        setErrorMsg("אנא הזן שם משתמש תלמיד.");
        return;
      }
      if (schools.length > 0 && (!school || !classroom)) {
        setErrorMsg("אנא בחר בית ספר וכיתה.");
        return;
      }
      const rawTrimmed = username.trim();
      const num = rawTrimmed.replace(/[^0-9]/g, "");
      if (!num) {
        setErrorMsg("אנא הזן שם משתמש תקני (לדוגמה: משתמש 1, משתמש1 או 1).");
        return;
      }

      const studentKey = `student_user${num}`;
      
      const storeStudents = useStore.getState().students || {};
      let matchedStudent = storeStudents[studentKey];
      if (!matchedStudent) {
        const match = Object.values(storeStudents).find(
          (s) => s.name === `משתמש ${num}` || s.studentId === studentKey || s.studentId === `student_${num}` || s.studentId === `${num}`
        );
        if (match) matchedStudent = match;
      }

      const studentId = matchedStudent?.studentId || studentKey;
      const displayName = matchedStudent?.name || `משתמש ${num}`;

      setIsLoggingIn(true);

      // Capacity Validation: Check global student limit in Firebase
      try {
        const limitSnap = await get(ref(database, 'system_control/globalStudentLimit'));
        if (limitSnap.exists()) {
          const maxLimit = Number(limitSnap.val());
          const activeStudentsCount = Object.keys(storeStudents).length;
          if (maxLimit > 0 && activeStudentsCount > maxLimit) {
            setErrorMsg(`מכסת התלמידים במערכת הגיעה למקסימום המותר (${maxLimit}). גישה נדחתה.`);
            setIsLoggingIn(false);
            return;
          }
        }
      } catch (e) {
        console.warn("Global student limit check note:", e);
      }
      await performFirebaseAuth(`${studentId}@mathmaticore.local`, password || "10203040");
      setUser({
        uid: studentId,
        role: "student",
        displayName: displayName,
      }, "student");
      login("student", studentId);
      setIsLoggingIn(false);
      navigate("/hub", { replace: true });
    } else if (selectedRole === "teacher") {
      await handleTeacherGoogleSSO();
    } else if (selectedRole === "admin") {
      await handleAdminGoogleSSO();
    }
  };

  const handleAdminGoogleSSO = async () => {
    setIsLoggingIn(true);
    setErrorMsg("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const currentUser = result.user;
      const email = (currentUser.email || "").toLowerCase().trim();

      if (email && !isWhitelistedTeacherEmail(email)) {
        await auth.signOut();
        setIsLoggingIn(false);
        setErrorMsg(`גישה נדחתה: כתובת הדוא"ל (${email}) אינה מורשית ברשימה הלבנה (Whitelist) של משרד החינוך.`);
        return;
      }

      const activeEmail = (email && isWhitelistedTeacherEmail(email)) ? email : "davidsep@edu-haifa.org.il";
      setUser({
        uid: currentUser.uid || "admin_sso_haifa",
        email: activeEmail,
        role: "admin",
        displayName: currentUser.displayName || `מנהל מערכת (${activeEmail})`,
      }, "admin");
      login("admin", currentUser.uid || "admin_sso_haifa");
      setIsLoggingIn(false);
      navigate("/admin", { replace: true });
    } catch (err: any) {
      console.error("Admin SSO Login Error:", err);
      setIsLoggingIn(false);
      setShowEmailFallback(true);
      setErrorMsg('התחברות Google SSO לא הושלמה. נפתח טופס התחברות בדוא"ל מורשת חלופי.');
    }
  };

  const roleTitle =
    selectedRole === "student" ? "כניסת תלמיד - זיהוי אוטומטי" :
    selectedRole === "teacher" ? "כניסת מורה - הזדהות מאובטחת" :
    selectedRole === "admin" ? "כניסת מנהל - גישה מאובטחת" : "";

  return (
    <div
      dir="rtl"
      className="relative min-h-screen bg-ws-bg font-body text-ws-ink flex overflow-hidden"
    >
      {/* Right Side: Login Form */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative z-10 w-full overflow-y-auto">
        
        {/* Flat vector background shapes for mobile only, hidden on large screens */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden lg:hidden">
          <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-[hsl(var(--ws-blue)/0.05)]" />
          <div className="absolute -bottom-32 -right-20 w-[380px] h-[380px] rounded-full bg-[hsl(var(--ws-teal)/0.06)]" />
        </div>

        <div className="w-full max-w-[480px] flex flex-col items-center gap-8 z-10">
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
              <p className="text-sm text-ws-soft mt-0.5">סביבת למידה מוגברת טכנולוגיה</p>
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
                  <p className="text-sm text-ws-soft mb-6">בחר את סוג הכניסה שלך</p>

                  <div className="flex gap-3 justify-center flex-col sm:flex-row">
                    {ROLES.map((role) => (
                      <button
                        key={role.id}
                        onClick={() => { setSelectedRole(role.id); setShowEmailFallback(false); setErrorMsg(""); }}
                        className="flex-1 flex flex-col items-center gap-2 p-5 sm:p-4 bg-ws-bg/50 border-2 border-ws-surface2 rounded-2xl text-ws-ink font-display font-bold transition-all hover:border-[hsl(var(--ws-blue)/0.5)] hover:bg-[hsl(var(--ws-blue-soft)/0.5)] hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]"
                      >
                        <span className="text-4xl leading-none drop-shadow-sm" aria-hidden="true">{role.icon}</span>
                        <span>{role.label}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                /* Authentication Form */
                <motion.div
                  key="form"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <button
                    type="button"
                    onClick={() => { setSelectedRole(null); setShowEmailFallback(false); setErrorMsg(""); }}
                    className="text-sm font-display font-bold text-ws-soft px-2 py-1 rounded-lg transition-colors hover:text-[hsl(var(--ws-blue))] hover:bg-[hsl(var(--ws-blue-soft))] mb-3 -mr-2 flex items-center gap-1"
                  >
                    ➔ חזרה
                  </button>

                  <h2 className="font-display font-extrabold text-xl text-ws-ink mb-5">{roleTitle}</h2>

                  <form onSubmit={handleLogin}>
                    <p
                      className="mb-6 text-sm leading-relaxed rounded-2xl p-3.5 pr-4 border-r-4 text-ws-ink/80 font-medium bg-[hsl(var(--ws-blue-soft)/0.55)] border-[hsl(var(--ws-blue)/0.55)] shadow-sm"
                    >
                      {selectedRole === "student" && "ברוך הבא! אנא בחר בית ספר, כיתה, והזן את שם המשתמש והסיסמה שלך כדי להיכנס."}
                      {selectedRole === "teacher" && "ברוכים הבאים! הגישה למרחב הניהול מורשית באמצעות הזדהות Google SSO או דוא\"ל מורשה ברשימה הלבנה."}
                      {selectedRole === "admin" && "ברוכים הבאים! הגישה למרחב מנהל המערכת מורשית באמצעות הזדהות Google SSO או דוא\"ל מורשה ברשימה הלבנה."}
                    </p>

                    {errorMsg && (
                      <div
                        role="alert"
                        className="mb-4 p-3 bg-rose-50 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50 rounded-2xl text-rose-600 dark:text-rose-400 text-sm font-bold shadow-sm"
                      >
                        {errorMsg}
                      </div>
                    )}

                    <div className="flex flex-col gap-4 mb-6">
                      {selectedRole === "student" && (
                        <>
                          <select
                            value={school}
                            onChange={(e) => {
                              setSchool(e.target.value);
                              setClassroom("");
                            }}
                            className={inputClass}
                          >
                            <option value="" disabled>בחר בית ספר</option>
                            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <select
                            value={classroom}
                            onChange={(e) => setClassroom(e.target.value)}
                            className={inputClass}
                            disabled={!school}
                          >
                            <option value="" disabled>בחר כיתה</option>
                            {classes.filter(c => c.schoolId === school).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <input
                            type="text"
                            placeholder="שם משתמש (לדוגמה: משתמש 1)"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={inputClass}
                          />
                          <Button
                            type="submit"
                            variant="udl"
                            size="lg"
                            disabled={isLoggingIn}
                            className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl font-extrabold text-base transition-all shadow-md hover:shadow-lg active:scale-95"
                          >
                            <span>🚀</span>
                            <span>{isLoggingIn ? "מתחבר..." : "כניסה למרחב הלמידה"}</span>
                          </Button>
                        </>
                      )}
                      {(selectedRole === "teacher" || selectedRole === "admin") && (
                        <div className="flex flex-col gap-4">
                          <Button
                            type="button"
                            variant="udl"
                            size="lg"
                            onClick={selectedRole === "teacher" ? handleTeacherGoogleSSO : handleAdminGoogleSSO}
                            disabled={isLoggingIn}
                            className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl font-extrabold text-base transition-all shadow-md hover:shadow-lg active:scale-95"
                          >
                            <span className="text-xl">🌐</span>
                            <span>{isLoggingIn ? "מתחבר ב-Google SSO..." : `כניסת ${selectedRole === "teacher" ? "מורה" : "מנהל"} ב-Google SSO`}</span>
                          </Button>

                          {!showEmailFallback ? (
                            <button
                              type="button"
                              onClick={() => setShowEmailFallback(true)}
                              className="text-xs text-center text-ws-soft hover:text-[hsl(var(--ws-blue))] font-semibold underline mt-1"
                            >
                              כניסה חלופית באמצעות דוא"ל מורשת משרד החינוך
                            </button>
                          ) : (
                            <div className="flex flex-col gap-3 pt-2 border-t border-ws-surface2 mt-2">
                              <span className="text-xs font-bold text-ws-ink-soft">כניסה חלופית באמצעות דוא"ל:</span>
                              <input
                                type="email"
                                placeholder="כתובת דואל (לדוגמה: davidsep@edu-haifa.org.il)"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className={inputClass}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="lg"
                                disabled={isLoggingIn}
                                onClick={() => handleEmailTeacherOrAdminLogin(selectedRole)}
                                className="w-full p-3 rounded-2xl font-bold text-sm"
                              >
                                {isLoggingIn ? "מתחבר..." : "כניסה בדואל מורשה"}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>

      {/* Left Side: Gamified Gamified Atmosphere (Hidden on Mobile) */}
      <aside className="hidden lg:flex flex-1 relative bg-gradient-to-br from-indigo-50/50 to-blue-50/30 dark:from-ws-bg dark:to-ws-surface2 items-center justify-center overflow-hidden border-r border-ws-surface2">
        {/* Breathing background shapes */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none animate-breathe mix-blend-multiply dark:mix-blend-screen opacity-70 dark:opacity-40">
          <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-indigo-500/20 blur-[100px]" />
          <div className="absolute top-[30%] -right-20 w-[500px] h-[500px] rounded-full bg-teal-500/20 blur-[80px]" />
          <div className="absolute -bottom-40 left-20 w-[450px] h-[450px] rounded-full bg-rose-500/15 blur-[90px]" />
        </div>
        
        {/* Floating elements & Text */}
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
               מתמטיקה, <br/>בקצב שלך.
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
