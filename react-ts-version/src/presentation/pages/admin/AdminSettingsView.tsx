import { useState } from "react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { useSettingsStore } from "@/application/useSettingsStore";
import { database } from "@/infrastructure/firebase";
import { ref, set } from "firebase/database";
import { AlertTriangle, Eye, Palette } from "lucide-react";

export function AdminSettingsView() {
  const { isASDMode, setASDMode } = useSettingsStore();
  const [resetStatus, setResetStatus] = useState("");

  const handleGlobalReset = async () => {
    if (!window.confirm("האם אתה בטוח? פעולה זו תנתק את כל התלמידים הפעילים ותרענן את המערכת לחלוטין!")) return;
    
    setResetStatus("מבצע איפוס...");
    try {
      await set(ref(database, 'system_control/last_reset'), Date.now());
      setResetStatus("איפוס בוצע בהצלחה. כל התלמידים נותקו ומסכי המורים רועננו.");
      setTimeout(() => setResetStatus(""), 4000);
    } catch {
      setResetStatus("שגיאה בביצוע איפוס מול השרת.");
    }
  };

  return (
    <div className="p-8">
      <header className="mb-8 border-b pb-4">
        <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">הגדרות מערכת ונגישות (UDL)</h1>
        <p className="text-slate-500">שליטה בתצורת הממשק, צבעים, ופקודות חירום</p>
      </header>

      <div className="grid md:grid-cols-2 gap-8">
        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-t-indigo-500">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b pb-2">
            <Eye className="w-5 h-5 text-indigo-500" />
            מצב נגישות סנסורית (ASD Mode)
          </h2>
          
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-bold text-slate-800 dark:text-slate-200">הפעלת ASD Mode באופן גלובלי</div>
              <div className="text-sm text-slate-500 max-w-md mt-1">
                מצב זה מפחית עומס חזותי לכל המשתמשים: מכבה אנימציות CSS לחלוטין, מרכך קונטרסטים חדים ומעלים אלמנטים מיותרים במסך.
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={isASDMode}
                onChange={(e) => setASDMode(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-t-emerald-500">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b pb-2">
            <Palette className="w-5 h-5 text-emerald-500" />
            נראות מותג (Branding & Colors)
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                ערכת נושא (Theme)
              </label>
              <select className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-transparent">
                <option value="light">בהיר (ברירת מחדל מערכתית)</option>
                <option value="dark">כהה (מצב לילה)</option>
                <option value="system">אוטומטי לפי מכשיר המשתמש</option>
              </select>
            </div>
            <UdlButton semanticColor="secondary" className="w-full mt-2">החל ערכת נושא</UdlButton>
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-t-red-600 md:col-span-2">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 border-b pb-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            בקרות חירום (Emergency Controls)
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            פעולות אלו מסוכנות. איפוס גלובלי משדר אות דרך Firebase לכל הלקוחות המחוברים (מורים ותלמידים כאחד) ומאלץ רענון/התנתקות.
          </p>
          
          <div className="flex items-center gap-4">
            <UdlButton semanticColor="danger" className="text-lg px-8 py-4" onClick={handleGlobalReset}>
              הפעל איפוס מערכת גלובלי (Global Kill-Switch)
            </UdlButton>
            {resetStatus && (
              <span className="font-bold text-red-600 animate-pulse bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">
                {resetStatus}
              </span>
            )}
          </div>
        </AccessibleCard>
      </div>
    </div>
  );
}
