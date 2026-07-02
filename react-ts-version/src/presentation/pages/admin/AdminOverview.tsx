import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { Activity, Users, GraduationCap, ShieldAlert } from "lucide-react";

export function AdminOverview() {
  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">סקירה כללית</h1>
        <p className="text-slate-500">מצב המערכת ונתוני ציות בזמן אמת</p>
      </header>

      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-slate-500 font-medium">מוסדות פעילים</p>
              <h3 className="text-3xl font-black mt-1">12</h3>
            </div>
            <GraduationCap className="w-8 h-8 text-blue-500 opacity-80" />
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-emerald-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-slate-500 font-medium">מורים רשומים</p>
              <h3 className="text-3xl font-black mt-1">145</h3>
            </div>
            <Users className="w-8 h-8 text-emerald-500 opacity-80" />
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-purple-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-slate-500 font-medium">תלמידים במערכת</p>
              <h3 className="text-3xl font-black mt-1">3,420</h3>
            </div>
            <Activity className="w-8 h-8 text-purple-500 opacity-80" />
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900 border-t-4 border-amber-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-slate-500 font-medium">התראות מערכת</p>
              <h3 className="text-3xl font-black mt-1">0</h3>
            </div>
            <ShieldAlert className="w-8 h-8 text-amber-500 opacity-80" />
          </div>
        </AccessibleCard>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <AccessibleCard className="p-6 bg-white dark:bg-slate-900">
          <h2 className="text-xl font-bold border-b pb-2 mb-4">יומן אירועים (Audit Log)</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-slate-600 dark:text-slate-400">10:42 02/07/2026</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">Admin_David יצר מוסד חדש "ביה״ס הדרים"</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-slate-600 dark:text-slate-400">09:15 02/07/2026</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">System Backup הושלם בהצלחה</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-slate-600 dark:text-slate-400">08:00 02/07/2026</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">מחיקת נתונים אוטומטית (GDPR) בוצעה</span>
            </div>
          </div>
        </AccessibleCard>

        <AccessibleCard className="p-6 bg-white dark:bg-slate-900">
          <h2 className="text-xl font-bold border-b pb-2 mb-4">תאימות והגנת פרטיות</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-slate-700 dark:text-slate-300">הצפנת נתונים (At Rest) - פעיל</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-slate-700 dark:text-slate-300">עמידה בתקן COPPA - מאושר</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-slate-700 dark:text-slate-300">אנונימיזציה אוטומטית למידע סטטיסטי - פעיל</span>
            </div>
          </div>
        </AccessibleCard>
      </div>
    </div>
  );
}
