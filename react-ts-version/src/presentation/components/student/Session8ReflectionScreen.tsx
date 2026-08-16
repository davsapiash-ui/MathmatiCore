import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Session8ReflectionScreenProps {
  onComplete: (focusArea: string) => void;
  metrics: {
    fastestTaskType?: string;
    slowestTaskType?: string;
  };
}

export function Session8ReflectionScreen({ onComplete, metrics }: Session8ReflectionScreenProps) {
  const [step, setStep] = useState(1);
  const [feeling, setFeeling] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emojis = [
    { id: 1, icon: '😓', label: 'היה לי קשה', color: 'bg-rose-100 text-rose-600' },
    { id: 2, icon: '😕', label: 'קצת הסתבכתי', color: 'bg-orange-100 text-orange-600' },
    { id: 3, icon: '🤔', label: 'היה בסדר', color: 'bg-amber-100 text-amber-600' },
    { id: 4, icon: '🙂', label: 'הצלחתי לפתור', color: 'bg-teal-100 text-teal-600' },
    { id: 5, icon: '🤩', label: 'הרגשתי מעולה!', color: 'bg-emerald-100 text-emerald-600' },
  ];

  const focusAreas = [
    { id: '10_100', label: 'כפל פי 10 ו-100 (חיזוק הבסיס)', icon: '⚡' },
    { id: '20_30', label: 'כפל פי עשרות שלמות (20, 30...)', icon: '🧠' },
    { id: 'challenge', label: 'משימות אתגר שונות', icon: '🏆' },
  ];

  const handleFeelingSelect = (id: number) => {
    if (isSubmitting) return;
    setFeeling(id);
    setTimeout(() => {
      setStep(2);
    }, 600);
  };

  const handleFocusSelect = (id: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    onComplete(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ws-bg/95 backdrop-blur-md font-body" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-3xl w-full p-8 ws-card shadow-2xl relative overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-3xl mb-6">
                🤔
              </div>
              <h1 className="text-3xl font-display font-black text-ws-ink mb-4">
                איך הלך לכם במפגש?
              </h1>
              <p className="text-ws-soft mb-8 text-lg">בחרו את האימוג'י שמתאר בצורה הטובה ביותר את הרגשתכם:</p>
              
              <div className="flex flex-wrap justify-center gap-4 md:gap-6">
                {emojis.map((emoji) => (
                  <button
                    key={emoji.id}
                    onClick={() => handleFeelingSelect(emoji.id)}
                    className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all hover:scale-105 active:scale-95 ${feeling === emoji.id ? 'border-ws-blue bg-ws-blue/10' : 'border-ws-surface2 bg-white/50 hover:border-ws-blue/50'}`}
                  >
                    <span className="text-5xl">{emoji.icon}</span>
                    <span className="text-sm font-bold text-ws-ink/80">{emoji.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-3xl mb-6">
                ⏱️
              </div>
              <h1 className="text-3xl font-display font-black text-ws-ink mb-6">
                בואו נתבונן בדרך שעשיתם!
              </h1>
              
              <div className="bg-white/80 border border-ws-surface2 p-6 rounded-2xl w-full text-right mb-8">
                <p className="text-lg text-ws-ink leading-relaxed mb-4">
                  <strong>במשימות של {metrics.fastestTaskType || 'כפל פי 10 ו-100'}</strong> סיימת מהר מאוד! ✨
                </p>
                <p className="text-lg text-ws-ink leading-relaxed">
                  <strong>במשימות של {metrics.slowestTaskType || 'כפל פי 20 ו-30'}</strong> לקח לך קצת יותר זמן. וזה בסדר גמור! לומדים תוך כדי תנועה. 🌱
                </p>
              </div>

              <button 
                onClick={() => setStep(3)}
                className="ws-btn-primary px-8 py-3 rounded-full font-bold text-lg"
              >
                המשך
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-3xl mb-6">
                🎯
              </div>
              <h1 className="text-3xl font-display font-black text-ws-ink mb-4">
                מבט לעתיד
              </h1>
              <p className="text-ws-soft mb-8 text-lg">במפגש הבא, באילו משימות תרצה להתמקד יותר?</p>
              
              <div className="flex flex-col w-full gap-4 max-w-md mx-auto">
                {focusAreas.map((area) => (
                  <button
                    key={area.id}
                    disabled={isSubmitting}
                    onClick={() => handleFocusSelect(area.id)}
                    className={`flex items-center gap-4 p-5 rounded-2xl border-2 border-ws-surface2 transition-all text-right group ${isSubmitting ? 'opacity-50 cursor-not-allowed bg-slate-100' : 'bg-white hover:border-ws-blue hover:bg-ws-blue-soft cursor-pointer'}`}
                  >
                    <span className="text-3xl bg-slate-50 p-3 rounded-xl group-hover:bg-white">{area.icon}</span>
                    <span className="text-lg font-bold text-ws-ink">{area.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
