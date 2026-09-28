import { motion } from 'framer-motion';
import type { Session1ChecklistItem } from '@/core/session1Checklist';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { PROCEED_HE, PROCEED_SENTENCE_HE, proceedSentenceHe } from '@/core/toolbarNames';

/**
 * מפגש 1 — the checklist of a guided step (מסמך 03 §3.1): what the step asks,
 * ticked off as the learner acts. The proceed button lights up when every item is done
 * (the store applies the same rule, core/session1Checklist.ts).
 *
 * `doneNote` (session1DoneNoteHe) is said first once every item is done — the
 * target task's "נכון! הלבנים מסודרות אחרת, אבל המספר נשאר 347." (owner,
 * 27.9.2026). It carries the praise itself, so it takes the place of
 * "✨ מצוין!": one praise, then what to press.
 *
 * The sentence on the screen and the one read aloud are built from the same
 * halves and the button's own name (core/toolbarNames), so they cannot drift.
 */
export function Session1ChecklistCard({ items, doneNote = null }: { items: Session1ChecklistItem[]; doneNote?: string | null }) {
  const allDone = items.every((i) => i.done);
  const proceedHe = proceedSentenceHe();
  return (
    <div className="flex flex-col gap-fl-6-16 bg-ws-surface p-fl-8-24 rounded-2xl border border-ws-surface2 shadow-sm" data-testid="session1-checklist">
      <div className="flex items-center justify-between gap-3 mb-fl-0-4">
        <h3 className="text-lg font-bold text-ws-ink">📋 מה עושים בשלב הזה:</h3>
        {/* PRD Module 24: every instruction on screen has its read-aloud button. */}
        <UdlSpeechButton text={items.map((i) => i.label).join('. ')} />
      </div>

      <div className="flex flex-col gap-fl-4-12">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between px-fl-8-16 py-fl-5-16 rounded-xl bg-ws-bg border border-ws-surface2 transition-all">
            <div className="flex items-center gap-3">
              <span className={`text-fl-16-24 transition-transform ${item.done ? 'scale-110 text-green-500' : 'text-slate-400'}`}>
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
              <span className="shrink-0 whitespace-nowrap text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-ws-soft">
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
          className="mt-fl-0-8 p-fl-10-16 bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 rounded-2xl text-center shadow-sm"
          role="status"
          aria-live="polite"
          data-testid="session1-done"
        >
          {doneNote && (
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-emerald-800 font-black text-base">{doneNote}</span>
            </div>
          )}
          <div className="flex items-center justify-center gap-2">
            <span className="text-emerald-800 font-black block text-base" data-testid="proceed-sentence">
              {doneNote ? '' : '✨ מצוין! '}{PROCEED_SENTENCE_HE.before}{' '}
              <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-lg" data-testid="proceed-chip">{PROCEED_HE} <span aria-hidden="true">←</span></span>{' '}
              {PROCEED_SENTENCE_HE.after}
            </span>
            {/* PRD Module 24: what the box says is read aloud on the child's click only. */}
            <UdlSpeechButton text={doneNote ? `${doneNote} ${proceedHe}` : `מצוין! ${proceedHe}`} className="shrink-0" />
          </div>
        </motion.div>
      )}
    </div>
  );
}
