import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ShieldCheck, Rocket, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

interface ReinforcementOrChallengeScreenProps {
  onSelectBranch: (branch: 'reinforcement' | 'challenge') => void;
  onSkipToFinish: () => void;
}

/**
 * ReinforcementOrChallengeScreen (Module 14: Post-7 Mandatory Tasks Choice Point)
 * Presented to students after completing 7 core mandatory tasks.
 * Optional choice tasks do NOT affect baseline Q-Matrix mastery metrics.
 */
export function ReinforcementOrChallengeScreen({
  onSelectBranch,
  onSkipToFinish,
}: ReinforcementOrChallengeScreenProps) {
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);

  return (
    <div
      dir="rtl"
      className="min-h-[calc(100vh-80px)] w-full flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 font-body text-slate-900 dark:text-slate-100 select-none"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-6"
      >
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-extrabold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>השלמתם בהצלחה את משימות החובה במפגש {sessionNumber}!</span>
        </div>

        <div>
          <h2 className="font-display font-black text-2xl md:text-3xl text-slate-900 dark:text-white">
            איך תרצו להמשיך את החקר?
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-2 max-w-md">
            באפשרותכם לבחור מסלול המשך קצר לביסוס ההבנה או לאתגר חשיבה מתקדם (משימות רשות שאינן משפיעות על ציון השליטה):
          </p>
        </div>

        {/* Choice Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full pt-2">
          {/* Reinforcement (ביסוס) */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectBranch('reinforcement')}
            className="flex flex-col items-center text-center p-6 rounded-3xl border-2 border-emerald-300 dark:border-emerald-700/60 bg-emerald-50/50 dark:bg-emerald-950/20 hover:border-emerald-500 transition-all cursor-pointer group shadow-md"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="font-display font-black text-xl text-emerald-900 dark:text-emerald-200">
              מסלול ביסוס
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed font-medium">
              תרגול נוסף של העקרונות שנלמדו במספרים נוחים לחיזוק הביטחון המתמטי.
            </p>
          </motion.button>

          {/* Challenge (אתגר) */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectBranch('challenge')}
            className="flex flex-col items-center text-center p-6 rounded-3xl border-2 border-purple-300 dark:border-purple-700/60 bg-purple-50/50 dark:bg-purple-950/20 hover:border-purple-500 transition-all cursor-pointer group shadow-md"
          >
            <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Rocket className="w-8 h-8" />
            </div>
            <h3 className="font-display font-black text-xl text-purple-900 dark:text-purple-200">
              מסלול אתגר
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed font-medium">
              משימות חשיבה מורכבות יותר המשלבות מספרים גדולים ושיטות פירוק גמישות.
            </p>
          </motion.button>
        </div>

        {/* Skip to Finish option */}
        <button
          type="button"
          onClick={onSkipToFinish}
          className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors pt-2 underline underline-offset-4 cursor-pointer"
        >
          סיום המפגש כעת ומעבר למסך הסיכום
        </button>
      </motion.div>
    </div>
  );
}

export default ReinforcementOrChallengeScreen;
