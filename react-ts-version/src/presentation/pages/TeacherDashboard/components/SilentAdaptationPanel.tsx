import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sliders, Shield, Layers, HelpCircle, Check, Clock } from 'lucide-react';

export interface AdaptationSettings {
  studentId: string;
  anonymousLabel: string;
  path: 'green_path' | 'remediation_path';
  scaffoldLevel: 0 | 1 | 2; // 0: full, 1: mid, 2: low
  forceAdditionHelper: boolean;
  hesitationThresholdSeconds: number; // default 30
  applyAtTaskBoundaryOnly: boolean; // MUST be true per PRD Module 19
  queuedChangesPending?: boolean;
}

interface SilentAdaptationPanelProps {
  student: AdaptationSettings;
  onApplyAdaptation: (settings: AdaptationSettings) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Module 19: Silent Adaptation Control Panel (פאנל התאמות פדגוגיות שקטות)
 * Allows teachers to quietly configure scaffolding, pathing and support levels.
 * Pedagogical Contract: Changes are strictly queued and applied ONLY AT TASK BOUNDARIES (החלה בגבול תרגיל בלבד).
 * Zero-PII: Strictly anonymous student identifiers.
 */
export function SilentAdaptationPanel({
  student,
  onApplyAdaptation,
  isLoading = false,
}: SilentAdaptationPanelProps) {
  const [currentSettings, setCurrentSettings] = useState<AdaptationSettings>({
    ...student,
    applyAtTaskBoundaryOnly: true, // Invariant: must always be true
  });
  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onApplyAdaptation({
      ...currentSettings,
      applyAtTaskBoundaryOnly: true,
      queuedChangesPending: true,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div dir="rtl" className="w-full bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm font-body">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-black text-base text-slate-900 dark:text-white">
              התאמות פדגוגיות שקטות — {student.anonymousLabel}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              שינויים יחולו באופן שקט בגבול התרגיל הבא (Module 19 Task Boundary Rule)
            </span>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[11px] font-extrabold">
          <Clock className="w-3.5 h-3.5" />
          <span>החלה בגבול תרגיל בלבד</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Learning Path */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-black text-slate-700 dark:text-slate-300">
            מסלול לימודי:
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCurrentSettings((s) => ({ ...s, path: 'green_path' }))}
              className={`p-3 rounded-2xl border-2 text-right transition-all cursor-pointer ${
                currentSettings.path === 'green_path'
                  ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 font-bold text-emerald-900 dark:text-emerald-200'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <span className="block text-xs font-black">מסלול ירוק</span>
              <span className="text-[10px] opacity-80">חקר מתקדם ומעמיק</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentSettings((s) => ({ ...s, path: 'remediation_path' }))}
              className={`p-3 rounded-2xl border-2 text-right transition-all cursor-pointer ${
                currentSettings.path === 'remediation_path'
                  ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/40 font-bold text-amber-900 dark:text-amber-200'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <span className="block text-xs font-black">מסלול צהוב (ביסוס ומענה מותאם)</span>
              <span className="text-[10px] opacity-80">פיגום מוגבר ומספרים קטנים</span>
            </button>
          </div>
        </div>

        {/* Scaffold Level */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-black text-slate-700 dark:text-slate-300">
            רמת פיגום והדרגתיות:
          </label>
          <select
            value={currentSettings.scaffoldLevel}
            onChange={(e) =>
              setCurrentSettings((s) => ({
                ...s,
                scaffoldLevel: parseInt(e.target.value, 10) as any,
              }))
            }
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={0}>רמה 0 — פיגום מלא (רשת חיבור עזר + תוויות ערך מקום)</option>
            <option value={1}>רמה 1 — פיגום בינוני (תוויות בלבד, ללא רשת מקדימה)</option>
            <option value={2}>רמה 2 — חקר עצמאי מלא (ללא עזרים ראשוניים)</option>
          </select>
        </div>

        {/* Hesitation Threshold */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-black text-slate-700 dark:text-slate-300">סף זיהוי היסוס (שניות):</span>
            <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
              {currentSettings.hesitationThresholdSeconds} שנ׳
            </span>
          </div>
          <input
            type="range"
            min={15}
            max={60}
            step={5}
            value={currentSettings.hesitationThresholdSeconds}
            onChange={(e) =>
              setCurrentSettings((s) => ({
                ...s,
                hesitationThresholdSeconds: parseInt(e.target.value, 10),
              }))
            }
            className="w-full accent-indigo-600 cursor-pointer"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-slate-400">
            {isSaved ? 'ההתאמה נשמרה ותוחל בסיום המשימה הנוכחית' : 'לא יפריע לתלמיד באמצע פתרון תרגיל'}
          </span>

          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSaved ? <Check className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
            <span>{isSaved ? 'ההתאמה נשמרה!' : 'החל התאמה בגבול התרגיל'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export default SilentAdaptationPanel;
