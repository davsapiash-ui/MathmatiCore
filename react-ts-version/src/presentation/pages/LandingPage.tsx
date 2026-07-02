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
    <div dir="rtl" className="min-h-screen bg-ws-bg font-body text-ws-ink">
      {/* Navbar */}
      <nav className="w-full max-w-6xl mx-auto flex justify-between items-center px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-ws-accent flex items-center justify-center shadow-md">
            <span className="text-2xl font-black text-white leading-none font-display">מ</span>
          </div>
          <span className="text-2xl font-display font-black text-ws-ink tracking-tight">
            מתמטיקאור
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.open("https://github.com/MathmatiCore", "_blank")}
            className="hidden md:inline-flex items-center px-5 py-2.5 rounded-full font-display font-bold text-ws-soft bg-ws-surface border border-ws-surface2 hover:text-ws-ink hover:border-ws-accent/40 transition-colors"
          >
            אודות המערכת
          </button>
          <button
            onClick={() => navigate("/login")}
            className="inline-flex items-center px-5 py-2.5 rounded-full font-display font-bold text-white bg-ws-accent shadow-md hover:brightness-105 active:scale-[0.98] transition-all"
          >
            התחברות למערכת
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 pt-16 pb-24 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ws-accentSoft text-ws-accent font-display font-bold text-sm mb-8 border border-ws-accent/25"
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
          <span className="text-ws-accent">עם הידיים ועם הלב</span>
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
            className="inline-flex items-center gap-3 px-9 py-4 rounded-full font-display font-extrabold text-lg text-white bg-ws-accent shadow-lg hover:brightness-105 hover:-translate-y-0.5 active:scale-[0.98] transition-all"
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
              className="bg-ws-surface rounded-3xl shadow-lg border border-ws-surface2 p-8 hover:-translate-y-1 hover:shadow-xl transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-ws-accentSoft flex items-center justify-center mb-6">
                <f.icon className="w-7 h-7 text-ws-accent" />
              </div>
              <h3 className="font-display font-extrabold text-xl mb-2 text-ws-ink">{f.title}</h3>
              <p className="text-ws-soft leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-ws-surface2 py-8 text-center text-sm text-ws-soft">
        מתמטיקאור — סביבת למידה פדגוגית לערך המקום
      </footer>
    </div>
  );
}
