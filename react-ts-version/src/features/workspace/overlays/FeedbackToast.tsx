import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/** The last feedback that already fired confetti — a remount must not fire it again. */
let lastCelebrated: unknown = null;

/**
 * משוב נכון/שגוי. Success fires confetti (150 particles, spread 70).
 * Display duration is owned by the store (nonce-guarded timers).
 *
 * Where it appears:
 *  - `inline` (meetings with the number house, 1 and 3–7): a calm line in the
 *    task column, under the exercise. It used to float over the middle of the
 *    screen, where for a few seconds it covered the units column's name and
 *    digit, the exercise title, and the open coaching card — מסמך 03 §3.1 asks
 *    for a side card "השומר על נראות מלאה של התרגיל בבית המספרים ללא חלונות
 *    קופצים" (report row 1.15). In the column it covers nothing.
 *  - `floating` (meetings 2 and 8, the sheet alone in the middle): as before.
 */
export function FeedbackToast({ placement = 'floating' }: { placement?: 'floating' | 'inline' }) {
  const feedback = useWorkspaceStore((s) => s.feedback);
  const feedbackNonce = useWorkspaceStore((s) => s.feedbackNonce);
  const isASD = useWorkspaceStore((s) => s.isASD);

  useEffect(() => {
    if (feedback?.correct && !feedback.neutral && !isASD && lastCelebrated !== feedback) {
      lastCelebrated = feedback;
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.3 },
        colors: ['#10B981', '#3B82F6', '#F59E0B'],
      });
    }
  }, [feedback, isASD]);

  return (
    <AnimatePresence>
      {feedback && (
        <motion.div
          key={feedback.nonce || feedbackNonce || `${feedback.title}-${feedback.correct}`}
          role="status"
          aria-live="assertive"
          data-testid="feedback-toast"
          data-placement={placement}
          initial={placement === 'inline' ? { opacity: 0, y: 8 } : { y: -80, opacity: 0, scale: 0.95 }}
          animate={placement === 'inline' ? { opacity: 1, y: 0 } : { y: 0, opacity: 1, scale: 1 }}
          exit={placement === 'inline' ? { opacity: 0 } : { y: -80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className={`${
            placement === 'inline'
              ? 'shrink-0 mt-3 short:mt-2 w-full rounded-2xl px-4 py-3 short:py-2'
              : 'fixed top-24 left-1/2 -translate-x-1/2 z-50 min-w-[340px] max-w-[540px] rounded-3xl px-6 py-5 shadow-[0_24px_48px_-16px_hsl(var(--ws-shadow-warm)/0.45)]'
          } flex items-start gap-4 bg-ws-surface border-2 ${
            feedback.neutral ? 'border-ws-ink/20' : feedback.correct ? 'border-ws-success/50' : 'border-ws-accent/50'
          }`}
          dir="rtl"
        >
          <span
            className={`shrink-0 ${placement === 'inline' ? 'w-10 h-10 text-xl' : 'w-12 h-12'} rounded-2xl flex items-center justify-center text-2xl ${
              feedback.neutral ? 'bg-ws-surface2' : feedback.correct ? 'bg-green-50' : 'bg-ws-accentSoft'
            }`}
            aria-hidden="true"
          >
            {feedback.neutral ? '👍' : feedback.correct ? '🌟' : '🤔'}
          </span>
          <div className="pt-0.5">
            <p className={`font-display font-extrabold ${placement === 'inline' ? 'text-lg' : 'text-xl'} text-ws-ink leading-snug`}>{feedback.title}</p>
            {feedback.sub && <p className={`${placement === 'inline' ? 'text-sm' : 'text-base'} text-ws-soft mt-1 leading-relaxed`}>{feedback.sub}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
