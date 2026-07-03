import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "@/application/useAuthStore";
import { motion } from "framer-motion";
import { Blocks, MessageCircleQuestion, LayoutDashboard, ArrowLeft } from "lucide-react";

const FEATURES = [
  {
    icon: Blocks,
    title: "לוח ערך המקום",
    desc: "קוביות, עשרות ומאות שגוררים ביד — התלמידים בונים מספרים ומבינים באמת מה זה \"להקפיץ\" ו\"לפרוט\".",
  },
  {
    icon: MessageCircleQuestion,
    title: "חונך סוקרטי",
    desc: "חונך דיגיטלי ששואל שאלות מכוונות במקום לתת תשובות — כך שהתובנה נשארת של התלמיד.",
  },
  {
    icon: LayoutDashboard,
    title: "דשבורד מורים",
    desc: "תמונת מצב פדגוגית בזמן אמת: זיהוי מאבק, פערים ודפוסי חשיבה — בלי ציונים מלחיצים לתלמיד.",
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) {
      if (user.role === 'student') navigate('/hub', { replace: true });
      else if (user.role === 'teacher' || user.role === 'admin') navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  return (
    <div dir="rtl" className="relative min-h-screen bg-ws-bg font-body text-ws-ink overflow-hidden">
      {/* Flat vector background shapes — playful world energy, zero visual noise */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full" style={{ backgroundColor: 'hsl(var(--ws-blue) / 0.05)' }} />
        <div className="absolute -bottom-32 -right-20 w-[380px] h-[380px] rounded-full" style={{ backgroundColor: 'hsl(var(--ws-teal) / 0.06)' }} />
        <div className="absolute top-[26%] right-[14%] w-16 h-16 rounded-2xl rotate-12" style={{ backgroundColor: 'hsl(var(--ws-accent) / 0.05)' }} />
      </div>

      {/* Navbar */}
      <nav className="relative w-full max-w-6xl mx-auto flex justify-between items-center px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl ws-brand flex items-center justify-center rotate-[-4deg]">
            <span className="text-2xl font-black leading-none font-display">מ</span>
          </div>
          <span className="text-2xl font-display font-black text-ws-ink tracking-tight">
            מתמטיקאור
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.open("https://github.com/MathmatiCore", "_blank")}
            className="ws-chip hidden md:inline-flex items-center px-5 py-2.5 rounded-full font-display font-bold transition-all"
          >
            אודות המערכת
          </button>
          <button
            onClick={() => navigate("/login")}
            className="ws-brand inline-flex items-center px-5 py-2.5 rounded-full font-display font-bold hover:brightness-105 active:scale-[0.98] transition-all"
          >
            התחברות למערכת
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(var(--ws-blue-soft))] text-[hsl(var(--ws-blue))] font-display font-bold text-sm mb-8 border border-[hsl(var(--ws-blue)/0.25)]"
        >
          מערכת למידה מותאמת אישית (UDL)
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="font-display font-black text-5xl md:text-7xl tracking-tight leading-tight mb-6"
        >
          ללמוד מתמטיקה
          <br />
          <span className="text-[hsl(var(--ws-blue))]">עם הידיים ועם הלב</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="text-lg md:text-2xl text-ws-soft max-w-2xl mb-10 leading-relaxed"
        >
          סביבה פדגוגית חמה ומזמינה שבה תלמידים בונים הבנה של ערך המקום צעד אחר
          צעד — בקצב שלהם, בלי טיימרים ובלי לחץ.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.24 }}
        >
          <button
            onClick={() => navigate("/login")}
            className="ws-btn-primary inline-flex items-center gap-3 px-9 py-4 rounded-full font-display font-extrabold text-lg transition-all"
          >
            מתחילים ללמוד
            <ArrowLeft className="w-5 h-5" />
          </button>
        </motion.div>

        {/* Feature cards */}
        <div className="grid md:grid-cols-3 gap-6 mt-24 w-full text-right">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className="ws-card p-8 hover:-translate-y-1 hover:shadow-xl transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--ws-blue-soft))] flex items-center justify-center mb-6">
                <f.icon className="w-7 h-7 text-[hsl(var(--ws-blue))]" />
              </div>
              <h3 className="font-display font-extrabold text-xl mb-2 text-ws-ink">{f.title}</h3>
              <p className="text-ws-soft leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-ws-surface2 py-8 text-center text-sm text-ws-soft">
        מתמטיקאור — סביבת למידה פדגוגית לערך המקום
      </footer>
    </div>
  );
}
