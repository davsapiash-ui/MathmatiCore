import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Square, RotateCcw, CircleDot, HelpCircle, Award, ArrowLeft } from 'lucide-react';
import type { SRLReflectionResult } from '@/core/srlReflection';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

interface Session8ReflectionScreenProps {
  /**
   * מקבל את שלושת שלבי הרפלקציה במלואם. עד כה הועברה רק רמת המאמץ, תחת
   * השם focusArea, והיא נכתבה לשדה צבע המסלול — כך שכל השאר אבד.
   */
  onComplete: (result: SRLReflectionResult) => void;
  metrics?: {
    fastestTaskType?: string;
    slowestTaskType?: string;
    undoCount?: number;
    errorCount?: number;
    guessCount?: number;
  };
}

type EffortId = 'EASY' | 'MEDIUM' | 'HARD';

/**
 * כל מה שהילד רואה ושומע במסך. הנוסחים של מסמך 03 §3.8, "מסך הרפלקציה
 * האישי התלת שלבי"; ההתנהגות של PRD מודול 16 §ג.
 *
 * שלב 1 — PRD: "בחירה מתוך 3 סמלים חזותיים (מאמץ קל, בינוני, רב)". מסמך 03:
 * "סרגל מאמץ חזותי קווי תלת שלבי ללא מילים: רמה אחת: קל, רמה שתיים: מתאים,
 * רמה שלוש: מאתגר". שניהם מתקיימים: על המסך שלושה סמלים של סרגל עולה (פס
 * אחד, שניים, שלושה) — חזותיים, בלי מילים, ומאמץ קל־בינוני־רב בגובה הפסים.
 * המילים של מסמך 03 נשמעות בהקראה ומשמשות שם נגיש לכל כפתור, כך שילד
 * שאינו קורא, או שמשתמש בקורא מסך, יודע מה כל רמה.
 *
 * שלב 2 — שלוש האסטרטגיות בסדר של המרשם (שורה 10): כפתור ביטול פעולה,
 * עיגולי הזיכרון, השאלות בכרטיס החניכה. אפשר לסמן כמה (מסמך 03: "לסמן כל
 * תשובה מתאימה מתוך שלוש").
 *
 * שלב 3 — PRD: "הצגת האחוז, מסר מעצים וכפתור סיום מפגש סופי". המסר הוא
 * המשפט של מסמך 03 ("ותיקנתם" בכתיב מלא).
 *
 * אין מילים באנגלית, והפנייה בגוף שני רבים.
 */
export const REFLECTION_TEXT_HE = {
  stepLabel: (n: 1 | 2 | 3) => `שלב ${n} מתוך 3`,
  stepLabelSpoken: { 1: 'שלב ראשון מתוך שלושה.', 2: 'שלב שני מתוך שלושה.', 3: 'שלב שלישי מתוך שלושה.' } as const,
  effortQuestion: 'כמה מאמץ והשתדלות השקעתם היום בפתרון התרגילים?',
  effortInstruction: 'בחרו רמה אחת.',
  strategyQuestion: 'מה עזר לכם הכי הרבה להצליח היום בפתרון התרגילים?',
  strategyInstruction: 'אפשר לסמן יותר מתשובה אחת.',
  feedbackTitle: 'כל הכבוד!',
  feedbackBody: 'ראינו שחקרתם, ניסיתם ותיקנתם טעויות בעצמכם כמו מתמטיקאים אמיתיים! המשיכו להאמין בכוח שלכם!',
  persistenceLabel: 'מדד ההתמדה שלכם',
  next: 'המשיכו',
  back: 'חזרה',
  finish: 'סיום המפגש',
} as const;

