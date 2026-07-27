import { useState } from "react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Brain, SlidersHorizontal, ToggleLeft, ToggleRight, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

export function AdminCurriculumView() {
  const [hesitationThreshold, setHesitationThreshold] = useState<number>(30);
  const [undoThreshold, setUndoThreshold] = useState<number>(3);
  const [isSaved, setIsSaved] = useState(false);

  const [regroupingEnabled, setRegroupingEnabled] = useState(true);
  const [fluencyEnabled, setFluencyEnabled] = useState(true);

  const handleSaveCalibration = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="p-6 md:p-10 pb-24 max-w-7xl mx-auto space-y-8" dir="rtl">
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 p-8 text-white shadow-2xl border border-purple-500/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-semibold">
              <Brain className="w-3.5 h-3.5" />
              <span>אלגוריתמיקת Q-Matrix ורדאר סמוי</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              כיול מנוע פדגוגי ומיפוי קוגניטיבי
            </h1>
            <p className="text-slate-300 text-sm md:text-base font-light">
              שליטה ברגישות מערכת ניטור ה-Trace Data, כיול ספי היסוס ומודולי אבחון אוטומטיים.
            </p>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Calibration Panel */}
        <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-indigo-500" />
              כיול רדאר פדגוגי (Trace Data Calibration)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              הגדרת סף הרגישות לזיהוי מאבק קוגניטיבי סמוי במהלך עבודת התלמיד
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <label className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  סף זיהוי השהייה (Hesitation Threshold)
                </label>
                <span className="font-black text-indigo-600 dark:text-indigo-400 text-base font-mono bg-indigo-50 dark:bg-indigo-950 px-3 py-1 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  {hesitationThreshold} שניות
                </span>
              </div>
              <input 
                type="range" 
                min="10" 
                max="120" 
                value={hesitationThreshold}
                onChange={(e) => setHesitationThreshold(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 h-2 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer" 
              />
              <p className="text-xs text-slate-500 leading-relaxed">
                משך הזמן המרבי (בשניות) שבו הלומד אינו מבצע פעולה יצרנית, בטרם המערכת מתעדת אירוע של "מאבק קוגניטיבי" (Cognitive Struggle).
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <label className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  סף זיהוי חוסר ביטחון (Undo Threshold)
                </label>
                <span className="font-black text-indigo-600 dark:text-indigo-400 text-base font-mono bg-indigo-50 dark:bg-indigo-950 px-3 py-1 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  {undoThreshold} פעולות
                </span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={undoThreshold}
                onChange={(e) => setUndoThreshold(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 h-2 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer" 
              />
              <p className="text-xs text-slate-500 leading-relaxed">
                מספר הפעולות הרצופות של "ביטול" (Undo) או "מחיקה" אשר יסווגו את הלומד כזקוק להכוונה באסטרטגיית הפתרון.
              </p>
            </div>

            {isSaved && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>הגדרות הכיול נשמרו בהצלחה ויוחלו על ניטור הלייב!</span>
              </div>
            )}

            <UdlButton 
              semanticColor="primary" 
              className="w-full justify-center py-3.5 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
              onClick={handleSaveCalibration}
            >
              שמור הגדרות כיול
            </UdlButton>
          </div>
        </AccessibleCard>

        {/* Diagnostic Modules Panel */}
        <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-500" />
              ניהול מודולים מאבחנים (Diagnostic Modules)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              הפעלה וניהול של אלגוריתמי האבחון הפעילים במטריצת Q-Matrix
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 transition-all hover:border-emerald-300">
              <div className="space-y-1">
                <p className="font-bold text-sm text-slate-900 dark:text-white">גמישות בהמרת עשרות (Regrouping Flexibility)</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  אלגוריתם המנתח את יכולת הלומד לזהות ולהמיר קבוצה של 10 יחידות לעשרת אחת שלמה.
                </p>
              </div>
              <button onClick={() => setRegroupingEnabled(!regroupingEnabled)} className="shrink-0 mr-4">
                {regroupingEnabled ? (
                  <ToggleRight className="w-10 h-10 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-slate-400" />
                )}
              </button>
            </div>

            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 transition-all hover:border-emerald-300">
              <div className="space-y-1">
                <p className="font-bold text-sm text-slate-900 dark:text-white">שטף חיבור בסיסי (Basic Addition Fluency)</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  מיפוי אוטומטי של שגיאות שיטתיות בחישוב עובדות יסוד בתחום ה-20 (קשיי שליפה).
                </p>
              </div>
              <button onClick={() => setFluencyEnabled(!fluencyEnabled)} className="shrink-0 mr-4">
                {fluencyEnabled ? (
                  <ToggleRight className="w-10 h-10 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-slate-400" />
                )}
              </button>
            </div>

            <div className="flex justify-between items-center opacity-60 p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <p className="font-bold text-sm text-slate-800 dark:text-slate-200">אסטרטגיות חיסור מורחב (בפיתוח)</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  הערכה קוגניטיבית של יכולת פריטת עשרות כהכנה לחיסור במאונך.
                </p>
              </div>
              <ToggleLeft className="w-10 h-10 text-slate-400 cursor-not-allowed shrink-0 mr-4" />
            </div>
          </div>
        </AccessibleCard>
      </div>
    </div>
  );
}
