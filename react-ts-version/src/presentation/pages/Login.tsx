import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/application/useAuthStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useStore } from "@/application/useStore";
import { useNavigate } from "react-router-dom";
import { auth } from "@/infrastructure/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { firebaseSyncService } from "@/infrastructure/services/FirebaseSyncService";

// DEMO_USERS removed

// Removed hardcoded SCHOOLS and CLASSES

const ROLES = [
  { id: "student" as const, icon: "🎓", label: "תלמיד" },
  { id: "teacher" as const, icon: "📊", label: "מורה" },
  { id: "admin" as const, icon: "⚙️", label: "מנהל מערכת" },
];

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
  const [taz, setTaz] = useState("");
  const [dob, setDob] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRole) return;
    setErrorMsg("");

    const performFirebaseAuth = async (virtualEmail: string, virtualPass: string) => {
      try {
        await signInWithEmailAndPassword(auth, virtualEmail, virtualPass);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') {
          try {
            await createUserWithEmailAndPassword(auth, virtualEmail, virtualPass);
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              // Should not happen if signIn failed with user-not-found, but just in case
              await signInWithEmailAndPassword(auth, virtualEmail, virtualPass);
            } else {
              throw createErr;
            }
          }
        } else {
          throw err;
        }
      }
    };

    if (selectedRole === "student") {
      if (!school || !classroom || !username || !password) {
        setErrorMsg("אנא בחר בית ספר וכיתה והזן שם משתמש וסיסמה.");
        return;
      }
      const normalizedUsername = username.trim().toLowerCase();
      
      // Look up student by generated ID structure
      const studentId = `student_${normalizedUsername}`;
      const user = students[studentId];

      if (user && password === "10203040") {
        setIsLoggingIn(true);
        try {
          await performFirebaseAuth(`${studentId}@mathmaticore.local`, password);
          setUser({
            uid: studentId,
            role: "student",
            displayName: user.name,
          }, "student");
          login("student", studentId);
          navigate("/hub", { replace: true });
        } catch (err: any) {
          setErrorMsg(`שגיאה: ${err.message || err.code || "שגיאת התחברות למסד הנתונים."}`);
          setIsLoggingIn(false);
        }
      } else {
        setErrorMsg("שם המשתמש או הסיסמה שגויים.");
      }
    } else if (selectedRole === "teacher") {
      if (!taz || !dob) {
        setErrorMsg("אנא הזן תעודת זהות ותאריך לידה.");
        return;
      }
      setIsLoggingIn(true);
      try {
        const teacherEmail = `teacher_${taz}@mathmaticore.local`;
        const teacherPass = dob + taz;
        
        // 1. Sign in to Firebase Auth FIRST to get permissions
        await performFirebaseAuth(teacherEmail, teacherPass);
        
        // 2. Now that we are authenticated, fetch the teacher profile
        let teacher = await firebaseSyncService.authenticateTeacher(taz);
        
        // Fallback/Backdoor for David
        if (!teacher && taz === "039604483" && dob === "290984") {
          teacher = {
            id: "039604483",
            schoolId: "school_bikorot",
            taz: "039604483",
            dob: "290984",
            name: "דוד",
            licenseActive: true,
            createdAt: Date.now()
          };
          // Explicitly save to Firebase so Security Rules pass
          await firebaseSyncService.registerTeacher(teacher);
        }

        if (teacher) {
          if (!teacher.licenseActive) {
            setErrorMsg("הרישיון שלך אינו פעיל. פנה למנהל המערכת.");
            setIsLoggingIn(false);
            return;
          }
          
          setUser({
            uid: teacher.id,
            role: "teacher",
            displayName: teacher.name,
          }, "teacher");
          login("teacher", teacher.id);
          navigate("/dashboard", { replace: true });
        } else {
          setErrorMsg("תעודת זהות או תאריך לידה שגויים או שאינך רשום במערכת.");
          setIsLoggingIn(false);
        }
      } catch (err: any) {
        setErrorMsg(`שגיאה: ${err.message || err.code || "שגיאת התחברות למסד הנתונים."}`);
        setIsLoggingIn(false);
      }
    } else if (selectedRole === "admin") {
      if (!username || !password) {
        setErrorMsg("אנא הזן שם משתמש וסיסמה.");
        return;
      }

      if (username === "davsapiash" && password === "carlibach") {
        setIsLoggingIn(true);
        try {
          const adminId = `admin_${Date.now()}`;
          await performFirebaseAuth(`admin@mathmaticore.local`, password);
          setUser({
            uid: adminId,
            role: "admin",
            displayName: "מנהל מערכת ראשי",
          }, "admin");
          login("admin", "admin-1");
          navigate("/admin", { replace: true });
        } catch {
          setErrorMsg("שגיאת התחברות למסד הנתונים.");
          setIsLoggingIn(false);
        }
      } else {
        setErrorMsg("פרטי מנהל שגויים.");
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
                      {selectedRole === "teacher" && "ברוך הבא מורה! אנא הזן תעודת זהות ותאריך לידה (6 ספרות)."}
                      {selectedRole === "admin" && "ברוך הבא מנהל. אנא הזן שם משתמש וסיסמה לכניסה למערכת."}
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
                        </>
                      )}
                      {selectedRole === "admin" && (
                        <>
                          <input
                            type="text"
                            placeholder="שם משתמש"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={inputClass}
                            autoFocus
                          />
                          <input
                            type="password"
                            placeholder="סיסמה"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={inputClass}
                          />
                        </>
                      )}
                      {selectedRole === "teacher" && (
                        <>
                          <input
                            type="text"
                            placeholder="תעודת זהות"
                            value={taz}
                            onChange={(e) => setTaz(e.target.value)}
                            className={inputClass}
                            autoFocus
                          />
                          <input
                            type="password"
                            placeholder="תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)"
                            value={dob}
                            onChange={(e) => setDob(e.target.value)}
                            className={inputClass}
                          />
                        </>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="ws-btn-primary w-full flex items-center justify-center gap-2 p-4 rounded-full font-display font-extrabold text-lg transition-all disabled:opacity-60 disabled:transform-none disabled:filter-none shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                    >
                      {isLoggingIn ? "מתחבר..." : (selectedRole === "student" ? "יאללה, נכנסים! ✨" : "התחבר למערכת")}
                    </button>
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
