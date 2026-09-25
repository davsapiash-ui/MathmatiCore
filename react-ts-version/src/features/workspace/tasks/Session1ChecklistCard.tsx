import { motion } from 'framer-motion';
import type { Session1ChecklistItem } from '@/core/session1Checklist';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

/**
 * מפגש 1 — the checklist of a guided step (מסמך 03 §3.1): what the step asks,
 * ticked off as the learner acts. "התקדם" lights up when every item is done
 * (the store applies the same rule, core/session1Checklist.ts).
 */
export function Session1ChecklistCard({ items }: { items: Session1ChecklistItem[] }) {
  const allDone = items.every((i) => i.done);
  return (
    <div className="flex flex-col gap-4 bg-ws-surface p-6 rounded-2xl border border-ws-surface2 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-lg font-bold text-ws-ink">📋 מה עושים בשלב הזה:</h3>
        {/* PRD Module 24: every instruction on screen has its read-aloud button. */}
        <UdlSpeechButton text={items.map((i) => i.label).join('. ')} />
      </div>

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between p-4 rounded-xl bg-ws-bg border border-ws-surface2 transition-all">
            <div className="flex items-center gap-3">
              <span className={`text-2xl transition-transform ${item.done ? 'scale-110 text-green-500' : 'text-slate-400'}`}>
                {item.done ? '✅' : '⏳'}
              </span>
              <span className={`text-base font-semibold ${item.done ? 'text-ws-soft line-through' : 'text-ws-ink'}`}>
                {item.label}
              </span>
            </div>
            {item.progress ? (
              <div className="flex items-center gap-2">
                <div className="w-20 bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-ws-accent h-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (item.progress.value / item.progress.of) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-mono font-bold text-ws-soft">{Math.min(item.progress.value, item.progress.of)}/{item.progress.of}</span>
              </div>
            ) : (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-ws-soft">
                {item.done ? 'בוצע!' : 'עוד לא'}
              </span>
            )}
          </div>
        ))}
      </div>

      {allDone && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-2 p-4 bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 rounded-2xl text-center shadow-sm"
          role="status"
          aria-live="polite"
        >
          <span className="text-emerald-800 font-black block text-base">
            ✨ מצוין! לחצו על כפתור <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-lg">התקדם ←</span> בסרגל העליון כדי לעבור לשלב הבא!
          </span>
        </motion.div>
      )}
    </div>
  );
}
