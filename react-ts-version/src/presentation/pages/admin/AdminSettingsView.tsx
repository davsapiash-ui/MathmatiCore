import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { Palette, Activity, ArrowLeft, Info } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * The PRD defines no admin settings screen, and this one previously presented
 * two controls that did nothing at all:
 *
 *  - a contrast / theme dropdown with no bound value and no change handler.
 *    Beyond the missing handler there is no theme mechanism to drive: the
 *    Tailwind config enables class-based dark mode, but nothing in the app
 *    ever adds or removes that class, so the dark styling is never activated.
 *  - an "איסוף נתוני קושי בזמן אמת" switch rendered checked-by-default with no
 *    change handler and no persistence — flipping it changed nothing and was
 *    not saved.
 *
 * Both are removed rather than wired, because neither is a PRD-specified admin
 * capability, and inventing a global theme override or a radar kill-switch
 * would contradict the spec (accessibility is per-learner under Module 19, and
 * the radar's only calibrated input is Module 26's threshold). This screen now
 * states where each concern is actually configured, so the console stops
 * advertising controls the system does not have.
 */
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
  return (
    <div className="p-6 md:p-10 pb-24 max-w-5xl mx-auto space-y-8" dir="rtl">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-2xl border border-indigo-500/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
            <Info className="w-3.5 h-3.5" />
            <span>תצוגת מידע — אין כאן הגדרות לשינוי</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
            נגישות ורדאר פדגוגי
          </h1>
          <p className="text-slate-300 text-sm md:text-base font-light max-w-3xl">
            ההתאמות האישיות והכיול הפדגוגי אינם מנוהלים מכאן. המסך מפנה למקום שבו
            כל אחד מהם באמת נקבע.
          </p>
        </div>
      </header>

      <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-4">
        <PointerRow
          icon={<Palette className="w-5 h-5" />}
          title="נגישות והתאמות אישיות (UDL)"
          body="ההתאמות ניתנות לכל לומד בנפרד — פרופיל התמיכה ותנאי הלמידה נקבעים על ידי המורה בדשבורד הכיתה, ומוחלים על הלומד בגבול המשימה הבאה. אין במערכת הגדרת ערכת נושא גלובלית שדורסת את כלל המשתמשים."
        />
        <PointerRow
          icon={<Activity className="w-5 h-5" />}
          title="רדאר פדגוגי שקט (Trace Data)"
          body="הרדאר פועל תמיד ואינו ניתן לכיבוי — הוא מזין את התראות המאבק הקוגניטיבי בדשבורד המורה. הערך היחיד שניתן לכייל הוא סף ההיסוס בשניות, והוא נקרא בזמן אמת על ידי הרדאר החי."
          to="/admin/curriculum"
          linkLabel="למסך קטלוג וכיול"
        />
      </AccessibleCard>
    </div>
  );
}
