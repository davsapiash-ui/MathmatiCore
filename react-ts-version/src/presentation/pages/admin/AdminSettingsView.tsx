import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { Palette, Activity } from "lucide-react";

export function AdminSettingsView() {
  return (
    <div className="p-8 pb-20 max-w-6xl mx-auto" dir="rtl">
      <header className="mb-8 border-b pb-4">
        <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">הגדרות נגישות ופדגוגיה (UDL)</h1>
        <p className="text-slate-500 mt-2">ניהול הכלים האוניברסליים ללמידה וניטור התלמידים מתוך מסמך האפיון</p>
      </header>

      <div className="grid md:grid-cols-2 gap-8">
        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-t-emerald-500 shadow-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b pb-2">
            <Palette className="w-5 h-5 text-emerald-500" />
            ערכת נושא ונגישות צבעים
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                התאמת קונטרסט
              </label>
              <select className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-transparent text-sm">
                <option value="light">מצב יום (ברירת מחדל)</option>
                <option value="dark">מצב לילה (הפחתת סינוור)</option>
                <option value="high-contrast">ניגודיות גבוהה (ללקויי ראייה)</option>
              </select>
            </div>
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-t-blue-500 md:col-span-2 shadow-sm">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 border-b pb-2 text-blue-600">
            <Activity className="w-5 h-5" />
            הגדרות רדאר פדגוגי שקט (Trace Data)
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            שליטה על אלגוריתם ה-Q-Matrix והניטור הסמוי בממשק התלמיד. מערכת זו עוקבת אחר אירועי היסוס (Hesitation), מחיקות, וזמני השהייה כדי לספק תובנות למורה מבלי להלחיץ את התלמיד (ללא טיימרים גלויים).
          </p>
          
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex flex-col">
              <span className="font-bold text-slate-800 dark:text-slate-200">איסוף נתוני קושי בזמן אמת</span>
              <span className="text-xs text-slate-500 mt-1">מפעיל התראות לדשבורד המורה במקרים של מאבק קוגניטיבי (Cognitive Struggle).</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </AccessibleCard>
      </div>
    </div>
  );
}
