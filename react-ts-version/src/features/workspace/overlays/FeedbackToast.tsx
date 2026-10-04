import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

/** The last feedback that already fired confetti — a remount must not fire it again. */
let lastCelebrated: unknown = null;

/** Longest a message stays on screen past its own time while it is read aloud (a read that never reports its end). */
export const FEEDBACK_READ_HOLD_MAX_MS = 30_000;

/**
 * משוב נכון/שגוי. Success fires confetti (150 particles, spread 70).
 * Display duration is owned by the store (nonce-guarded timers).
 *
 * Where it appears:
 *  - `inline` (meetings with the number house, 1 and 3–7): a compact note at
 *    the top of the task column, in the flow, above its heading ("תחנה N",
 *    "משימה N מתוך 7"). It used to float over the middle of the screen, where
 *    for a few seconds it covered the units column's name and digit, the
 *    exercise title, and the open coaching card — מסמך 03 §3.1 asks for a side
 *    card "השומר על נראות מלאה של התרגיל בבית המספרים ללא חלונות קופצים"
 *    (report row 1.15). Under the exercise it fell below a 768 px screen; laid
 *    over the heading it hid "משימה N מתוך 7" and the station chip (UX-004).
 *    In the flow it covers nothing: the column moves down while it is shown.
 *  - `floating` (meetings 2 and 8, the sheet alone in the middle): centred
 *    by its own motion value — framer-motion's transform replaced Tailwind's
 *    -translate-x-1/2, so its left edge sat at the centre (A3-117).
 *
 * PRD Module 7 §א: every instruction on the learner's screen has its own
 * read-aloud button — these messages too ("קבצו בעצמכם…", "כתבו את הספרה
 * החסרה…"). A message goes by itself after a few seconds, so the one being read
 * stays on screen until its read ends; a newer message replaces it.
 */
export function FeedbackToast({ placement = 'floating' }: { placement?: 'floating' | 'inline' }) {
  const storeFeedback = useWorkspaceStore((s) => s.feedback);
  const feedbackNonce = useWorkspaceStore((s) => s.feedbackNonce);
  const isASD = useWorkspaceStore((s) => s.isASD);
  /** The message the learner asked to hear, kept while it is read. */
  const [beingRead, setBeingRead] = useState<typeof storeFeedback>(null);
  useEffect(() => {
    if (storeFeedback && storeFeedback !== beingRead) setBeingRead(null);
  }, [storeFeedback, beingRead]);
  useEffect(() => {
    if (!beingRead) return;
    const t = setTimeout(() => setBeingRead(null), FEEDBACK_READ_HOLD_MAX_MS);
    return () => clearTimeout(t);
  }, [beingRead]);
  const feedback = storeFeedback ?? beingRead;
  const speechText = feedback ? (feedback.sub ? `${feedback.title}. ${feedback.sub}` : feedback.title) : '';

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
          initial={placement === 'inline' ? { opacity: 0, y: -8 } : { x: '-50%', y: -80, opacity: 0, scale: 0.95 }}
          animate={placement === 'inline' ? { opacity: 1, y: 0 } : { x: '-50%', y: 0, opacity: 1, scale: 1 }}
          exit={placement === 'inline' ? { opacity: 0 } : { x: '-50%', y: -80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className={`${
            placement === 'inline'
              ? 'relative z-20 mb-fl-4-6 rounded-2xl px-4 py-1.5 gap-3 shadow-[0_12px_28px_-14px_hsl(var(--ws-shadow-warm)/0.45)]'
              : 'fixed top-24 left-1/2 z-50 min-w-[340px] max-w-[540px] rounded-3xl px-6 py-5 shadow-[0_24px_48px_-16px_hsl(var(--ws-shadow-warm)/0.45)]'
          } flex items-start ${placement === 'inline' ? '' : 'gap-4'} bg-ws-surface border-2 ${
            feedback.neutral ? 'border-ws-ink/20' : feedback.correct ? 'border-ws-success/50' : 'border-ws-accent/50'
          }`}
          dir="rtl"
        >
          {/* The compact note in the task column keeps only the title's own emoji. */}
          {placement === 'floating' && (
            <span
              className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${
                feedback.neutral ? 'bg-ws-surface2' : feedback.correct ? 'bg-green-50' : 'bg-ws-accentSoft'
              }`}
              aria-hidden="true"
            >
              {feedback.neutral ? '👍' : feedback.correct ? '🌟' : '🤔'}
            </span>
          )}
          {/* The read-aloud button sits at the row's far end, as beside the instruction. */}
          <div className={`flex-1 min-w-0 ${placement === 'inline' ? '' : 'pt-0.5'}`}>
            <p className={`font-display font-extrabold ${placement === 'inline' ? 'text-base' : 'text-xl'} text-ws-ink leading-snug`}>{feedback.title}</p>
            {feedback.sub && <p className={`${placement === 'inline' ? 'text-sm leading-snug mt-0.5' : 'text-base mt-1 leading-relaxed'} text-ws-soft`}>{feedback.sub}</p>}
          </div>
          <UdlSpeechButton
            key={speechText}
            text={speechText}
            className="shrink-0 self-center"
            onPlayingChange={(playing) => setBeingRead((cur) => (playing ? feedback : cur === feedback ? null : cur))}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
