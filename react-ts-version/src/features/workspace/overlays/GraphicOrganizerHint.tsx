import React, { useState, useEffect } from 'react';
import type { SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { Bot, X, CheckCircle2, Sparkles, BellOff, Lightbulb, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { useSettingsStore } from '@/application/useSettingsStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

interface GraphicOrganizerHintProps {
  hint: SocraticHintResponse;
  onClose: () => void;
  onSelectOption?: (choiceId: string) => void;
}

export const GraphicOrganizerHint: React.FC<GraphicOrganizerHintProps> = ({ hint, onClose, onSelectOption }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const setAutoShowHints = useSettingsStore((s) => s.setAutoShowHints);

  const socraticPenaltyLockoutUntil = useWorkspaceStore((s) => s.socraticPenaltyLockoutUntil);
  const socraticDistractorHint = useWorkspaceStore((s) => s.socraticDistractorHint);
  const triggerSocraticPenaltyLockout = useWorkspaceStore((s) => s.triggerSocraticPenaltyLockout);
  const getSocraticPenaltyRemaining = useWorkspaceStore((s) => s.getSocraticPenaltyRemaining);

  const [penaltyRemaining, setPenaltyRemaining] = useState(() => getSocraticPenaltyRemaining());
  const isPenaltyLocked = penaltyRemaining > 0;

  const correctId = hint.correctChoiceId || 'opt_1';

  // Socratic Lockout Countdown synchronized with global Zustand store & persisted storage
  useEffect(() => {
    const updateTimer = () => {
      const remaining = getSocraticPenaltyRemaining();
      setPenaltyRemaining(remaining);
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [socraticPenaltyLockoutUntil, getSocraticPenaltyRemaining]);

  const handleSelect = (id: string) => {
    if (isPenaltyLocked) return;

    if (id === correctId) {
      setSelectedId(id);
      if (onSelectOption) {
        onSelectOption(id);
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      // Wrong distractor chosen — trigger 60-second penalty lockout in global Zustand store per PRD v3.3 Module 12
      triggerSocraticPenaltyLockout(
        'בחירה זו אינה מביאה לפתרון הנכון. חשבו מה הפעולה המדויקת הנדרשת בבית המספרים ונסו שוב כשתום הנעילה.'
      );
    }
  };

  const handleDisableAutoShow = () => {
    if (isPenaltyLocked) return;
    setAutoShowHints(false);
    onClose();
  };

  return (
    <div 
      className="fixed bottom-6 right-6 z-[100] pointer-events-none" 
      dir="rtl"
    >
      <div 
        className="pointer-events-auto bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-[360px] max-h-[580px] overflow-y-auto border border-indigo-100 dark:border-slate-800 animate-in slide-in-from-bottom-5 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 p-6 text-white flex items-center justify-between relative overflow-hidden">
          <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          
          <div className="flex items-center gap-3.5 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-inner border border-white/20">
              <Bot className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold tracking-tight">חונך חשיבה אישי</h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400/20 text-amber-200 border border-amber-300/30">
                  <Sparkles className="w-3 h-3" />
                  רמז מותאם
                </span>
              </div>
              <p className="text-xs text-indigo-100/90 font-medium mt-0.5">שאלה מנחה לחיזוק הבנת התהליך</p>
            </div>
          </div>

          <button 
            onClick={() => !isPenaltyLocked && onClose()}
            disabled={isPenaltyLocked}
            aria-label="סגור חלון רמז"
            className={clsx(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all relative z-10",
              isPenaltyLocked 
                ? "bg-white/5 text-white/30 opacity-30 cursor-not-allowed border border-white/10" 
                : "bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            )}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8">
          <div className="mb-6 p-5 rounded-2xl bg-indigo-50/70 dark:bg-slate-800/60 border border-indigo-100 dark:border-slate-700/60 text-center">
            <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 leading-snug">
              {hint.questionHe}
            </h3>
          </div>

          {/* PRD v3.0 Module 12: 60-Second Distractor Penalty Lockout Alert */}
          {isPenaltyLocked && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 text-amber-900 dark:text-amber-200 flex flex-col gap-2 animate-pulse">
              <div className="flex items-center gap-2 font-bold text-base">
                <Lock className="w-5 h-5 text-amber-600 animate-bounce" />
                <span>חסימת ניחוש פדגוגית — האפשרויות נעולות ל-60 שניות למחשבה נוספת ({penaltyRemaining} שניות נותרו)</span>
              </div>
              {socraticDistractorHint && (
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 pr-7">
                  💡 {socraticDistractorHint}
                </p>
              )}
            </div>
          )}

          {/* Socratic choices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-6">
            {hint.choices.map((choice) => {
              const isSelected = selectedId === choice.id;
              const isDisabled = selectedId !== null || isPenaltyLocked;

              return (
                <button
                  key={choice.id}
                  onClick={() => handleSelect(choice.id)}
                  disabled={isDisabled}
                  className={clsx(
                    "relative p-5 rounded-2xl border-2 text-right transition-all duration-200 flex items-center gap-3.5 group cursor-pointer",
                    isSelected 
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-100 shadow-md scale-[1.02]"
                      : isDisabled 
                        ? "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:shadow-lg hover:-translate-y-0.5"
                  )}
                >
                  <div className={clsx(
                    "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                    isSelected 
                      ? "border-emerald-500 bg-emerald-500 text-white" 
                      : "border-slate-300 dark:border-slate-600 group-hover:border-indigo-500 text-transparent"
                  )}>
                    {isSelected && <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <span className={clsx(
                    "text-base font-bold leading-relaxed",
                    isSelected ? "text-emerald-900 dark:text-emerald-200" : "text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                  )}>
                    {choice.textHe}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Disable auto-show setting toggle bar */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap text-xs">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span>ניתן לפתוח רמזים בכל עת ע"י לחיצה על נורת העזרה 💡</span>
            </div>

            <button
              onClick={handleDisableAutoShow}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <BellOff className="w-3.5 h-3.5 text-slate-500" />
              <span>אל תציג רמזים אוטומטית</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
