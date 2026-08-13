import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Key, Clock, Fingerprint, ShieldCheck } from "lucide-react";

export function AdminSecurityView() {
  return (
    <div className="p-6 md:p-10 pb-24 max-w-7xl mx-auto space-y-8" dir="rtl">
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-2xl border border-indigo-500/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>אבטחת מידע, SSO והרשאות מערכת</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              ניהול אבטחה וזהויות
            </h1>
            <p className="text-slate-300 text-sm md:text-base font-light">
              אינטגרציות SSO, ניהול מנגנוני Session, ומדיניות הרשאות RBAC ברמת Firebase Server.
            </p>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-8">
        <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-indigo-500" />
              הזדהות אחידה (SSO Integrations)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              הגדרת ממשקי הזדהות אחידה לבתי ספר ומחוזות לימוד למניעת צורך בסיסמאות מקומיות.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950/60">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                  <span>Google Workspace for Education</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-md font-bold">
                    פעיל ומאובטח
                  </span>
                </div>
                <p className="text-xs text-slate-500">מגבלת דומיין קשיחה: @edu-haifa.org.il</p>
              </div>
              <UdlButton variant="outline" semanticColor="neutral" className="text-xs font-bold rounded-xl px-4 py-2">
                הגדרות
              </UdlButton>
            </div>

            <div className="flex justify-between items-center p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950/60">
              <div className="space-y-1">
                <p className="font-bold text-slate-900 dark:text-white text-sm">הזדהות אחידה - משרד החינוך (מנב"סנט)</p>
                <p className="text-xs text-slate-500">סטטוס: ממתין למפתחות API רשמיים</p>
              </div>
              <UdlButton semanticColor="primary" className="text-xs font-bold rounded-xl px-4 py-2 bg-indigo-600 text-white">
                הוסף אינטגרציה
              </UdlButton>
            </div>
          </div>
        </AccessibleCard>

        <div className="space-y-8">
          <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                מדיניות זמן Session וניתוק אוטומטי
              </h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ניתוק אוטומטי למורים (דקות חוסר פעילות)
                </label>
                <input 
                  type="number" 
                  defaultValue="30" 
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3 text-sm font-bold focus:border-indigo-500 outline-none" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ניתוק אוטומטי לתלמידים (דקות חוסר פעילות)
                </label>
                <input 
                  type="number" 
                  defaultValue="15" 
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl p-3 text-sm font-bold focus:border-indigo-500 outline-none" 
                />
              </div>
              <UdlButton semanticColor="secondary" className="w-full justify-center py-3 rounded-xl font-bold">
                עדכן מדיניות זמן
              </UdlButton>
            </div>
          </AccessibleCard>

          <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-4">
            <h2 className="text-xl font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Key className="w-5 h-5" />
              בקרת גישה והרשאות (RBAC)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              גישה ישירה לעדכון תפקידים (Roles) במסד הנתונים הראשי ב-Firebase Security Rules.
            </p>
            <UdlButton 
              variant="outline" 
              semanticColor="neutral" 
              className="w-full justify-center py-3 border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold rounded-xl text-xs"
            >
              ניהול הרשאות ברמת שרת (Realtime DB & Firestore Rules)
            </UdlButton>
          </AccessibleCard>
        </div>
      </div>
    </div>
  );
}
