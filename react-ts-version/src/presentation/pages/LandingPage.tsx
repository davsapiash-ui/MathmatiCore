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
    <div dir="rtl" className="relative min-h-screen bg-gradient-to-br from-ws-bg via-ws-bg to-[hsl(var(--ws-blue-soft)/0.4)] font-body text-ws-ink overflow-hidden selection:bg-[hsl(var(--ws-blue-soft))] selection:text-[hsl(var(--ws-blue))]">
      {/* Soft gradient orbs for background — minimal visual noise, pleasant aesthetics */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[hsl(var(--ws-blue)/0.12)] to-transparent blur-3xl" />
        <div className="absolute top-[20%] right-[5%] w-[400px] h-[400px] rounded-full bg-gradient-to-bl from-[hsl(var(--ws-accent)/0.08)] to-transparent blur-3xl" />
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full bg-gradient-to-bl from-[hsl(var(--ws-teal)/0.12)] to-transparent blur-3xl" />
      </div>

      {/* Navbar - Glassmorphic */}
      <nav className="relative z-10 w-full max-w-6xl mx-auto flex justify-between items-center px-6 py-4 mt-6 rounded-3xl bg-[hsl(var(--ws-surface)/0.6)] backdrop-blur-xl border border-[hsl(var(--ws-surface-2)/0.5)] shadow-[0_4px_30px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[hsl(var(--ws-blue))] to-[hsl(var(--ws-teal))] flex items-center justify-center rotate-[-4deg] shadow-md shadow-[hsl(var(--ws-blue)/0.2)]">
            <span className="text-2xl font-black leading-none font-display text-white">מ</span>
          </div>
          <span className="text-2xl font-display font-black text-ws-ink tracking-tight">
            מתמטיקאור &copy;
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => window.open("https://github.com/MathmatiCore", "_blank")}
            className="hidden md:inline-flex items-center px-6 py-2.5 rounded-full font-display font-bold text-ws-soft hover:text-ws-ink hover:bg-[hsl(var(--ws-surface-2)/0.6)] transition-all duration-300"
          >
            אודות המערכת
          </button>
          <button
            onClick={() => navigate("/login")}
            className="inline-flex items-center px-7 py-2.5 rounded-full font-display font-bold text-white bg-gradient-to-r from-[hsl(var(--ws-blue))] to-[hsl(var(--ws-teal))] shadow-lg shadow-[hsl(var(--ws-blue)/0.25)] hover:shadow-[hsl(var(--ws-blue)/0.4)] hover:brightness-105 active:scale-[0.98] transition-all duration-300"
          >
            התחברות למערכת
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 w-full max-w-6xl mx-auto px-6 pt-24 pb-32 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[hsl(var(--ws-surface)/0.8)] backdrop-blur-md text-[hsl(var(--ws-blue))] font-display font-bold text-sm mb-10 border border-[hsl(var(--ws-blue)/0.15)] shadow-sm"
        >
          מערכת למידה מותאמת אישית (UDL)
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="font-display font-black text-5xl md:text-7xl lg:text-[5rem] tracking-tight leading-[1.1] mb-8 text-ws-ink"
        >
          ללמוד מתמטיקה
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-[hsl(var(--ws-blue))] to-[hsl(var(--ws-teal))]">
            עם הידיים ועם הלב
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
          className="text-xl md:text-2xl text-ws-soft max-w-2xl mb-12 leading-relaxed"
        >
          סביבה פדגוגית חמה ומזמינה שבה תלמידים בונים הבנה של ערך המקום צעד אחר
          צעד — בקצב שלהם, בלי טיימרים ובלי לחץ.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
        >
          <button
            onClick={() => navigate("/login")}
            className="group relative inline-flex items-center justify-center gap-3 px-10 py-5 rounded-full font-display font-extrabold text-xl text-white overflow-hidden shadow-xl shadow-[hsl(var(--ws-blue)/0.3)] hover:shadow-[hsl(var(--ws-blue)/0.5)] hover:-translate-y-1 active:translate-y-0 transition-all duration-300"
          >
            {/* Button Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--ws-blue))] via-[hsl(var(--ws-teal))] to-[hsl(var(--ws-blue))] bg-[length:200%_auto] group-hover:bg-[position:100%_center] transition-all duration-500" />
            <span className="relative z-10">מתחילים ללמוד</span>
            <ArrowLeft className="relative z-10 w-6 h-6 group-hover:-translate-x-1 transition-transform duration-300" />
          </button>
        </motion.div>

        {/* Feature cards - Glassmorphic */}
        <div className="grid md:grid-cols-3 gap-8 mt-32 w-full text-right">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.15 }}
              className="relative p-10 rounded-3xl bg-[hsl(var(--ws-surface)/0.6)] backdrop-blur-xl border border-[hsl(var(--ws-surface-2)/0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-500 group"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(var(--ws-blue)/0.15)] to-[hsl(var(--ws-teal)/0.15)] flex items-center justify-center mb-8 border border-[hsl(var(--ws-blue)/0.1)] group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                <f.icon className="w-8 h-8 text-[hsl(var(--ws-blue))]" />
              </div>
              <h3 className="font-display font-extrabold text-2xl mb-4 text-ws-ink tracking-tight">{f.title}</h3>
              <p className="text-ws-soft text-lg leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[hsl(var(--ws-surface-2)/0.5)] bg-[hsl(var(--ws-surface)/0.4)] backdrop-blur-sm py-10 mt-auto text-center text-sm md:text-base font-medium text-ws-soft">
        מתמטיקאור &copy; — סביבת למידה פדגוגית לערך המקום
      </footer>
    </div>
  );
}
