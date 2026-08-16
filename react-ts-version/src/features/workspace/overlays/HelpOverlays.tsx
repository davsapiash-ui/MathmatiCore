import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspaceStore, type SupportType, getActiveTasks } from '@/application/useWorkspaceStore';
import { SUPPORT_CONTENT, getDynamicSocraticHint } from '@/data/sessionTasks';
import type { SocraticChoice } from '@/infrastructure/services/SocraticEngine';

/**
 * זרימת העזרה — "חיכוך מטא-קוגניטיבי יצרני":
 * נורה 💡 → שהיית 3 שניות מכוונת → בחירה מכוילת (3 רמות פיגום) → חלון תוכן.
 * לעולם לא נפתחת אוטומטית (האפיון: רשת ביטחון ביוזמת התלמיד בלבד).
 */

const SUPPORT_OPTIONS: { type: SupportType; icon: string; titleHe: string; descHe: string }[] = [
  { type: 'metacognitive', icon: '💭', titleHe: 'רמז לחשיבה', descHe: 'שאלה שתעזור לי לבדוק את עצמי' },
  { type: 'socratic', icon: '🔍', titleHe: 'שאלה מנחה', descHe: 'שאלה שתפרק את הבעיה לשלבים' },
  { type: 'worked_example', icon: '📖', titleHe: 'דוגמה פתורה', descHe: 'דוגמה של תרגיל דומה עם הסבר' },
];

