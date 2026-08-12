import React, { useState } from 'react';
import type { SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { Bot, X, CheckCircle2, Sparkles, BellOff, Lightbulb } from 'lucide-react';
import { clsx } from 'clsx';
import { useSettingsStore } from '@/application/useSettingsStore';

interface GraphicOrganizerHintProps {
  hint: SocraticHintResponse;
  onClose: () => void;
  onSelectOption?: (choiceId: string) => void;
}

export const GraphicOrganizerHint: React.FC<GraphicOrganizerHintProps> = ({ hint, onClose, onSelectOption }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const setAutoShowHints = useSettingsStore((s) => s.setAutoShowHints);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (onSelectOption) {
      onSelectOption(id);
    }
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleDisableAutoShow = () => {
    setAutoShowHints(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-indigo-100 dark:border-slate-800 animate-in zoom-in-95 duration-300">
        
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
            onClick={onClose}
            aria-label="סגור חלון רמז"
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all relative z-10 cursor-pointer"
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

          {/* Socratic choices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-6">
            {hint.choices.map((choice) => {
              const isSelected = selectedId === choice.id;
              return (
                <button
                  key={choice.id}
                  onClick={() => handleSelect(choice.id)}
                  disabled={selectedId !== null}
                  className={clsx(
                    "relative p-5 rounded-2xl border-2 text-right transition-all duration-200 flex items-center gap-3.5 group cursor-pointer",
                    isSelected 
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-100 shadow-md scale-[1.02]"
                      : selectedId !== null 
                        ? "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-40"
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
