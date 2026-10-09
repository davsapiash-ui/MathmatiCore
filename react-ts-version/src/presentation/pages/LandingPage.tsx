import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, LogIn } from "lucide-react";
import { useAuthStore } from "@/application/useAuthStore";
import { Logo } from "@/presentation/components/ui/Logo";

/**
 * Screen 0 of PRD Module 1 §א: "מסך נחיתה נקי ומזמין עם לחצן התחלה מרכזי
 * ("מתחילים ללמוד"); בראש המסך כפתור "התחברות למערכת", המוביל גם הוא למסך 1."
 * The module's design note asks for "שפה חזותית מרגיעה … וצמצום אלמנטים
 * מסיחים": the logo and the two buttons, nothing else — no background shapes,
 * no animation, no feature cards, no footer. Both buttons lead to Screen 1
 * ('/login').
 */
export function LandingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user && user.role) {
      const roles = Array.isArray(user.role) ? user.role : [user.role as string];
      if (roles.includes("admin")) navigate("/admin", { replace: true });
      else if (roles.includes("teacher")) navigate("/dashboard", { replace: true });
      else if (roles.includes("student")) navigate("/hub", { replace: true });
    }
  }, [user, navigate]);

  return (
    <div dir="rtl" className="min-h-[100dvh] flex flex-col bg-ws-bg font-body text-ws-ink">
      <header className="w-full max-w-5xl mx-auto flex justify-between items-center gap-4 px-4 sm:px-6 py-4">
        <Logo size="lg" />
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-xl font-display font-bold text-sm bg-ws-surface text-ws-ink border border-ws-surface2 shadow-sm hover:bg-ws-surface2 active:scale-[0.97] transition-all duration-150 cursor-pointer focus-visible:ring-4 focus-visible:ring-[hsl(var(--ws-blue)/0.4)] focus-visible:outline-none"
        >
          <LogIn className="w-5 h-5" aria-hidden="true" />
          התחברות למערכת
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 pb-16">
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="inline-flex items-center justify-center gap-3 min-h-[64px] px-10 py-4 rounded-2xl font-display font-extrabold text-xl text-white bg-[hsl(var(--ws-blue))] shadow-md hover:brightness-105 active:scale-[0.97] transition-all duration-150 cursor-pointer focus-visible:ring-4 focus-visible:ring-[hsl(var(--ws-blue)/0.4)] focus-visible:outline-none"
        >
          מתחילים ללמוד
          <ArrowLeft className="w-6 h-6" aria-hidden="true" />
        </button>
      </main>
    </div>
  );
}
