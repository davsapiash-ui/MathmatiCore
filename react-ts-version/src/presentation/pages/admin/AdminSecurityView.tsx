import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Key, Clock, Fingerprint } from "lucide-react";

export function AdminSecurityView() {
  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">אבטחה והרשאות</h1>
        <p className="text-slate-500">ניהול זהויות, SSO ואבטחת גישה</p>
      </header>

      <div className="grid md:grid-cols-2 gap-8">
        <AccessibleCard className="p-6 bg-white dark:bg-slate-900">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b pb-2">
            <Fingerprint className="w-5 h-5 text-indigo-500" />
            הזדהות אחידה (SSO Integrations)
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            הגדרת ממשקי הזדהות אחידה לבתי ספר ומחוזות לימוד למניעת צורך בסיסמאות מקומיות.
          </p>

          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">Google Workspace for Education</p>
                <p className="text-xs text-slate-500">סטטוס: פעיל ומקושר ל-12 מוסדות</p>
              </div>
              <UdlButton variant="outline" semanticColor="neutral" className="text-sm">הגדרות</UdlButton>
            </div>

            <div className="flex justify-between items-center p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">הזדהות אחידה - משרד החינוך</p>
                <p className="text-xs text-slate-500">סטטוס: ממתין למפתחות API</p>
              </div>
              <UdlButton semanticColor="primary" className="text-sm">הוסף אינטגרציה</UdlButton>
            </div>
          </div>
        </AccessibleCard>

        <div className="space-y-8">
          <AccessibleCard className="p-6 bg-white dark:bg-slate-900">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 border-b pb-2">
              <Clock className="w-5 h-5 text-amber-500" />
              מדיניות Session
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ניתוק אוטומטי למורים (דקות חוסר פעילות)
                </label>
                <input type="number" defaultValue="30" className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ניתוק אוטומטי לתלמידים (דקות חוסר פעילות)
                </label>
                <input type="number" defaultValue="15" className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-transparent" />
              </div>
              <UdlButton semanticColor="secondary" className="w-full">עדכן מדיניות זמן</UdlButton>
            </div>
          </AccessibleCard>

          <AccessibleCard className="p-6 bg-white dark:bg-slate-900">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 border-b pb-2 text-red-600">
              <Key className="w-5 h-5" />
              בקרת גישה (RBAC)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              גישה ישירה לעדכון Roles במסד הנתונים הראשי ב-Firebase.
            </p>
            <UdlButton variant="outline" semanticColor="neutral" className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
              ניהול הרשאות ברמת שרת (Firestore Rules)
            </UdlButton>
          </AccessibleCard>
        </div>
      </div>
    </div>
  );
}
