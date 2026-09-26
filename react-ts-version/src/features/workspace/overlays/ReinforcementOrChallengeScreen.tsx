import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Rocket, CheckCircle2 } from 'lucide-react';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

/**
 * מה שכתוב במסך — ומה שנקרא בקול, כדי שהילד יוכל לבחור בלי לקרוא.
 *
 * מסמך 03 §3.3–3.7, "מדיניות סיום מוקדם": נתיב החזרה והביסוס הוא **שני**
 * תרגילים נוספים בנושא המפגש, ונתיב האתגר והעומק הוא **תרגיל אחד**
 * (`SESSION_BRANCH_TASKS`: שניים ואחד בכל מפגש ובכל מסלול). הנוסח הקודם הבטיח
 * "משימות חשיבה מורכבות… מספרים גדולים" — ברבים, וגם במסלול צמצום הפערים,
 * שבו תרגיל האתגר בתחום האלף — ודיבר עם הילד על "ציון השליטה". תרגילי
 * הבחירה אכן אינם נספרים בשבעת תרגילי החובה (PRD מודול 14 §ג); לילד נאמר
 * רק שהם בחירה ולא חובה.
 */
const BRANCH_CHOICE_TEXT = {
  badge: 'סיימתם את שבעת התרגילים של המפגש!',
  heading: 'איך תרצו להמשיך?',
  intro: 'התרגילים הבאים הם בחירה שלכם, לא חובה.',
  reinforcementTitle: 'מסלול ביסוס',
  reinforcement: 'שני תרגילים נוספים, לחזרה על מה שתרגלנו היום.',
  challengeTitle: 'מסלול אתגר',
  challenge: 'תרגיל אתגר אחד, קשה יותר, בנושא של היום.',
  finish: 'סיום המפגש עכשיו',
} as const;

const BRANCH_CHOICE_SPEECH = [
  BRANCH_CHOICE_TEXT.badge,
  BRANCH_CHOICE_TEXT.heading,
  BRANCH_CHOICE_TEXT.intro,
  `${BRANCH_CHOICE_TEXT.reinforcementTitle}: ${BRANCH_CHOICE_TEXT.reinforcement}`,
  `${BRANCH_CHOICE_TEXT.challengeTitle}: ${BRANCH_CHOICE_TEXT.challenge}`,
  'אפשר גם לסיים את המפגש עכשיו.',
].join(' ');

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
          <span>{BRANCH_CHOICE_TEXT.badge}</span>
        </div>

        <div>
          <div className="flex items-center justify-center gap-3">
            <h2 className="font-display font-black text-2xl md:text-3xl text-slate-900 dark:text-white">
              {BRANCH_CHOICE_TEXT.heading}
            </h2>
            <UdlSpeechButton text={BRANCH_CHOICE_SPEECH} className="shrink-0" />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-2 max-w-md">
            {BRANCH_CHOICE_TEXT.intro}
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
              {BRANCH_CHOICE_TEXT.reinforcementTitle}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed font-medium">
              {BRANCH_CHOICE_TEXT.reinforcement}
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
              {BRANCH_CHOICE_TEXT.challengeTitle}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed font-medium">
              {BRANCH_CHOICE_TEXT.challenge}
            </p>
          </motion.button>
        </div>

        {/* Skip to Finish option */}
        <button
          type="button"
          onClick={onSkipToFinish}
          className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors pt-2 underline underline-offset-4 cursor-pointer"
        >
          {BRANCH_CHOICE_TEXT.finish}
        </button>
      </motion.div>
    </div>
  );
}

export default ReinforcementOrChallengeScreen;
