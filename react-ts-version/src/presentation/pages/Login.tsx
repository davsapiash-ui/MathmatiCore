import { useState } from "react";
import { useAuthStore } from "@/application/useAuthStore";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";

export function Login() {
  const { setUser } = useAuthStore();
  const [role, setRole] = useState<"student" | "teacher" | "admin">("student");
  const [username, setUsername] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    // Simulate login based on role
    setUser({
      uid: `${role}_${Date.now()}`,
      role: role,
      displayName: username,
    }, role);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900" dir="rtl">
      <AccessibleCard className="w-full max-w-md p-8 bg-white dark:bg-slate-950 shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-2">מתמטיקאור</h1>
          <p className="text-slate-500">התחברות למערכת</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">סוג משתמש</label>
            <div className="flex gap-2">
              {(["student", "teacher", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-md border text-sm font-bold transition-colors ${
                    role === r 
                      ? "bg-blue-600 text-white border-blue-600" 
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {r === "student" ? "תלמיד" : r === "teacher" ? "מורה" : "מנהל"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              {role === "student" ? "שם פרטי (למשל: נועה)" : "שם משתמש"}
            </label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-md bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="הזן שם..."
              required
            />
          </div>

          <UdlButton type="submit" size="lg" className="w-full text-lg mt-4">
            היכנס למערכת
          </UdlButton>
        </form>
      </AccessibleCard>
    </div>
  );
}