/** שלוש רמות המאמץ: סמל חזותי בלבד על המסך; השם (מסמך 03) להקראה ולקורא מסך. */
export const EFFORT_LEVELS: ReadonlyArray<{ id: EffortId; bars: 1 | 2 | 3; spokenHe: string }> = [
  { id: 'EASY', bars: 1, spokenHe: 'רמה אחת: קל' },
  { id: 'MEDIUM', bars: 2, spokenHe: 'רמה שתיים: מתאים' },
  { id: 'HARD', bars: 3, spokenHe: 'רמה שלוש: מאתגר' },
];

/** מזהי האסטרטגיות נשמרים כפי שהיו (core/srlReflection.ts ממפה אותם). */
export const STRATEGY_OPTIONS = [
  { id: 'undo', label: 'כפתור ביטול פעולה שאיפשר לי לתקן טעויות בביטחון וברוגע', icon: RotateCcw },
  { id: 'memory', label: 'עיגולי הזיכרון שעזרו לי לנהל את המעברים', icon: CircleDot },
  { id: 'hints', label: 'השאלות המנחות בכרטיס החניכה', icon: HelpCircle },
] as const;

/** מה שנקרא בקול בכל שלב — כל הנחיה שעל המסך, וגם שמות הרמות שאין להן מילים על המסך. */
export function reflectionSpeech(step: 1 | 2 | 3, persistencePercent: number): string {
  const t = REFLECTION_TEXT_HE;
  if (step === 1) {
    return [t.stepLabelSpoken[1], t.effortQuestion, t.effortInstruction, ...EFFORT_LEVELS.map((l) => `${l.spokenHe}.`)].join(' ');
  }
  if (step === 2) {
    return [t.stepLabelSpoken[2], t.strategyQuestion, t.strategyInstruction, ...STRATEGY_OPTIONS.map((o) => `${o.label}.`)].join(' ');
  }
  return [t.stepLabelSpoken[3], t.feedbackTitle, t.feedbackBody, `${t.persistenceLabel}: ${persistencePercent} אחוז.`].join(' ');
}

/** סרגל קווי: שלושה פסים בגובה עולה, ו-`filled` מהם צבועים. */
function EffortBars({ filled }: { filled: 1 | 2 | 3 }) {
  const heights = ['h-4', 'h-8', 'h-12'];
  return (
    <span aria-hidden="true" className="flex items-end justify-center gap-1.5 h-12">
      {heights.map((h, i) => (
        <span
          key={h}
          className={`w-4 rounded-md ${h} ${i < filled ? 'bg-indigo-500 dark:bg-indigo-400' : 'bg-slate-200 dark:bg-slate-700'}`}
        />
      ))}
    </span>
  );
}

/**
 * מודול 16: לוח רפלקציה תלת־שלבי בסיום מפגש 8.
 * שלב 1: הערכת מאמץ. שלב 2: בחירת אסטרטגיות. שלב 3: משוב התמדה —
 * (U / (U + E + G)) * 100, ו-100% כשהמכנה אפס.
 * ללא חלונות קופצים, אפס PII.
 */
