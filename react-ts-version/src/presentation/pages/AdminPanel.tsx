import { useState } from "react";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { useSettingsStore } from "@/application/useSettingsStore";
import { ref, set } from "firebase/database";
import { database } from "@/infrastructure/firebase";

export function AdminPanel() {
  const { isASDMode, setASDMode } = useSettingsStore();
  const [resetStatus, setResetStatus] = useState("");

  const handleGlobalReset = async () => {
    if (!confirm("האם אתה בטוח? פעולה זו תנתק את כל התלמידים הפעילים ותרענן את המערכת.")) return;
    
    setResetStatus("מבצע איפוס...");
    try {
      await set(ref(database, 'system_control/last_reset'), Date.now());
      setResetStatus("איפוס בוצע בהצלחה. כל התלמידים נותקו.");
      setTimeout(() => setResetStatus(""), 3000);
    } catch (e) {
      setResetStatus("שגיאה בביצוע איפוס.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8" dir="rtl">
      <header className="mb-8 border-b pb-4">
        <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">פאנל ניהול (Admin)</h1>
        <p className="text-slate-500">הגדרות מערכת ובקרת חירום</p>
      </header>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl">
        {/* System Settings */}
        <AccessibleCard className="p-6 bg-white dark:bg-slate-950">
          <h2 className="text-xl font-bold border-b pb-2 mb-4">הגדרות סביבה גלובליות</h2>
          
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">מצב נגישות (ASD Mode)</div>
              <div className="text-sm text-slate-500">הפחתת עומס חזותי והשהיית אנימציות. נשמר מקומית ב-Zustand.</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={isASDMode}
                onChange={(e) => setASDMode(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </AccessibleCard>

        {/* Emergency Controls */}
        <AccessibleCard className="p-6 bg-white dark:bg-slate-950 border-t-4 border-t-red-500">
          <h2 className="text-xl font-bold border-b pb-2 mb-4 text-red-600">בקרות חירום</h2>
          <p className="text-sm text-slate-600 mb-6">
            פעולות אלו משפיעות באופן מיידי על כל המשתמשים המחוברים למערכת באמצעות Firebase Realtime Database.
          </p>
          
          <UdlButton semanticColor="danger" className="w-full text-lg" onClick={handleGlobalReset}>
            איפוס מערכת גלובלי (Global Reset)
          </UdlButton>
          
          {resetStatus && (
            <p className="mt-4 text-center font-bold text-red-600">{resetStatus}</p>
          )}
        </AccessibleCard>
      </div>
    </div>
  );
}