export function HelpOverlays() {
  const helpState = useWorkspaceStore((s) => s.helpState);
  const helpFrictionDone = useWorkspaceStore((s) => s.helpFrictionDone);
  const chooseSupport = useWorkspaceStore((s) => s.chooseSupport);
  const closeHelp = useWorkspaceStore((s) => s.closeHelp);

  // The deliberate 3000ms pause (vanilla hintFrictionTimer, app.js 1185–1234).
  useEffect(() => {
    if (helpState !== 'friction') return;
    const t = window.setTimeout(helpFrictionDone, 3000);
    return () => window.clearTimeout(t);
  }, [helpState, helpFrictionDone]);

  const aiSocraticHint = useWorkspaceStore((s) => s.aiSocraticHint);
  const isModal = helpState === 'metacognitive' || helpState === 'worked_example' || (helpState === 'socratic' && !aiSocraticHint);
  
  let content = isModal ? { ...SUPPORT_CONTENT[helpState as SupportType] } : null;
  if (content && helpState === 'socratic') {
    const s = useWorkspaceStore.getState();
    const task = getActiveTasks(s)[s.standardTaskIdx];
    
    // Strict Fallback: Use static dynamic hint if AI hint is not available
    if (task?.targetNode) {
      content.lines = [getDynamicSocraticHint(task.targetNode, s.counts, task, s.answerDigits, s.carryDigits)];
    }
  }

  return (
    <>
      {/* 3s friction overlay */}
      <AnimatePresence>
        {helpState === 'friction' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ws-ink/50 backdrop-blur-sm flex flex-col items-center justify-center gap-4"
            role="status"
            aria-live="polite"
          >
            <motion.span
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-6xl"
              aria-hidden="true"
            >
              🤔
            </motion.span>
            <p className="font-display font-extrabold text-2xl text-white">בואו נחשוב רגע יחד…</p>
            <p className="text-white/80 font-medium">מכין רמז מותאם אישית...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calibrated-choice palette */}
      <AnimatePresence>
        {helpState === 'palette' && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 inset-x-0 z-50 bg-ws-surface rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.18)] border-t border-ws-surface2 p-6"
            role="dialog"
            aria-modal="true"
            aria-label="חלון עזרה"
            dir="rtl"
          >
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-extrabold text-xl text-ws-ink">איזו עזרה תרצו לקבל כעת?</h2>
                <button
                  onClick={closeHelp}
                  aria-label="סגור חלון עזרה"
                  className="w-9 h-9 rounded-full bg-ws-surface2 hover:bg-ws-surface2/70 font-bold text-ws-soft"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="group" aria-label="אפשרויות עזרה">
                {SUPPORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => chooseSupport(opt.type)}
                    className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-ws-surface2 bg-ws-surface hover:border-ws-accent hover:bg-ws-accentSoft/40 transition-all text-center"
                  >
                    <span className="text-3xl" aria-hidden="true">{opt.icon}</span>
                    <span className="font-display font-extrabold text-ws-ink">{opt.titleHe}</span>
                    <span className="text-sm text-ws-soft leading-snug">{opt.descHe}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Socratic content side-panel (Quiet side drawer, NO blocking popup/backdrop per PRD v4.2 Modules 10 & 12) */}
      <AnimatePresence>
        {helpState === 'socratic' && (
          <motion.aside
            initial={{ opacity: 0, x: -30, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -30, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-4 left-4 z-40 max-w-sm sm:max-w-md w-[92vw] sm:w-[420px] bg-ws-surface rounded-3xl shadow-2xl border-2 border-indigo-200 dark:border-indigo-800/80 p-6 pointer-events-auto max-h-[85vh] overflow-y-auto"
            role="region"
            aria-label="חונך דיגיטלי סוקרטי"
            dir="rtl"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">💡</span>
                <h2 className="font-display font-black text-lg sm:text-xl text-ws-ink leading-tight">
                  {aiSocraticHint?.questionHe || content?.titleHe || 'שאלה מנחה לחשיבה'}
                </h2>
              </div>
              <button
                onClick={closeHelp}
                aria-label="סגור חלונית עזרה"
                className="w-8 h-8 rounded-full bg-ws-surface2 hover:bg-ws-surface2/80 text-ws-soft font-bold flex items-center justify-center text-sm transition-colors shrink-0"
              >
                ✕
              </button>
            </div>

            {content?.kind === 'equivalence' && (
              /* Visual 10 ↔ ten-units equivalence (vanilla socratic graphic) */
              <div className="flex items-center justify-center gap-4 mb-4 bg-ws-surface2/50 rounded-2xl p-3" dir="ltr" aria-hidden="true">
                <div className="w-[80px] h-[10px] rounded-[2px]" style={{ backgroundColor: 'var(--block-ten)' }} />
                <span className="font-black text-xl text-ws-soft">=</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <span key={i} className="w-2.5 h-2.5 rounded-[1px] inline-block" style={{ backgroundColor: 'var(--block-unit)' }} />
                  ))}
                </div>
              </div>
            )}

            {content?.lines && content.lines.length > 0 && !aiSocraticHint && (
              <ul className="flex flex-col gap-2 mb-3">
                {content.lines.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-base text-ws-ink leading-relaxed font-semibold">
                    <span className="text-ws-accent font-black shrink-0 mt-0.5" aria-hidden="true">
                      {content.kind === 'checklist' ? '✔' : content.kind === 'worked_example' ? `${i + 1}.` : '•'}
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            )}

            {/* 3 Closed Dynamic Options for Socratic Mentoring */}
            <SocraticPenaltyLockOptions onClose={closeHelp} />
          </motion.aside>
        )}

        {content && helpState !== 'socratic' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ws-ink/50 backdrop-blur-sm flex items-center justify-center p-6"
            role="dialog"
            aria-modal="true"
            aria-label="חונך דיגיטלי"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 16 }}
              className="bg-ws-surface rounded-3xl shadow-2xl max-w-lg w-full p-8 relative"
            >
              <h2 className="font-display font-black text-2xl text-ws-ink mb-5">{content.titleHe}</h2>

              <ul className="flex flex-col gap-3">
                {content.lines.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-lg text-ws-ink leading-relaxed font-semibold">
                    <span className="text-ws-accent font-black shrink-0 mt-0.5" aria-hidden="true">
                      {content.kind === 'checklist' ? '✔' : content.kind === 'worked_example' ? `${i + 1}.` : '•'}
                    </span>
                    {line}
                  </li>
                ))}
              </ul>

              <button
                onClick={closeHelp}
                className="mt-7 w-full h-12 rounded-full font-display font-extrabold text-lg text-white bg-ws-accent shadow-md hover:brightness-105 active:scale-95 transition-all"
              >
                הבנתי, חזרה לתרגיל
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SocraticPenaltyLockOptions({ onClose }: { onClose: () => void }) {
  const aiSocraticHint = useWorkspaceStore((s) => s.aiSocraticHint);
  const socraticPenaltyLockoutUntil = useWorkspaceStore((s) => s.socraticPenaltyLockoutUntil);
  const triggerSocraticPenaltyLockout = useWorkspaceStore((s) => s.triggerSocraticPenaltyLockout);
  const getSocraticPenaltyRemaining = useWorkspaceStore((s) => s.getSocraticPenaltyRemaining);

  const [lockSeconds, setLockSeconds] = useState(() => getSocraticPenaltyRemaining());
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [feedbackHint, setFeedbackHint] = useState<string | null>(null);

  useEffect(() => {
    const updateTimer = () => {
      const remaining = getSocraticPenaltyRemaining();
      setLockSeconds(remaining);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [socraticPenaltyLockoutUntil, getSocraticPenaltyRemaining]);

  const defaultChoices: SocraticChoice[] = [
    { id: 'A', textHe: 'נאסוף 10 יחידות מטור היחידות ונמיר אותן לעשרת אחת בטור העשרות.', isCorrect: true, feedbackHe: 'תשובה נכונה! כעת בצעו את ההמרה בלוח הדינס.' },
    { id: 'B', textHe: 'נמחק 10 יחידות מטור היחידות מבלי להוסיף עשרת.', isCorrect: false, feedbackHe: 'רמז: מחיקת בלוקים משנה את ערך המספר! עלינו לשמר את הכמות הכוללת בעזרת המרה. אפשר להשתמש בביטול ↩️.' },
    { id: 'C', textHe: 'נעביר קובייה אחת בלבד לטור העשרות.', isCorrect: false, feedbackHe: 'רמז: 1 עשרת שווה בדיוק ל-10 יחידות. העברת קובייה אחת בלבד אינה שקולה לעשרת. אפשר להשתמש בביטול ↩️.' },
  ];

  const rawChoices: SocraticChoice[] = (aiSocraticHint?.choices && aiSocraticHint.choices.length > 0)
    ? aiSocraticHint.choices
    : defaultChoices;

  const options = rawChoices.map((c, idx) => {
    const isCorrect = c.isCorrect !== undefined
      ? c.isCorrect
      : (aiSocraticHint?.correctChoiceId ? c.id === aiSocraticHint.correctChoiceId : idx === 0);
    const hint = c.feedbackHe || c.hint || (isCorrect
      ? 'תשובה נכונה! כעת בצעו את הפעולה בלוח הדינס.'
      : 'רמז: חשבו שוב כיצד לשמר את הכמות בבית המספרים. אפשר להשתמש בביטול ↩️.');
    return {
      id: c.id,
      text: c.textHe,
      correct: isCorrect,
      hint
    };
  });

  const handleSelect = (opt: typeof options[0]) => {
    if (lockSeconds > 0) return;
    setSelectedOpt(opt.id);
    setFeedbackHint(opt.hint);
    if (!opt.correct) {
      // PRD v4.2 Module 12: 60-second penalty lock on wrong distractor in Socratic Card
      triggerSocraticPenaltyLockout(opt.hint);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-2.5">
      <p className="font-extrabold text-xs text-ws-soft">בחרו את הדרך הנכונה להתקדם:</p>
      {options.map((opt) => {
        const isChosen = selectedOpt === opt.id;
        const isWrongChosen = isChosen && !opt.correct;
        const isCorrectChosen = isChosen && opt.correct;
        const isOtherDisabled = lockSeconds > 0 && !isChosen;

        return (
          <button
            key={opt.id}
            disabled={lockSeconds > 0}
            onClick={() => handleSelect(opt)}
            className={`p-3 rounded-2xl border-2 text-right font-medium text-xs sm:text-sm transition-all flex items-start gap-2 ${
              isCorrectChosen
                ? 'border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100'
                : isWrongChosen
                ? 'border-rose-500 bg-rose-100 text-rose-950 dark:bg-rose-950/60 dark:text-rose-100 font-bold'
                : isOtherDisabled
                ? 'border-ws-surface2 opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800'
                : 'border-ws-surface2 bg-ws-surface hover:border-ws-accent hover:bg-ws-accentSoft/30'
            }`}
          >
            {isWrongChosen && <span className="text-rose-600 font-black shrink-0" aria-hidden="true">❌</span>}
            {isCorrectChosen && <span className="text-emerald-600 font-black shrink-0" aria-hidden="true">✅</span>}
            <span>{opt.text}</span>
          </button>
        );
      })}

      {lockSeconds > 0 && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3 text-center text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-bold animate-pulse space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-base font-black">
            <span>⏳</span>
            <span>החלונית נעולה לחשיבה: {lockSeconds} שניות</span>
          </div>
          <p className="text-xs text-amber-800/90 dark:text-amber-300/90 font-medium">
            לוח הדינס וכפתור הביטול (↩️) פתוחים ופעילים. נסו לחקור את הבלוקים עד שהחלונית תיפתח מחדש.
          </p>
        </div>
      )}

      {feedbackHint && (
        <div className={`rounded-2xl p-3 text-xs sm:text-sm font-semibold ${
          selectedOpt && options.find(o => o.id === selectedOpt)?.correct 
            ? 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800' 
            : 'bg-rose-50 text-rose-950 dark:bg-rose-950/50 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
        }`}>
          💡 {feedbackHint}
        </div>
      )}

      <button
        onClick={onClose}
        disabled={lockSeconds > 0}
        className={`mt-2 w-full h-10 rounded-full font-display font-extrabold text-sm transition-all ${
          lockSeconds > 0
            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
            : 'bg-ws-accent text-white hover:brightness-105 shadow-md'
        }`}
      >
        {lockSeconds > 0 ? `חלונית נעולה (${lockSeconds}ש')` : 'הבנתי, סגור חלונית'}
      </button>
    </div>
  );
}
