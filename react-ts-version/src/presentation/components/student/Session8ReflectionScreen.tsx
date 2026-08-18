import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Square, RotateCcw, Brain, HelpCircle, Layers, Award, Sparkles, ArrowLeft } from 'lucide-react';

interface Session8ReflectionScreenProps {
  onComplete: (focusArea: string) => void;
  metrics?: {
    fastestTaskType?: string;
    slowestTaskType?: string;
    undoCount?: number;
    errorCount?: number;
    guessCount?: number;
  };
}

/**
 * מודול 16: לוח רפלקציה וויסות עצמי (SRL Reflection Board - End of Session 8)
 * שלב א: הערכת מאמץ (3 אימוג'ים ויזואליים: קל, בינוני, מאתגר).
 * שלב ב: סימון אסטרטגיות למידה ובקרה (Undo, עיגולי זיכרון, שימוש ברמזים/לבנים).
 * שלב ג: חישוב והצגת מדד התמדה וויסות עצמי: (U / (U + E + G)) * 100 עם טיפול בחלוקה באפס (100% כברירת מחדל).
 * ללא חלונות קופצים (Inline), אפס PII.
 */
export function Session8ReflectionScreen({ onComplete, metrics }: Session8ReflectionScreenProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [effortLevel, setEffortLevel] = useState<'EASY' | 'MEDIUM' | 'HARD' | null>(null);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stage A: 3 Visual Emojis
  const effortOptions = [
    { id: 'EASY' as const, emoji: '🟢', label: 'היה לי קל וברור', desc: 'פתרתי בביטחון ובזריזות', color: 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20' },
    { id: 'MEDIUM' as const, emoji: '🟡', label: 'השקעתי מאמץ והצלחתי', desc: 'חשבתי לעומק והתקדמתי', color: 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20' },
    { id: 'HARD' as const, emoji: '🔴', label: 'היה מאתגר מאוד', desc: 'התאמצתי ולמדתי דברים חדשים', color: 'border-rose-400 bg-rose-50/60 dark:bg-rose-950/20' },
  ];

  // Stage B: Strategy Checkboxes (Strictly 3 digital strategies per PRD v5.0 Module 16)
  const strategyOptions = [
    { id: 'undo', label: 'שימוש בכפתור ביטול הפעולה (Undo) לבקרה ותיקון עצמי', icon: RotateCcw },
    { id: 'memory', label: 'שימוש בעיגולי הזיכרון בעמודות לחישוב שארית', icon: Brain },
    { id: 'hints', label: 'שימוש בשאלות כרטיס החניכה הסוקרטי והרמזים המכוונים', icon: HelpCircle },
  ];

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
    onComplete(effortLevel || 'MEDIUM');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 font-body" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {/* STAGE A: Effort Assessment (3 Visual Emojis) */}
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col items-center text-center gap-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center text-3xl shadow-inner">
                ✨
              </div>

              <div>
                <span className="text-xs font-black text-indigo-600 uppercase tracking-wider block mb-1">שלב א מתוך ג: רפלקציית מאמץ</span>
                <h1 className="text-2xl md:text-3xl font-display font-black text-slate-900 dark:text-white">
                  איך הרגשתם במהלך פתרון המשימות?
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  בחרו את רמת המאמץ שהשקעתם במפגש המסכם:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full pt-2">
                {effortOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setEffortLevel(opt.id)}
                    className={`flex flex-col items-center text-center p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                      effortLevel === opt.id
                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30 shadow-md scale-105'
                        : `${opt.color} hover:scale-102 border-transparent`
                    }`}
                  >
                    <span className="text-4xl mb-3">{opt.emoji}</span>
                    <span className="font-extrabold text-base text-slate-900 dark:text-white">{opt.label}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">{opt.desc}</span>
                  </button>
                ))}
              </div>

              <button
                disabled={!effortLevel}
                onClick={() => setStep(2)}
                className="mt-4 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-base rounded-2xl shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                <span>המשך לשלב האסטרטגיות</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* STAGE B: Strategy Checkboxes */}
          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col items-center text-center gap-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center text-3xl shadow-inner">
                🧭
              </div>

              <div>
                <span className="text-xs font-black text-purple-600 uppercase tracking-wider block mb-1">שלב ב מתוך ג: אסטרטגיות למידה</span>
                <h1 className="text-2xl md:text-3xl font-display font-black text-slate-900 dark:text-white">
                  באילו אסטרטגיות וכלים נעזרתם?
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  סמנו את הכלים שסייעו לכם לבדוק את עצמכם ולהתקדם:
                </p>
              </div>

              <div className="flex flex-col gap-3 w-full text-right pt-2">
                {strategyOptions.map((strat) => {
                  const Icon = strat.icon;
                  const isChecked = selectedStrategies.includes(strat.id);

                  return (
                    <button
                      key={strat.id}
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
                  onClick={() => setStep(1)}
                  className="py-3.5 px-6 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 transition-all cursor-pointer"
                >
                  חזרה
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-3.5 px-8 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-base rounded-2xl shadow-lg shadow-purple-600/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>המשך לחישוב מדד ההתמדה</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STAGE C: Persistence Metric Calculation & Celebration */}
          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col items-center text-center gap-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center text-3xl shadow-inner">
                🏆
              </div>

              <div>
                <span className="text-xs font-black text-emerald-600 uppercase tracking-wider block mb-1">שלב ג מתוך ג: מדד ההתמדה והוויסות העצמי</span>
                <h1 className="text-2xl md:text-3xl font-display font-black text-slate-900 dark:text-white">
                  כל הכבוד על הדרך וההתמדה!
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  השלמתם בהצלחה את מסע הלמידה ב-MathmatiCore!
                </p>
              </div>

              {/* Persistence Score Box */}
              <div className="w-full bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 dark:from-slate-800 dark:to-slate-850 p-6 rounded-3xl border border-emerald-200 dark:border-slate-700 flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>מדד התמדה ובקרה עצמית (SRL Persistence Index):</span>
                </div>

                <div className="text-5xl font-display font-black text-emerald-600 dark:text-emerald-400">
                  {persistenceRatio}%
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md leading-relaxed mt-1">
                  {persistenceRatio >= 80 
                    ? 'הפגנתם ויסות עצמי גבוה ובקרה מעולה לאורך כל המפגשים. בדקתם ותיקנתם את הפתרונות באופן עצמאי!'
                    : 'השקעתם מחשבה, התמדתם בניסיונות ובניתם בסיס מתמטי איתן להמשך הדרך!'}
                </p>
              </div>

              <button
                onClick={handleComplete}
                disabled={isSubmitting}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base rounded-2xl shadow-lg shadow-emerald-600/25 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                <Award className="w-5 h-5" />
                <span>סיום מפגש 8 וחזרה ללובי</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
