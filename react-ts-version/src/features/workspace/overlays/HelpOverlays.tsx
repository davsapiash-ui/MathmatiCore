import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspaceStore, type SupportType, getActiveTasks } from '@/application/useWorkspaceStore';
import { SUPPORT_CONTENT, getDynamicSocraticHint } from '@/data/sessionTasks';

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
            <p className="font-display font-extrabold text-2xl text-white">בוא נחשוב רגע יחד…</p>
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
                <h2 className="font-display font-extrabold text-xl text-ws-ink">איך תרצה לקבל עזרה?</h2>
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

      {/* Socratic content modal with 3 closed options & 30s penalty lock */}
      <AnimatePresence>
        {content && (
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

              {content.kind === 'equivalence' && (
                /* Visual 10 ↔ ten-units equivalence (vanilla socratic graphic) */
                <div className="flex items-center justify-center gap-4 mb-5 bg-ws-surface2/50 rounded-2xl p-4" dir="ltr" aria-hidden="true">
                  <div className="w-[100px] h-[12px] rounded-[2px]" style={{ backgroundColor: 'var(--block-ten)' }} />
                  <span className="font-black text-2xl text-ws-soft">=</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <span key={i} className="w-3 h-3 rounded-[1px] inline-block" style={{ backgroundColor: 'var(--block-unit)' }} />
                    ))}
                  </div>
                </div>
              )}

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

              {/* 3 Closed Options for Socratic Mentoring */}
              {helpState === 'socratic' && (
                <SocraticPenaltyLockOptions onClose={closeHelp} />
              )}

              {helpState !== 'socratic' && (
                <button
                  onClick={closeHelp}
                  className="mt-7 w-full h-12 rounded-full font-display font-extrabold text-lg text-white bg-ws-accent shadow-md hover:brightness-105 active:scale-95 transition-all"
                >
                  הבנתי, חזרה לתרגיל
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SocraticPenaltyLockOptions({ onClose }: { onClose: () => void }) {
  const [lockSeconds, setLockSeconds] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [feedbackHint, setFeedbackHint] = useState<string | null>(null);

  useEffect(() => {
    if (lockSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockSeconds((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [lockSeconds]);

  const options = [
    { id: 'A', text: 'א. נאסוף 10 יחידות מטור היחידות ונמיר אותן לעשרת אחת בטור העשרות.', correct: true, hint: 'תשובה נכונה! כעת בצעו את ההמרה בלוח הדינס.' },
    { id: 'B', text: 'ב. נמחק 10 יחידות מטור היחידות מבלי להוסיף עשרת.', correct: false, hint: 'רמז: מחיקת בלוקים משנה את ערך המספר! עלינו לשמר את הכמות הכוללת בעזרת המרה.' },
    { id: 'C', text: 'ג. נעביר קובייה אחת בלבד לטור העשרות.', correct: false, hint: 'רמז: 1 עשרת שווה בדיוק ל-10 יחידות. העברת קובייה אחת בלבד אינה שקולה לעשרת.' },
  ];

  const handleSelect = (opt: typeof options[0]) => {
    if (lockSeconds > 0) return;
    setSelectedOpt(opt.id);
    setFeedbackHint(opt.hint);
    if (!opt.correct) {
      // PRD v3.3 Module 12: 60-second penalty lock on wrong distractor
      setLockSeconds(60);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-3">
      <p className="font-extrabold text-sm text-ws-soft">בחרו את הדרך הנכונה להתקדם:</p>
      {options.map((opt) => (
        <button
          key={opt.id}
          disabled={lockSeconds > 0}
          onClick={() => handleSelect(opt)}
          className={`p-3.5 rounded-2xl border-2 text-right font-medium text-sm transition-all ${
            selectedOpt === opt.id
              ? opt.correct
                ? 'border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100'
                : 'border-rose-500 bg-rose-50 text-rose-950 dark:bg-rose-950/40 dark:text-rose-100'
              : lockSeconds > 0
              ? 'border-ws-surface2 opacity-50 cursor-not-allowed'
              : 'border-ws-surface2 bg-ws-surface hover:border-ws-accent hover:bg-ws-accentSoft/30'
          }`}
        >
          {opt.text}
        </button>
      ))}

      {lockSeconds > 0 && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3.5 text-center text-amber-900 dark:text-amber-200 text-sm font-bold animate-pulse">
          ⏳ בואו נחשוב עוד רגע... חלון המענה ייפתח מחדש בעוד <span className="font-black text-base">{lockSeconds}</span> שניות כדי שנוכל לבדוק את התשובה בנחת.
        </div>
      )}

      {feedbackHint && (
        <div className="bg-ws-surface2/60 rounded-2xl p-3.5 text-sm text-ws-ink font-semibold">
          💡 {feedbackHint}
        </div>
      )}

      <button
        onClick={onClose}
        disabled={lockSeconds > 0}
        className={`mt-3 w-full h-12 rounded-full font-display font-extrabold text-base transition-all ${
          lockSeconds > 0
            ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
            : 'bg-ws-accent text-white hover:brightness-105 shadow-md'
        }`}
      >
        {lockSeconds > 0 ? `חלונית נעולה (${lockSeconds}ש')` : 'הבנתי, חזרה לתרגיל'}
      </button>
    </div>
  );
}
