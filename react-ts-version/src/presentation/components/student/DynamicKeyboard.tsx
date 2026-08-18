import React from 'react';
import { motion } from 'framer-motion';
import { Delete, CornerDownLeft, Lock } from 'lucide-react';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import type { Place } from '@/core/placeValue';

interface DynamicKeyboardProps {
  activePlace: Place | null;
  onDigitPress?: (digit: string) => void;
  onDeletePress?: () => void;
  onSubmitPress?: () => void;
  isLocked?: boolean;
}

/**
 * DynamicKeyboard (Module 9: Numeric Dynamic Keypad with Conditional Regrouping Locking & UDL Accessibility)
 */
export function DynamicKeyboard({
  activePlace,
  onDigitPress,
  onDeletePress,
  onSubmitPress,
  isLocked = false,
}: DynamicKeyboardProps) {
  const keyboardState = useWorkspaceStore((s) => s.keyboardState);
  const setAnswerDigit = useWorkspaceStore((s) => s.setAnswerDigit);
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const proceed = useWorkspaceStore((s) => s.proceed);

  const effectiveLocked = isLocked || keyboardState === 'LOCKED' || keyboardState === 'SOCRATIC_ONLY';

  const handleDigit = (numStr: string) => {
    if (effectiveLocked) return;
    if (onDigitPress) {
      onDigitPress(numStr);
      return;
    }
    if (activePlace) {
      setAnswerDigit(activePlace, numStr);
    }
  };

  const handleDelete = () => {
    if (effectiveLocked) return;
    if (onDeletePress) {
      onDeletePress();
      return;
    }
    if (activePlace) {
      setAnswerDigit(activePlace, '');
    }
  };

  const handleSubmit = () => {
    if (onSubmitPress) {
      onSubmitPress();
      return;
    }
    proceed();
  };

  const digits = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'];

  return (
    <div
      dir="rtl"
      className="relative flex flex-col items-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-3xl p-4 border-2 border-slate-200 dark:border-slate-800 shadow-xl max-w-xs w-full select-none"
      role="region"
      aria-label="מקלדת מספרים דינמית"
    >
      {effectiveLocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] rounded-3xl z-20 flex flex-col items-center justify-center gap-2 text-white text-center p-4"
        >
          <Lock className="w-8 h-8 text-amber-400 animate-pulse" />
          <span className="font-display font-extrabold text-sm">
            {keyboardState === 'SOCRATIC_ONLY' ? 'יש לבחור רמז לחשיבה תחילה' : 'בצעו המרה/קיבוץ בבית המספרים תחילה'}
          </span>
        </motion.div>
      )}

      <div className="grid grid-cols-3 gap-2 w-full">
        {digits.slice(0, 9).map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={effectiveLocked}
            onClick={() => handleDigit(digit)}
            className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-900 dark:text-white font-display font-black text-2xl shadow-sm transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          disabled={effectiveLocked}
          onClick={handleDelete}
          className="h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 active:scale-95 text-rose-600 dark:text-rose-400 font-bold shadow-sm transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="מחק ספרה"
        >
          <Delete className="w-6 h-6" />
        </button>

        <button
          type="button"
          disabled={effectiveLocked}
          onClick={() => handleDigit('0')}
          className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-900 dark:text-white font-display font-black text-2xl shadow-sm transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          0
        </button>

        <button
          type="button"
          disabled={effectiveLocked}
          onClick={handleSubmit}
          className="h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="אישור ובדיקה"
        >
          <CornerDownLeft className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

export default DynamicKeyboard;
