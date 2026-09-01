import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { Key, Clock, Fingerprint, ShieldCheck, CheckCircle2, MinusCircle } from "lucide-react";
import { STUDENT_WINDOW_CLOSE_TIMEOUT_MS } from "@/application/useAuthStore";

const STAFF_IDLE_TIMEOUT_MINUTES = 30; // useIdleTimeout.ts IDLE_TIMEOUT_MS
const STUDENT_IDLE_TIMEOUT_MINUTES = Math.round(STUDENT_WINDOW_CLOSE_TIMEOUT_MS / 60000);

/**
 * Module 27 is a *server-side* spec: every rule it defines is enforced in
 * firestore.rules / database.rules.json / storage.rules and deployed through
 * CI, and §ב.6 requires private API keys to live only in Google Cloud Secret
 * Manager. Nothing in it asks for an in-app editor, and this console has no
 * mechanism to change any of it.
 *
 * This screen therefore reports the policy that is actually in force. It
 * previously rendered an editable-looking control panel — "הגדרות", "הוסף
 * אינטגרציה", "עדכן מדיניות זמן", "ניהול הרשאות ברמת שרת" — where not one
 * control had an onClick, the session inputs had no onChange, and the student
 * timeout shown (15 minutes) did not match the 5 the app actually enforces.
 */
function StatusRow({
  active,
  title,
  detail,
}: {
  active: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950/60">
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          active
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-slate-400/10 text-slate-400"
        }`}
      >
        {active ? <CheckCircle2 className="w-5 h-5" /> : <MinusCircle className="w-5 h-5" />}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm flex-wrap">
          <span>{title}</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
              active
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {active ? "אכיפה פעילה" : "לא מוגדר"}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

export function AdminSecurityView() {
  return (
    <div className="p-6 md:p-10 pb-24 max-w-7xl mx-auto space-y-8" dir="rtl">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-2xl border border-indigo-500/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>מדיניות אבטחה נאכפת בצד השרת</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
            ניהול אבטחה וזהויות
          </h1>
          <p className="text-slate-300 text-sm md:text-base font-light max-w-3xl">
            תצוגת סטטוס בלבד. כללי ההרשאות נאכפים ב-Firestore Rules, ב-Realtime DB Rules
            וב-Storage Rules, ונפרסים דרך צינור ה-CI — לא מתוך הקונסולה הזו.
          </p>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-8">
        <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-indigo-500" />
              הזדהות אחידה (SSO)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              מנגנוני ההזדהות הפעילים בפועל עבור צוות ההוראה.
            </p>
          </div>

          <div className="space-y-4">
            <StatusRow
              active
              title="Google Workspace for Education"
              detail="הרשאת מורה ניתנת אך ורק בהתאמה מדויקת של כתובת הדוא״ל מול אוסף authorizedTeachers ב-Firestore. אין אישור אוטומטי לפי סיומת דומיין."
            />
            <StatusRow
              active={false}
              title='הזדהות אחידה — משרד החינוך (מנב"סנט)'
              detail="לא מחוברת. אין אינטגרציה פעילה או מפתחות רשומים במערכת."
            />
          </div>
        </AccessibleCard>

        <div className="space-y-8">
          <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                מדיניות ניתוק אוטומטי
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                הערכים שהאפליקציה אוכפת בפועל בכל התחברות.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950/60">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  צוות (מורים ומנהלים)
                </span>
                <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                  {STAFF_IDLE_TIMEOUT_MINUTES} דקות חוסר פעילות
                </span>
              </div>
              <div className="flex justify-between items-center p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950/60">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  תלמידים
                </span>
                <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                  {STUDENT_IDLE_TIMEOUT_MINUTES} דקות חוסר פעילות או סגירת חלון
                </span>
              </div>
            </div>
          </AccessibleCard>

          <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Key className="w-5 h-5 text-rose-500" />
              בקרת גישה, סודות ומפתחות
            </h2>

            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <li className="flex gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>תלמיד קורא אך ורק את מסמך התלמיד שלו, וכותב טלמטריה רק כאשר student_id תואם את מזהה ה-Auth שלו (1–12).</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>מורה קורא נתוני כיתה משויכת בלבד, ורשאי לכתוב שדות אישור שער ופרופיל תמיכה — וחסום משינוי הגדרות ניהול גלובליות.</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>מפתח ה-Gemini מוחזק ב-Google Cloud Secret Manager ומוזרק לפונקציות בלבד — לעולם לא נחשף ללקוח.</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>כתיבת דוחות פדגוגיים וגיבויי איפוס מתבצעת אך ורק ב-Admin SDK מצד השרת; ללקוח יש קריאה בלבד.</span>
              </li>
            </ul>

            <p className="text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3 leading-relaxed">
              שינוי כללי ההרשאות מתבצע בקבצי firestore.rules · database.rules.json · storage.rules
              ונפרס אוטומטית במיזוג לענף הראשי.
            </p>
          </AccessibleCard>
        </div>
      </div>
    </div>
  );
}
