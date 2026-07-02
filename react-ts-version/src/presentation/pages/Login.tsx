import { useState } from "react";
import { useAuthStore } from "@/application/useAuthStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useStore } from "@/application/useStore";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const DEMO_USERS: Record<string, any> = {
  'user1': { password: '10203040', name: 'משתמש 1', session: 1, classMode: 'regular' },
  'user2': { password: '10203040', name: 'משתמש 2', session: 1, classMode: 'regular' },
  'user3': { password: '10203040', name: 'משתמש 3', session: 1, classMode: 'regular' },
  'pilot': { password: '10203040', name: 'פיילוט תלמיד', session: 1, classMode: 'regular' },
};

export function Login() {
  const { setUser } = useAuthStore();
  const { teachers } = useAdminStore();
  const { login } = useStore();
  const navigate = useNavigate();
  
  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = () => {
    if (!selectedRole) return;

    if (selectedRole === "student") {
      const username = window.prompt("אנא הזן שם משתמש (לדוגמה: user1):");
      if (!username) return;
      const password = window.prompt("אנא הזן קוד סודי (10203040):");
      if (!password) return;

      const user = DEMO_USERS[username];
      if (user && user.password === password) {
        setIsLoggingIn(true);
        setTimeout(() => {
          setUser({
            uid: `student_${Date.now()}`,
            role: "student",
            displayName: user.name,
          }, "student");
          login("student", "student-2"); // Force mock to the specific student for testing Meeting 2
          navigate("/hub", { replace: true }); // Students go to hub first!
        }, 600);
      } else {
        alert("שם המשתמש או הסיסמה שגויים.");
      }
    } else if (selectedRole === "teacher") {
      const taz = window.prompt("אנא הזן תעודת זהות:");
      if (!taz) return;
      const dob = window.prompt("אנא הזן תאריך לידה (6 ספרות - DDMMYY):");
      if (!dob) return;

      const teacher = teachers.find(t => t.taz === taz && t.dob === dob);
      if (teacher) {
        if (!teacher.licenseActive) {
          alert("הרישיון שלך אינו פעיל. פנה למנהל המערכת.");
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
        alert("תעודת זהות או תאריך לידה שגויים.");
      }
    } else if (selectedRole === "admin") {
      const username = window.prompt("שם משתמש מנהל:");
      if (!username) return;
      const password = window.prompt("סיסמת מנהל:");
      if (!password) return;

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
        alert("פרטי מנהל שגויים.");
      }
    }
  };

  const roleTitle = 
    selectedRole === "student" ? "כניסת תלמיד - זיהוי אוטומטי" :
    selectedRole === "teacher" ? "כניסת מורה - הקלדת פרטים מזהים" :
    selectedRole === "admin" ? "כניסת מנהל - גישה מאובטחת" : "";

  return (
    <div className="login-page-bg text-white" dir="rtl">
      {/* Decorative animated background orbs */}
      <div className="bg-orb bg-orb-1" aria-hidden="true"></div>
      <div className="bg-orb bg-orb-2" aria-hidden="true"></div>
      <div className="bg-orb bg-orb-3" aria-hidden="true"></div>

      <main className="relative z-10 flex flex-col items-center gap-8 w-full max-w-[460px] p-6">
        
        {/* Logo Area */}
        <div className="flex items-center gap-4 animate-[fadeIn_0.6s_ease_forwards]">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center logo-icon-anim shadow-[0_8px_30px_rgba(91,79,255,0.5)]" style={{background: 'linear-gradient(135deg, #3b82f6, #9B5CFF)'}}>
            <span className="text-[2.2rem] font-black text-white leading-none">מ</span>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-black text-white tracking-tight leading-tight">מתמטיקאור</h1>
            <p className="text-sm text-white/55 font-normal mt-0.5">סביבת למידה מוגברת טכנולוגיה</p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]">
          
          {!selectedRole ? (
            /* Role Selection */
            <div className="animate-in fade-in zoom-in duration-300">
              <h2 className="text-xl font-extrabold text-white mb-1">כניסה למערכת</h2>
              <p className="text-sm text-white/55 mb-6">בחר את סוג הכניסה שלך</p>

              <div className="flex gap-3 justify-center flex-col sm:flex-row">
                <button 
                  onClick={() => setSelectedRole("student")}
                  className="role-btn-student flex-1 flex flex-col items-center gap-2 p-5 sm:p-3 bg-white/5 border-[1.5px] border-white/10 rounded-lg text-white/85 text-sm font-semibold transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
                >
                  <span className="text-3xl leading-none">🎓</span>
                  <span>תלמיד</span>
                </button>
                <button 
                  onClick={() => setSelectedRole("teacher")}
                  className="role-btn-teacher flex-1 flex flex-col items-center gap-2 p-5 sm:p-3 bg-white/5 border-[1.5px] border-white/10 rounded-lg text-white/85 text-sm font-semibold transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
                >
                  <span className="text-3xl leading-none">📊</span>
                  <span>מורה</span>
                </button>
                <button 
                  onClick={() => setSelectedRole("admin")}
                  className="role-btn-admin flex-1 flex flex-col items-center gap-2 p-5 sm:p-3 bg-white/5 border-[1.5px] border-white/10 rounded-lg text-white/85 text-sm font-semibold transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
                >
                  <span className="text-3xl leading-none">⚙️</span>
                  <span>מנהל מערכת</span>
                </button>
              </div>
            </div>
          ) : (
            /* Authentication Form */
            <div className="relative animate-in slide-in-from-right-4 fade-in duration-300">
              <button 
                onClick={() => setSelectedRole(null)}
                className="absolute -top-4 -left-4 bg-transparent text-white/50 text-sm font-semibold px-2 py-1 rounded transition-colors hover:text-white/90 hover:bg-white/5"
              >
                ← חזרה
              </button>
              
              <div className="flex items-center gap-3 mb-6 mt-4">
                <h2 className="text-xl font-extrabold text-white">{roleTitle}</h2>
              </div>
              
              <div className="text-center p-4">
                <p className="mb-6 text-sm text-white/70">
                  {selectedRole === "student" && "מערכת ה-SSO מזהה אותך אוטומטית לפי חשבון הגוגל הבית-ספרי שלך. בגרסת הדמו יש להזין שם משתמש."}
                  {selectedRole === "teacher" && "הכניסה למורים דורשת הקלדת תעודת זהות ותאריך לידה (6 ספרות)."}
                  {selectedRole === "admin" && "הכניסה למנהלים מוגנת ומחייבת הזנת פרטי הזדהות מורשים בלבד."}
                </p>
                <button 
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="w-full flex items-center justify-center gap-3 p-4 bg-white text-slate-800 text-base font-bold rounded-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70 disabled:transform-none"
                >
                  {isLoggingIn ? "מתחבר..." : (
                    <>
                      <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                        <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                          <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                          <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.369 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                          <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                          <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.109 -17.884 43.989 -14.754 43.989 Z"/>
                        </g>
                      </svg>
                      {selectedRole === "student" ? "התחברות שקופה" : "התחבר למערכת"}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
