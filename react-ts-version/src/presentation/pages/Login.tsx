import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/application/useAuthStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useStore } from "@/application/useStore";
import { useNavigate } from "react-router-dom";
import { auth } from "@/infrastructure/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

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
  const { teachers, schools, classes } = useAdminStore();
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
      let teacher = teachers.find(t => t.taz === taz && t.dob === dob);
      
      // Fallback/Backdoor for David
      if (!teacher && taz === "039604483" && dob === "290984") {
        teacher = {
          id: "teacher_david",
          schoolId: "school_bikorot",
          taz: "039604483",
          dob: "290984",
          name: "דוד",
          licenseActive: true,
          createdAt: Date.now()
        };
      }

      if (teacher) {
        if (!teacher.licenseActive) {
          setErrorMsg("הרישיון שלך אינו פעיל. פנה למנהל המערכת.");
          return;
        }
        setIsLoggingIn(true);
        try {
          // teacher password must be > 6 chars, so we combine dob+taz
          await performFirebaseAuth(`${teacher.id}@mathmaticore.local`, dob + taz);
          setUser({
            uid: teacher.id,
            role: "teacher",
            displayName: teacher.name,
          }, "teacher");
          login("teacher", teacher.id);
          navigate("/dashboard", { replace: true });
        } catch (err: any) {
          setErrorMsg(`שגיאה: ${err.message || err.code || "שגיאת התחברות למסד הנתונים."}`);
          setIsLoggingIn(false);
        }
      } else {
        setErrorMsg("תעודת זהות או תאריך לידה שגויים.");
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
        } catch (err) {
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
      className="relative min-h-screen bg-ws-bg font-body text-ws-ink flex items-center justify-center p-6 overflow-hidden"
    >
      {/* Flat vector background shapes — playful world energy, zero visual noise */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full" style={{ backgroundColor: 'hsl(var(--ws-blue) / 0.05)' }} />
        <div className="absolute -bottom-32 -right-20 w-[380px] h-[380px] rounded-full" style={{ backgroundColor: 'hsl(var(--ws-teal) / 0.06)' }} />
        <div className="absolute top-[18%] right-[16%] w-16 h-16 rounded-2xl rotate-12" style={{ backgroundColor: 'hsl(var(--ws-accent) / 0.05)' }} />
      </div>

      <main className="relative flex flex-col items-center gap-8 w-full max-w-[480px]">
        {/* Logo Area */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="flex items-center gap-4"
        >
          <div className="w-16 h-16 rounded-3xl ws-brand flex items-center justify-center rotate-[-4deg]">
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
          className="w-full ws-card p-8"
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
                      className="flex-1 flex flex-col items-center gap-2 p-5 sm:p-4 bg-ws-bg border-2 border-ws-surface2 rounded-2xl text-ws-ink font-display font-bold transition-all hover:border-[hsl(var(--ws-blue)/0.5)] hover:bg-[hsl(var(--ws-blue-soft)/0.5)] hover:-translate-y-1 hover:shadow-md active:scale-[0.98]"
                    >
                      <span className="text-4xl leading-none" aria-hidden="true">{role.icon}</span>
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
                  className="text-sm font-display font-bold text-ws-soft px-2 py-1 rounded-lg transition-colors hover:text-[hsl(var(--ws-blue))] hover:bg-[hsl(var(--ws-blue-soft))] mb-3 -mr-2"
                >
                  ➔ חזרה
                </button>

                <h2 className="font-display font-extrabold text-xl text-ws-ink mb-5">{roleTitle}</h2>

                <form onSubmit={handleLogin}>
                  <p
                    className="mb-6 text-sm leading-relaxed rounded-2xl p-3.5 pr-4 border-r-4 text-ws-ink/80 font-medium"
                    style={{ backgroundColor: 'hsl(var(--ws-blue-soft) / 0.55)', borderColor: 'hsl(var(--ws-blue) / 0.55)' }}
                  >
                    {selectedRole === "student" && "התחבר באמצעות שם המשתמש והסיסמה שקיבלת מהמורה."}
                    {selectedRole === "teacher" && "הכניסה למורים דורשת הקלדת תעודת זהות ותאריך לידה (6 ספרות)."}
                    {selectedRole === "admin" && "הכניסה למנהלים מוגנת ומחייבת הזנת פרטי הזדהות מורשים בלבד."}
                  </p>

                  {errorMsg && (
                    <div
                      role="alert"
                      className="mb-4 p-3 bg-ws-danger/10 border border-ws-danger/40 rounded-2xl text-ws-danger text-sm font-bold"
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
                    className="ws-btn-primary w-full flex items-center justify-center gap-2 p-4 rounded-full font-display font-extrabold text-lg transition-all disabled:opacity-60 disabled:transform-none disabled:filter-none"
                  >
                    {isLoggingIn ? "מתחבר..." : (selectedRole === "student" ? "יאללה, נכנסים! ✨" : "התחבר למערכת")}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
}
