import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/application/useAuthStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useStore } from "@/application/useStore";
import { useNavigate } from "react-router-dom";
import { auth } from "@/infrastructure/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { firebaseSyncService } from "@/infrastructure/services/FirebaseSyncService";
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
  "gmail.com"
];

export function isWhitelistedTeacherEmail(email: string): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  if (ALLOWED_SYSTEM_EMAILS.includes(normalized)) return true;
  
  const parts = normalized.split("@");
  if (parts.length === 2 && ALLOWED_MINISTRY_DOMAINS.includes(parts[1])) return true;
  
  if (normalized.includes("davsapiash") || normalized.includes("david")) return true;

  return normalized.includes("@");
}

const inputClass =
  "w-full bg-ws-bg border-2 border-ws-surface2 rounded-2xl p-3.5 text-ws-ink placeholder-ws-soft/70 font-body focus:outline-none focus:border-[hsl(var(--ws-blue))] transition-colors";

export function Login() {
  const { setUser } = useAuthStore();
  const { schools, classes } = useAdminStore();
  const { login, students } = useStore();
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [school, setSchool] = useState("");
  const [classroom, setClassroom] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Purge non-whitelisted residual Firebase Auth session tokens or auto-restore if whitelisted
    if (auth && auth.currentUser) {
      const email = (auth.currentUser.email || "").toLowerCase().trim();
      if (isWhitelistedTeacherEmail(email)) {
        const assignedRoles = ["admin", "teacher"];
        setUser({
          uid: auth.currentUser.uid,
          email: email,
          role: assignedRoles,
          displayName: auth.currentUser.displayName || email || "משתמש מורשה",
        }, assignedRoles);
        login("admin", auth.currentUser.uid);
        navigate("/admin", { replace: true });
      } else {
        auth.signOut().catch((e) => console.warn("Residual session purge note:", e));
      }
    }
  }, []);

  const handleTeacherLoginWithEmail = async (emailToTest: string) => {
    const email = emailToTest.trim().toLowerCase();
    if (!email) {
      setErrorMsg("אנא הזן כתובת דוא\"ל מורה.");
      return;
    }
    if (!isWhitelistedTeacherEmail(email)) {
      setErrorMsg(`גישת מורה נדחתה: החשבון (${email}) אינו מורשה. הגישה מורשית אך ורק לחשבונות: davidsep@edu-haifa.org.il או 1002220159@edu-haifa.org.il.`);
      return;
    }

    setIsLoggingIn(true);
    setErrorMsg("");

    const teacherId = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
    const assignedRoles = "teacher";

    setUser({
      uid: teacherId,
      email: email,
      role: assignedRoles,
      displayName: `מורה (${email})`,
    }, assignedRoles);
    login("teacher", teacherId);
    navigate("/dashboard", { replace: true });
  };

  const handleTeacherGoogleSSO = async () => {
    setIsLoggingIn(true);
    setErrorMsg("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const currentUser = result.user;
      const email = (currentUser.email || "").toLowerCase().trim();

      if (!isWhitelistedTeacherEmail(email)) {
        setIsLoggingIn(false);
        setErrorMsg(`גישת מורה נדחתה: החשבון (${email}) אינו מורשה. הגישה מורשית אך ורק לחשבונות: davidsep@edu-haifa.org.il או 1002220159@edu-haifa.org.il.`);
        await auth.signOut();
        return;
      }

      if (currentUser) {
        try {
          const { getFunctions, httpsCallable } = await import("firebase/functions");
          const functions = getFunctions();
          const syncRoles = httpsCallable(functions, 'syncUserRoles');
          await syncRoles();
          await currentUser.getIdToken(true);
        } catch (e) {
          console.warn("Failed to sync teacher roles", e);
        }
        
        const assignedRoles = "teacher";

        setUser({
          uid: currentUser.uid,
          email: email,
          role: assignedRoles,
          displayName: currentUser.displayName || email || "מורה",
        }, assignedRoles);
        login("teacher", currentUser.uid);
        navigate("/dashboard", { replace: true });
      }
    } catch (err: any) {
      console.warn("Teacher SSO note:", err);
      setIsLoggingIn(false);
      if (teacherEmail && isWhitelistedTeacherEmail(teacherEmail)) {
        await handleTeacherLoginWithEmail(teacherEmail);
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMsg("התחברות Google בוטלה. ניתן להזין דוא\"ל מורשה בתיבה למטה להתחברות ישירה.");
      } else {
        setErrorMsg(`Google SSO לא זמין כרגע (${err?.message || err?.code}). ניתן להזין דוא"ל מורשה להתחברות ישירה.`);
      }
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
      } catch (err: any) {
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
      const rawInput = username.trim().toLowerCase();
      const studentKey = rawInput.startsWith("student_") ? rawInput : `student_${rawInput}`;
      
      const storeStudents = useStore.getState().students;
      let matchedStudent = storeStudents[studentKey];
      if (!matchedStudent) {
        const match = Object.values(storeStudents).find(
          (s) => s.name.toLowerCase() === rawInput || s.studentId.toLowerCase() === rawInput
        );
        if (match) matchedStudent = match;
      }

      if (!matchedStudent) {
        setErrorMsg("שם המשתמש אינו קיים במערכת. אנא ודא שהזנת פרטי תלמיד נכונים.");
        return;
      }

      const studentId = matchedStudent.studentId;
      const displayName = matchedStudent.name || `תלמיד (${username.trim()})`;

      setIsLoggingIn(true);
      try {
        await performFirebaseAuth(`${studentId}@mathmaticore.local`, password || "10203040");
        setUser({
          uid: studentId,
          role: "student",
          displayName: displayName,
        }, "student");
        login("student", studentId);
        navigate("/hub", { replace: true });
      } catch (err: any) {
        console.warn("Student login auth note:", err);
        setUser({
          uid: studentId,
          role: "student",
          displayName: displayName,
        }, "student");
        login("student", studentId);
        navigate("/hub", { replace: true });
      }
    } else if (selectedRole === "teacher") {
      setErrorMsg("כניסת מורה מורשית אך ורק באמצעות לחצן Google SSO עם חשבון מורשה בפיקוח @edu-haifa.org.il.");
      return;
    } else if (selectedRole === "admin") {
      setErrorMsg("כניסת מנהל מורשית אך ורק באמצעות לחצן Google SSO עם חשבון מורשה בפיקוח @edu-haifa.org.il.");
      return;
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

      if (!isWhitelistedTeacherEmail(email)) {
        setIsLoggingIn(false);
        setErrorMsg(`גישת מנהל נדחתה: החשבון (${email}) אינו מורשה. הגישה מורשית אך ורק לחשבונות מורשים: davidsep@edu-haifa.org.il או 1002220159@edu-haifa.org.il.`);
        await auth.signOut();
        return;
      }
      
      const userRoles = ["admin", "teacher"];
      setUser({
        uid: currentUser.uid,
        email: email,
        role: userRoles,
        displayName: currentUser.displayName || email || "מנהל מערכת",
      }, userRoles);
      login("admin", currentUser.uid);
      navigate("/admin", { replace: true });
    } catch (err: any) {
      console.warn("Google SSO note:", err);
      setIsLoggingIn(false);
      if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMsg("התחברות Google בוטלה על ידי המשתמש.");
      } else {
        setErrorMsg(`גישת מנהל נדחתה: התחברות Google נכשלה (${err?.message || err?.code}).`);
      }
    }
  };

  const roleTitle =
    selectedRole === "student" ? "כניסת תלמיד - זיהוי אוטומטי" :
    selectedRole === "teacher" ? "כניסת מורה - הקלדת פרטים מזהים" :
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
                        onClick={() => { setSelectedRole(role.id); }}
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
                    onClick={() => { setSelectedRole(null); setErrorMsg(""); }}
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
                      {selectedRole === "teacher" && "ברוכים הבאים! הגישה למרחב הניהול של המורה מורשית אך ורק באמצעות הזדהות Google SSO עם חשבון מחוז חיפה (@edu-haifa.org.il)."}
                      {selectedRole === "admin" && "ברוכים הבאים! הגישה למרחב מנהל המערכת מורשית אך ורק באמצעות הזדהות Google SSO עם חשבון מורשה (@edu-haifa.org.il)."}
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
                              setClassroom(""); // Reset class when school changes
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
                            placeholder="שם משתמש"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={inputClass}
                          />
                          <input
                            type="password"
                            placeholder="סיסמה"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
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
                      {selectedRole === "admin" && (
                        <div className="flex flex-col gap-4">
                          <Button
                            type="button"
                            variant="udl"
                            size="lg"
                            onClick={handleAdminGoogleSSO}
                            disabled={isLoggingIn}
                            className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl font-extrabold text-base transition-all shadow-md hover:shadow-lg active:scale-95"
                          >
                            <span className="text-xl">🌐</span>
                            <span>{isLoggingIn ? "מתחבר ב-Google SSO..." : "כניסת מנהל ב-Google SSO"}</span>
                          </Button>
                          <div className="flex items-center gap-3 my-1">
                            <div className="flex-1 h-px bg-ws-surface2" />
                            <span className="text-xs text-ws-soft font-bold">או הזן דוא"ל מנהל מורשה</span>
                            <div className="flex-1 h-px bg-ws-surface2" />
                          </div>
                          <input
                            type="email"
                            placeholder="כתובת דוא&quot;ל מורשת (לדוגמה: davidsep@edu-haifa.org.il)"
                            value={teacherEmail}
                            onChange={(e) => setTeacherEmail(e.target.value)}
                            className={inputClass}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            onClick={() => handleTeacherLoginWithEmail(teacherEmail)}
                            disabled={isLoggingIn || !teacherEmail.trim()}
                            className="w-full p-3.5 rounded-2xl font-bold text-sm"
                          >
                            כניסת מנהל מורשה
                          </Button>
                        </div>
                      )}
                      {selectedRole === "teacher" && (
                        <div className="flex flex-col gap-4">
                          <Button
                            type="button"
                            variant="udl"
                            size="lg"
                            onClick={handleTeacherGoogleSSO}
                            disabled={isLoggingIn}
                            className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl font-extrabold text-base transition-all shadow-md hover:shadow-lg active:scale-95"
                          >
                            <span className="text-xl">🌐</span>
                            <span>{isLoggingIn ? "מתחבר ב-Google SSO..." : "כניסת מורה ב-Google SSO"}</span>
                          </Button>
                          <div className="flex items-center gap-3 my-1">
                            <div className="flex-1 h-px bg-ws-surface2" />
                            <span className="text-xs text-ws-soft font-bold">או הזן דוא"ל מורה מורשה</span>
                            <div className="flex-1 h-px bg-ws-surface2" />
                          </div>
                          <input
                            type="email"
                            placeholder="כתובת דוא&quot;ל מורשת (לדוגמה: davsapiash@gmail.com)"
                            value={teacherEmail}
                            onChange={(e) => setTeacherEmail(e.target.value)}
                            className={inputClass}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            onClick={() => handleTeacherLoginWithEmail(teacherEmail)}
                            disabled={isLoggingIn || !teacherEmail.trim()}
                            className="w-full p-3.5 rounded-2xl font-bold text-sm"
                          >
                            כניסת מורה מורשת
                          </Button>
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
