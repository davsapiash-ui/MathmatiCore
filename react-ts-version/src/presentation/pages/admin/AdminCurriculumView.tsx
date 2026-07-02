import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Brain, SlidersHorizontal, ToggleLeft, ToggleRight } from "lucide-react";

export function AdminCurriculumView() {
  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">מנוע פדגוגי ו-Q-Matrix</h1>
        <p className="text-slate-500">שליטה באלגוריתמי הלמידה והפעלת מודולים</p>
      </header>

      <div className="grid md:grid-cols-2 gap-8">
        <AccessibleCard className="p-6 bg-white dark:bg-slate-900">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b pb-2">
            <SlidersHorizontal className="w-5 h-5 text-blue-500" />
            כיול רדאר הלמידה הסמוי (Silent Radar)
          </h2>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="font-medium text-slate-800 dark:text-slate-200">זמן היסוס לפתיחת אירוע קוגניטיבי (בשניות)</label>
                <span className="font-bold text-blue-600 dark:text-blue-400">30s</span>
              </div>
              <input type="range" min="10" max="120" defaultValue="30" className="w-full accent-blue-600" />
              <p className="text-xs text-slate-500 mt-1">כמה זמן התלמיד יכול לא לבצע פעולה לפני שהמערכת מסמנת "מאבק קוגניטיבי"</p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="font-medium text-slate-800 dark:text-slate-200">סף מחיקות לזיהוי חוסר ביטחון (פר משימה)</label>
                <span className="font-bold text-blue-600 dark:text-blue-400">3 פעולות</span>
              </div>
              <input type="range" min="1" max="10" defaultValue="3" className="w-full accent-blue-600" />
            </div>

            <UdlButton semanticColor="secondary" className="w-full mt-4">שמור כיול רדאר</UdlButton>
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b pb-2">
            <Brain className="w-5 h-5 text-purple-500" />
            מודולים קוגניטיביים (Q-Matrix)
          </h2>
          
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">מודול: גמישות בהמרה (Regrouping Flexibility)</p>
                <p className="text-sm text-slate-500">זיהוי הבנה של 10 יחידות כיחידת עשרת אחת</p>
              </div>
              <ToggleRight className="w-10 h-10 text-emerald-500 cursor-pointer" />
            </div>

            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">מודול: שטף חיבור בסיסי</p>
                <p className="text-sm text-slate-500">איתור שגיאות נפוצות בעובדות יסוד 1-20</p>
              </div>
              <ToggleRight className="w-10 h-10 text-emerald-500 cursor-pointer" />
            </div>

            <div className="flex justify-between items-center opacity-60">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">מודול: אסטרטגיות חיסור מורחב (בפיתוח)</p>
                <p className="text-sm text-slate-500">ניתוח פריטת עשרות לפעולות חיסור אנכי</p>
              </div>
              <ToggleLeft className="w-10 h-10 text-slate-400 cursor-not-allowed" />
            </div>
          </div>
        </AccessibleCard>
      </div>
    </div>
  );
}
