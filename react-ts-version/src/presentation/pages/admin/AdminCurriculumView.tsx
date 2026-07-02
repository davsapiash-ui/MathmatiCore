import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Brain, SlidersHorizontal, ToggleLeft, ToggleRight } from "lucide-react";

export function AdminCurriculumView() {
  return (
    <div className="p-8 pb-20 max-w-6xl mx-auto" dir="rtl">
      <header className="mb-8 border-b pb-4">
        <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">מנוע פדגוגי ומיפוי קוגניטיבי (Q-Matrix)</h1>
        <p className="text-slate-500 mt-2">
          ניהול אלגוריתמי הלמידה, שליטה ברגישות מערכת הניטור הסמויה, והפעלת מודולי אבחון קוגניטיביים.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-8">
        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-t-blue-500 shadow-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b pb-2">
            <SlidersHorizontal className="w-5 h-5 text-blue-500" />
            כיול רדאר פדגוגי (Trace Data Calibration)
          </h2>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="font-medium text-slate-800 dark:text-slate-200">
                  סף זיהוי השהייה (Hesitation Threshold)
                </label>
                <span className="font-bold text-blue-600 dark:text-blue-400">30 שניות</span>
              </div>
              <input type="range" min="10" max="120" defaultValue="30" className="w-full accent-blue-600" />
              <p className="text-xs text-slate-500 mt-1">
                משך הזמן המקסימלי (בשניות) שבו הלומד אינו מבצע פעולה יצרנית, בטרם המערכת מתעדת אירוע של "מאבק קוגניטיבי" (Cognitive Struggle).
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="font-medium text-slate-800 dark:text-slate-200">
                  סף זיהוי חוסר ביטחון (Undo Threshold)
                </label>
                <span className="font-bold text-blue-600 dark:text-blue-400">3 פעולות</span>
              </div>
              <input type="range" min="1" max="10" defaultValue="3" className="w-full accent-blue-600" />
              <p className="text-xs text-slate-500 mt-1">
                מספר הפעולות הרצופות של "ביטול" (Undo) או "מחיקה" אשר יסווגו את הלומד כזקוק להכוונה באסטרטגיית הפתרון.
              </p>
            </div>

            <UdlButton semanticColor="primary" className="w-full mt-4 font-bold tracking-wide">
              שמור הגדרות כיול
            </UdlButton>
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-t-purple-500 shadow-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b pb-2">
            <Brain className="w-5 h-5 text-purple-500" />
            ניהול מודולים מאבחנים (Diagnostic Modules)
          </h2>
          
          <div className="space-y-6">
            <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors hover:border-emerald-200">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">גמישות בהמרת עשרות (Regrouping Flexibility)</p>
                <p className="text-sm text-slate-500 mt-1">
                  אלגוריתם המנתח את יכולת הלומד לזהות ולהמיר קבוצה של 10 יחידות לעשרת אחת שלמה.
                </p>
              </div>
              <ToggleRight className="w-10 h-10 text-emerald-500 cursor-pointer flex-shrink-0 mr-4" />
            </div>

            <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors hover:border-emerald-200">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">שטף חיבור בסיסי (Basic Addition Fluency)</p>
                <p className="text-sm text-slate-500 mt-1">
                  מיפוי אוטומטי של שגיאות שיטתיות בחישוב עובדות יסוד בתחום ה-20 (קשיי שליפה).
                </p>
              </div>
              <ToggleRight className="w-10 h-10 text-emerald-500 cursor-pointer flex-shrink-0 mr-4" />
            </div>

            <div className="flex justify-between items-center opacity-50 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">אסטרטגיות חיסור מורחב (בפיתוח)</p>
                <p className="text-sm text-slate-500 mt-1">
                  הערכה קוגניטיבית של יכולת פריטת עשרות כהכנה לחיסור במאונך.
                </p>
              </div>
              <ToggleLeft className="w-10 h-10 text-slate-400 cursor-not-allowed flex-shrink-0 mr-4" />
            </div>
          </div>
        </AccessibleCard>
      </div>
    </div>
  );
}
