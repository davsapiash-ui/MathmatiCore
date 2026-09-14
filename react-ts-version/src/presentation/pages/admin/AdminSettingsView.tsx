import { useState } from "react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import {
  Palette,
  Activity,
  ArrowLeft,
  Info,
  FolderSync,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trash2,
  FolderPlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface TidyDriveResult {
  foldersCreated: string[];
  filesMoved: Array<{ name: string; to: string }>;
  filesTrashed: Array<{ name: string; reason?: string }>;
  failures: Array<{ file: string; error: string }>;
}

function PointerRow({
  icon,
  title,
  body,
  to,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  to?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-start gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="space-y-2">
        <h3 className="font-bold text-slate-900 dark:text-white text-sm">{title}</h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{body}</p>
        {to && linkLabel && (
          <Link
            to={to}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <span>{linkLabel}</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

export function AdminSettingsView() {
  const [isTidyConfirmOpen, setIsTidyConfirmOpen] = useState(false);
  const [isTidying, setIsTidying] = useState(false);
  const [tidyResult, setTidyResult] = useState<TidyDriveResult | null>(null);
  const [tidyError, setTidyError] = useState<string | null>(null);

  const handleRunTidy = async () => {
    setIsTidyConfirmOpen(false);
    setIsTidying(true);
    setTidyResult(null);
    setTidyError(null);

    try {
      const { httpsCallable } = await import("firebase/functions");
      const { functions } = await import("@/infrastructure/firebase");
      const tidyFn = httpsCallable<
        Record<string, never>,
        TidyDriveResult
      >(functions, "tidyDriveFolder", { timeout: 540_000 });

      const res = await tidyFn({});
      setTidyResult(res.data);
      toast.success("סידור תיקיית הדרייב הושלם בהצלחה!");
    } catch (err: unknown) {
      console.error("Failed to tidy drive folder:", err);
      const errMsg = (err as { message?: string })?.message || "תקלה בהפעלת פעולת סידור הדרייב.";
      setTidyError(errMsg);
      toast.error("סידור תיקיית הדרייב נכשל");
    } finally {
      setIsTidying(false);
    }
  };

  return (
    <div className="p-6 md:p-10 pb-24 max-w-5xl mx-auto space-y-8" dir="rtl">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-2xl border border-indigo-500/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
            <Info className="w-3.5 h-3.5" />
            <span>ניהול מערכת — הגדרות שרת ותחזוקת אחסון</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
            הגדרות ותחזוקת מערכת
          </h1>
          <p className="text-slate-300 text-sm md:text-base font-light max-w-3xl">
            תחזוקת תיקיית ה-Google Drive המשותפת, מיפוי התאמות נגישות אישיות וכיול הרדאר הפדגוגי.
          </p>
        </div>
      </header>

      {/* Drive Tidy Maintenance Card */}
      <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <FolderSync className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                סידור תיקיית הדרייב (Google Drive)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
                ארגון ה-Shared Drive המשותף: יצירת 5 התיקיות הייעודיות לפי סוג, מיון קבצים מפוזרים לתיקיות יעד לפי מפגש ולומד, מחיקת קבצי בדיקה ישנים לאשפה וארכוב קבצים לא מזוהים ב-99 ארכיון.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsTidyConfirmOpen(true)}
            disabled={isTidying}
            className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm shadow-md hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {isTidying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>מסדר את תיקיית הדרייב...</span>
              </>
            ) : (
              <>
                <FolderSync className="w-4 h-4" />
                <span>סדר את תיקיית הדרייב</span>
              </>
            )}
          </button>
        </div>

        {tidyError && (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-3 text-red-700 dark:text-red-300 text-sm">
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">שגיאה בסידור הדרייב:</p>
              <p className="text-xs mt-1">{tidyError}</p>
            </div>
          </div>
        )}

        {tidyResult && (
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>תוצאות סידור תיקיית הדרייב:</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="block text-2xl font-black text-indigo-600 dark:text-indigo-400">
                  {tidyResult.foldersCreated.length}
                </span>
                <span className="text-xs text-slate-500 font-medium">תיקיות שנוצרו</span>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="block text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {tidyResult.filesMoved.length}
                </span>
                <span className="text-xs text-slate-500 font-medium">קבצים שהועברו</span>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="block text-2xl font-black text-amber-600 dark:text-amber-400">
                  {tidyResult.filesTrashed.length}
                </span>
                <span className="text-xs text-slate-500 font-medium">קבצים באשפה</span>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="block text-2xl font-black text-rose-600 dark:text-rose-400">
                  {tidyResult.failures.length}
                </span>
                <span className="text-xs text-slate-500 font-medium">כשלים / שגיאות</span>
              </div>
            </div>

            {tidyResult.foldersCreated.length > 0 && (
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <FolderPlus className="w-3.5 h-3.5 text-indigo-500" />
                  תיקיות שנוצרו:
                </span>
                <ul className="list-disc list-inside ps-2 space-y-0.5 font-mono text-[11px]">
                  {tidyResult.foldersCreated.map((folder, idx) => (
                    <li key={idx}>{folder}</li>
                  ))}
                </ul>
              </div>
            )}

            {tidyResult.filesTrashed.length > 0 && (
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5 text-amber-500" />
                  קבצים שהועברו לאשפה:
                </span>
                <ul className="list-disc list-inside ps-2 space-y-0.5 font-mono text-[11px]">
                  {tidyResult.filesTrashed.map((f, idx) => (
                    <li key={idx}>
                      {f.name} {f.reason ? `(${f.reason})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tidyResult.failures.length > 0 && (
              <div className="text-xs text-rose-600 dark:text-rose-400 space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" />
                  פירוט כשלים:
                </span>
                <ul className="list-disc list-inside ps-2 space-y-0.5 font-mono text-[11px]">
                  {tidyResult.failures.map((fail, idx) => (
                    <li key={idx}>
                      {fail.file}: {fail.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </AccessibleCard>

      {/* Pedagogical and Accessibility Pointers */}
      <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-4">
        <PointerRow
          icon={<Palette className="w-5 h-5" />}
          title="נגישות והתאמות אישיות (UDL)"
          body="ההתאמות ניתנות לכל לומד בנפרד — פרופיל התמיכה ותנאי הלמידה נקבעים על ידי המורה בלוח הבקרה של הכיתה, ומוחלים על הלומד בגבול המשימה הבאה. אין במערכת הגדרת ערכת נושא גלובלית העוקפת את העדפות הלומד."
        />
        <PointerRow
          icon={<Activity className="w-5 h-5" />}
          title="רדאר פדגוגי שקט (Trace Data)"
          body="הרדאר פועל תמיד ואינו ניתן לכיבוי — הוא מזין את התראות המאבק הקוגניטיבי בלוח הבקרה של המורה. הערך היחיד שניתן לכייל הוא סף ההיסוס בשניות, והוא נקרא בזמן אמת על ידי מנגנון הניטור."
          to="/admin/curriculum"
          linkLabel="למסך קטלוג וכיול"
        />
      </AccessibleCard>

      {/* Confirmation Modal */}
      {isTidyConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          dir="rtl"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                אישור סידור תיקיית הדרייב
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              פעולה זו תסרוק את כל הקבצים המפוזרים בתיקיית הדרייב המשותפת, תעביר קבצים לתיקיות הייעודיות לפי סוג, תעביר קבצי בדיקה ישנים לאשפה, ותעביר קבצים ללא סיווג לתיקיית &quot;99 ארכיון&quot;. האם להמשיך?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsTidyConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleRunTidy}
                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 cursor-pointer shadow-md hover:shadow-indigo-500/25"
              >
                <span>אישור והפעלה</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
