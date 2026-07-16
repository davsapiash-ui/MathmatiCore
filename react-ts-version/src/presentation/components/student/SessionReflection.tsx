import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SessionReflectionProps {
  onComplete: (rating: number) => void;
}

export function SessionReflection({ onComplete }: SessionReflectionProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emojis = [
    { id: 1, icon: '😓', label: 'היה לי קשה', color: 'bg-rose-100 text-rose-600' },
    { id: 2, icon: '😕', label: 'קצת הסתבכתי', color: 'bg-orange-100 text-orange-600' },
    { id: 3, icon: '🤔', label: 'היה בסדר', color: 'bg-amber-100 text-amber-600' },
    { id: 4, icon: '🙂', label: 'הצלחתי לפתור', color: 'bg-teal-100 text-teal-600' },
    { id: 5, icon: '🤩', label: 'הרגשתי מעולה!', color: 'bg-emerald-100 text-emerald-600' },
  ];

  const handleSelect = (id: number) => {
    setSelected(id);
    setIsSubmitting(true);
    // Wait for the success animation to play before calling onComplete
    setTimeout(() => {
      onComplete(id);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl w-full p-8 flex flex-col items-center text-center"
      >
        <AnimatePresence mode="wait">
          {!isSubmitting ? (
            <motion.div 
              key="question"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-4">
                כל הכבוד על המאמץ! 🎉
              </h1>
              <p className="text-xl text-slate-600 dark:text-slate-300 mb-12">
                איך הרגשת בזמן שפתרת את התרגילים?
              </p>

              <div className="flex flex-wrap justify-center gap-6 md:gap-8">
                {emojis.map((emoji, idx) => (
                  <motion.button
                    key={emoji.id}
                    onClick={() => handleSelect(emoji.id)}
                    className="relative group flex flex-col items-center gap-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ scale: 1.1, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div className={`w-20 h-20 md:w-24 md:h-24 rounded-3xl flex items-center justify-center text-4xl md:text-5xl shadow-lg border-2 border-white/50 dark:border-slate-700/50 backdrop-blur-md transition-all duration-300 animate-float-emoji ${emoji.color} hover:shadow-xl`}
                         style={{ animationDelay: `${idx * 0.2}s` }}>
                      {emoji.icon}
                    </div>
                    <span className="text-sm md:text-base font-medium text-slate-600 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                      {emoji.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, ease: "backOut" }}
                className="text-7xl mb-6"
              >
                ⭐
              </motion.div>
              <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                תודה ששיתפת!
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-300 mt-2">
                התשובה שלך עוזרת לי להתאים את התרגילים בדיוק בשבילך.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