export function Session8ReflectionScreen({ onComplete, metrics }: Session8ReflectionScreenProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [effortLevel, setEffortLevel] = useState<EffortId | null>(null);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = REFLECTION_TEXT_HE;

  const toggleStrategy = (id: string) => {
    setSelectedStrategies(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Stage C: Persistence Metric Calculation: (U / (U + E + G)) * 100 (default 100% on zero denominator)
  const U = Math.max(0, metrics?.undoCount || 0);
  const E = Math.max(0, metrics?.errorCount || 0);
  const G = Math.max(0, metrics?.guessCount || 0);
  const denominator = U + E + G;
  const persistenceRatio = denominator === 0 ? 100 : Math.min(100, Math.max(0, Math.round((U / denominator) * 100)));

  const handleComplete = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    onComplete({
      effortLevel,
      strategies: selectedStrategies,
      persistenceIndex: persistenceRatio,
      undoCount: U,
      errorCount: E,
      guessCount: G,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 font-body" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {/* שלב 1: הערכת מאמץ — סרגל חזותי ללא מילים */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col items-center text-center gap-6"
            >
              <div>
                <span className="text-xs font-black text-indigo-600 block mb-1">{t.stepLabel(1)}</span>
                <div className="flex items-center justify-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-display font-black text-slate-900 dark:text-white">
                    {t.effortQuestion}
                  </h1>
                  <UdlSpeechButton text={reflectionSpeech(1, persistenceRatio)} className="shrink-0" />
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t.effortInstruction}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 w-full pt-2" role="group" aria-label={t.effortQuestion}>
                {EFFORT_LEVELS.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => setEffortLevel(level.id)}
                    aria-label={level.spokenHe}
                    aria-pressed={effortLevel === level.id}
                    title={level.spokenHe}
                    className={`flex items-center justify-center p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                      effortLevel === level.id
                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30 shadow-md scale-105'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 hover:scale-102'
                    }`}
                  >
                    <EffortBars filled={level.bars} />
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={!effortLevel}
                onClick={() => setStep(2)}
                className="mt-4 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-base rounded-2xl shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                <span>{t.next}</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* שלב 2: מה עזר לכם — שלוש אסטרטגיות, אפשר לסמן כמה */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col items-center text-center gap-6"
            >
              <div>
                <span className="text-xs font-black text-purple-600 block mb-1">{t.stepLabel(2)}</span>
                <div className="flex items-center justify-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-display font-black text-slate-900 dark:text-white">
                    {t.strategyQuestion}
                  </h1>
                  <UdlSpeechButton text={reflectionSpeech(2, persistenceRatio)} className="shrink-0" />
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t.strategyInstruction}</p>
              </div>

              <div className="flex flex-col gap-3 w-full text-right pt-2">
                {STRATEGY_OPTIONS.map((strat) => {
                  const Icon = strat.icon;
                  const isChecked = selectedStrategies.includes(strat.id);

                  return (
                    <button
                      key={strat.id}
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      onClick={() => toggleStrategy(strat.id)}
                      className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between gap-4 cursor-pointer text-right ${
                        isChecked
                          ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/30 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`p-2 rounded-xl ${isChecked ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {strat.label}
                        </span>
                      </div>

                      <div className="text-purple-600 shrink-0">
                        {isChecked ? <CheckSquare className="w-6 h-6 fill-purple-100" /> : <Square className="w-6 h-6 text-slate-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3 w-full mt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="py-3.5 px-6 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 transition-all cursor-pointer"
                >
                  {t.back}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 py-3.5 px-8 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-base rounded-2xl shadow-lg shadow-purple-600/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>{t.next}</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* שלב 3: משוב חיובי מעודד התמדה, האחוז וכפתור הסיום */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col items-center text-center gap-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center text-3xl shadow-inner" aria-hidden="true">
                🏆
              </div>

              <div>
                <span className="text-xs font-black text-emerald-600 block mb-1">{t.stepLabel(3)}</span>
                <div className="flex items-center justify-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-display font-black text-slate-900 dark:text-white">
                    {t.feedbackTitle}
                  </h1>
                  <UdlSpeechButton text={reflectionSpeech(3, persistenceRatio)} className="shrink-0" />
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-base mt-2 max-w-md leading-relaxed">
                  {t.feedbackBody}
                </p>
              </div>

              <div className="w-full bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 dark:from-slate-800 dark:to-slate-850 p-6 rounded-3xl border border-emerald-200 dark:border-slate-700 flex flex-col items-center gap-2">
                <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{t.persistenceLabel}</span>
                <div className="text-5xl font-display font-black text-emerald-600 dark:text-emerald-400" dir="ltr">
                  {persistenceRatio}%
                </div>
              </div>

              <button
                type="button"
                onClick={handleComplete}
                disabled={isSubmitting}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base rounded-2xl shadow-lg shadow-emerald-600/25 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                <Award className="w-5 h-5" />
                <span>{t.finish}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
