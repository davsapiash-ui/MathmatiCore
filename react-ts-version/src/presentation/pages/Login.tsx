import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/application/useAuthStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useStore } from "@/application/useStore";
import { useNavigate } from "react-router-dom";

const DEMO_USERS: Record<string, any> = {
  'user1': { password: '10203040', name: 'משתמש 1', session: 1, classMode: 'regular' },
  'user2': { password: '10203040', name: 'משתמש 2', session: 1, classMode: 'regular' },
  'user3': { password: '10203040', name: 'משתמש 3', session: 1, classMode: 'regular' },
  'pilot': { password: '10203040', name: 'פיילוט תלמיד', session: 1, classMode: 'regular' },
};

const ROLES = [
  { id: "student" as const, icon: "🎓", label: "תלמיד" },
  { id: "teacher" as const, icon: "📊", label: "מורה" },
  { id: "admin" as const, icon: "⚙️", label: "מנהל מערכת" },
];

const inputClass =
  "w-full bg-ws-bg border-2 border-ws-surface2 rounded-2xl p-3.5 text-ws-ink placeholder-ws-soft/70 font-body focus:outline-none focus:border-ws-accent transition-colors";

export function Login() {
  const { setUser } = useAuthStore();
  const { teachers } = useAdminStore();
  const { login } = useStore();
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [taz, setTaz] = useState("");
  const [dob, setDob] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRole) return;
    setErrorMsg("");

    if (selectedRole === "student") {
      if (!username || !password) {
        setErrorMsg("אנא הזן שם משתמש וסיסמה.");
        return;
      }
      const normalizedUsername = username.trim().toLowerCase();
      const user = DEMO_USERS[normalizedUsername];

      if (user && user.password === password) {
        setIsLoggingIn(true);
        setTimeout(() => {
          const newUid = `student_${normalizedUsername}`;
          setUser({
            uid: newUid,
            role: "student",
            displayName: user.name,
          }, "student");
          login("student", newUid);
          navigate("/hub", { replace: true });
        }, 600);
      } else {
        setErrorMsg("שם המשתמש או הסיסמה שגויים.");
      }
    } else if (selectedRole === "teacher") {
      if (!taz || !dob) {
        setErrorMsg("אנא הזן תעודת זהות ותאריך לידה.");
        return;
      }
      const teacher = teachers.find(t => t.taz === taz && t.dob === dob);
      if (teacher) {
        if (!teacher.licenseActive) {
          setErrorMsg("הרישיון שלך אינו פעיל. פנה למנהל המערכת.");
          return;
        }
        setIsLoggingIn(true);
        setTimeout(() => {
          setUser({
            uid: teacher.id,
            role: "teacher",
            displayName: teacher.name,
          }, "teacher");
          login("teacher", teacher.id);
          navigate("/dashboard", { replace: true });
        }, 600);
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
        setTimeout(() => {
          setUser({
            uid: `admin_${Date.now()}`,
            role: "admin",
            displayName: "מנהל מערכת ראשי",
          }, "admin");
          login("admin", "admin-1");
          navigate("/admin", { replace: true });
        }, 600);
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
      className="min-h-screen bg-ws-bg font-body text-ws-ink flex items-center justify-center p-6"
    >
      <main className="flex flex-col items-center gap-8 w-full max-w-[480px]">
        {/* Logo Area */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="flex items-center gap-4"
        >
          <div className="w-16 h-16 rounded-3xl bg-ws-accent flex items-center justify-center shadow-lg">
            <span className="text-[2.2rem] font-black text-white leading-none font-display">מ</span>
          </div>
          <div className="text-right">
            <h1 className="font-display font-black text-3xl text-ws-ink tracking-tight leading-tight">מתמטיקאור</h1>
            <p className="text-sm text-ws-soft mt-0.5">סביבת למידה מוגברת טכנולוגיה</p>
          </div>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="w-full bg-ws-surface rounded-3xl shadow-lg border border-ws-surface2 p-8"
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
                      className="flex-1 flex flex-col items-center gap-2 p-5 sm:p-4 bg-ws-bg border-2 border-ws-surface2 rounded-2xl text-ws-ink font-display font-bold transition-all hover:border-ws-accent hover:bg-ws-accentSoft hover:-translate-y-1 hover:shadow-md active:scale-[0.98]"
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
                  className="text-sm font-display font-bold text-ws-soft px-2 py-1 rounded-lg transition-colors hover:text-ws-accent hover:bg-ws-accentSoft mb-3 -mr-2"
                >
                  ➔ חזרה
                </button>

                <h2 className="font-display font-extrabold text-xl text-ws-ink mb-5">{roleTitle}</h2>

                <form onSubmit={handleLogin}>
                  <p className="mb-6 text-sm text-ws-soft leading-relaxed">
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
                    {(selectedRole === "student" || selectedRole === "admin") && (
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
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-full font-display font-extrabold text-lg text-white bg-ws-accent shadow-md transition-all hover:brightness-105 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60 disabled:transform-none"
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
