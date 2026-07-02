import { useNavigate } from "react-router-dom";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Brain, GraduationCap, ArrowLeft, Layers } from "lucide-react";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30 overflow-hidden relative" dir="rtl">
      {/* Background Ornaments */}
      <div className="absolute top-[-10%] left-[-10%] w-[800px] h-[800px] bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent blur-[120px] -z-10 rounded-full mix-blend-multiply dark:mix-blend-screen animate-in fade-in duration-1000" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[1000px] h-[1000px] bg-gradient-to-tl from-cyan-500/10 via-blue-500/5 to-transparent blur-[120px] -z-10 rounded-full mix-blend-multiply dark:mix-blend-screen animate-in fade-in duration-1000 delay-300" />

      {/* Navbar */}
      <nav className="w-full flex justify-between items-center p-6 lg:px-12 backdrop-blur-2xl bg-white/40 dark:bg-slate-900/40 border-b border-white/20 dark:border-white/5 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Brain className="text-white w-6 h-6" />
          </div>
          <span className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-l from-indigo-600 to-cyan-500 tracking-tight">
            MathmatiCore
          </span>
        </div>
        <div className="flex items-center gap-4">
          <UdlButton 
            semanticColor="neutral" 
            className="hidden md:flex bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/5 hover:bg-white/80 dark:hover:bg-white/10 rounded-full px-6 transition-all"
            onClick={() => window.open("https://github.com/MathmatiCore", "_blank")}
          >
            אודות המערכת
          </UdlButton>
          <UdlButton 
            semanticColor="primary" 
            className="rounded-full px-6 shadow-md shadow-indigo-500/20"
            onClick={() => navigate("/login")}
          >
            התחברות למערכת
          </UdlButton>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 pt-24 pb-32 flex flex-col items-center text-center relative z-10">
        <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/60 dark:bg-white/5 text-indigo-600 dark:text-indigo-300 font-medium text-sm mb-10 border border-white/40 dark:border-white/10 shadow-sm backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          מערכת למידה מותאמת אישית (UDL)
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-8 leading-tight animate-in fade-in slide-in-from-bottom-6 duration-700">
          ללמוד מתמטיקה <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-indigo-600 via-purple-500 to-cyan-400">
            בדרך החכמה ביותר
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 max-w-3xl mb-12 font-light leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
          פלטפורמה פדגוגית חכמה שמתאימה את עצמה לכל תלמיד, מבוססת על עקרונות העיצוב האוניברסלי ללמידה ומופעלת על ידי אלגוריתמים מתקדמים.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
          <UdlButton 
            semanticColor="primary" 
            className="text-lg px-8 py-6 rounded-2xl gap-3 shadow-xl shadow-indigo-500/20 hover:shadow-2xl hover:shadow-indigo-500/30 transition-all hover:-translate-y-1"
            onClick={() => navigate("/login")}
          >
            התחל למידה עכשיו
            <ArrowLeft className="w-5 h-5" />
          </UdlButton>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-32 w-full animate-in fade-in duration-1000 delay-500 relative">
          <div className="glass-card p-10 rounded-[2rem] hover:-translate-y-2 hover:shadow-2xl hover:border-indigo-400/50 transition-all duration-500 group">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 flex items-center justify-center mb-8 border border-indigo-500/10 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 shadow-inner">
              <Layers className="w-7 h-7 text-indigo-500" />
            </div>
            <h3 className="text-2xl font-bold mb-3">עיצוב אוניברסלי (UDL)</h3>
            <p className="text-slate-500 dark:text-slate-400 font-light">
              ייצוגים חזותיים מרובים למתמטיקה, ממשק נטול עומס חזותי ותמיכה מלאה בנגישות.
            </p>
          </div>

          <div className="glass-card p-10 rounded-[2rem] hover:-translate-y-2 hover:shadow-2xl hover:border-purple-400/50 transition-all duration-500 group">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 flex items-center justify-center mb-8 border border-purple-500/10 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500 shadow-inner">
              <Brain className="w-7 h-7 text-purple-500" />
            </div>
            <h3 className="text-2xl font-bold mb-3">רדאר פדגוגי סמוי</h3>
            <p className="text-slate-500 dark:text-slate-400 font-light">
              זיהוי אוטומטי של מאבק קוגניטיבי, חוסר ביטחון או שיוט פסיבי ללא הצפת התלמיד.
            </p>
          </div>

          <div className="glass-card p-10 rounded-[2rem] hover:-translate-y-2 hover:shadow-2xl hover:border-cyan-400/50 transition-all duration-500 group">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 flex items-center justify-center mb-8 border border-cyan-500/10 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 shadow-inner">
              <GraduationCap className="w-7 h-7 text-cyan-500" />
            </div>
            <h3 className="text-2xl font-bold mb-3">דשבורד מורים ומנהלים</h3>
            <p className="text-slate-500 dark:text-slate-400 font-light">
              ניתוח נתונים מתקדם בזמן אמת, זיהוי פערים מערכתיים וניהול קל של כיתות ומורים.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
