import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'framer-motion';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { MathText, SentenceLines } from '../tasks/MathText';

/** Longest a message stays on screen past its own time while it is read aloud (a read that never reports its end). */
export const FEEDBACK_READ_HOLD_MAX_MS = 30_000;

/**
 * The slot the feedback sentence sits in, under the work area (PRD Module 7
 * §א: "אזור העבודה ... ומתחתיו משפט הפיגום או המשוב"; owner, 11.10.2026). It
 * comes after the work area, so the work area never moves when a sentence
 * appears or goes, and it reserves up to 64px from the start of the exercise.
 * It is the one item of the column that gives way (flex-shrink, down to 0)
 * when the card is short: a reservation that does not fit would make the card
 * scroll (PRD Module 7 rule 7). In the vertical exercises at 1366×633 and
 * 1280×585 there is less than 64px under the sheet, so a note shown there
 * runs past the card's bottom (open question for the owner, 11.10.2026).
 */
export const FEEDBACK_SLOT_CLASS = 'relative grow-0 shrink basis-16 min-h-0';

export function FeedbackSlot() {
  return (
    <div className={FEEDBACK_SLOT_CLASS} data-testid="feedback-slot">
      <FeedbackToast placement="inline" />
    </div>
  );
}

/**
 * משוב נכון/שגוי. Display duration is owned by the store (nonce-guarded timers).
 * Calm (owner, 11.10.2026; PRD Module 7 rule 8): no confetti, no spring, no
 * slide — a 200 ms opacity fade only, none with reduced motion.
 *
 * Where it appears:
 *  - `inline` (meetings with the number house, 1 and 3–7): in the flow of
 *    FeedbackSlot, under the work area (the result row or the vertical sheet),
 *    in a slot whose height is reserved — never over the heading, the guide or
 *    the exercise (UX-004, report row 1.15).
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
  const reduceMotion = useReducedMotionConfig();
  const speechText = feedback ? (feedback.sub ? `${feedback.title}. ${feedback.sub}` : feedback.title) : '';

  return (
    // Inline, the note is in the slot's flow: a leaving note is lifted out of it
    // (popLayout) while it fades, so a newer one takes its place at once and the two never stack.
    <AnimatePresence mode={placement === 'inline' ? 'popLayout' : 'sync'}>
      {feedback && (
        <motion.div
          key={feedback.nonce || feedbackNonce || `${feedback.title}-${feedback.correct}`}
          role="status"
          aria-live="assertive"
          data-testid="feedback-toast"
          data-placement={placement}
          initial={placement === 'inline' ? { opacity: 0 } : { x: '-50%', opacity: 0 }}
          animate={placement === 'inline' ? { opacity: 1 } : { x: '-50%', opacity: 1 }}
          exit={placement === 'inline' ? { opacity: 0 } : { x: '-50%', opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className={`${
            placement === 'inline'
              ? 'relative w-full mt-2 rounded-2xl px-4 py-2 gap-2'
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
          {/* The read-aloud button sits at the row's far end, as beside the instruction.
              Title and sub go through MathText: "נכון! 5,432 − 2,118 = 3,314" keeps
              its exercise left to right (audit A6-101; chief re-review B-2). */}
          <div className={`flex-1 min-w-0 ${placement === 'inline' ? '' : 'pt-0.5'}`}>
            <p className={`font-display font-extrabold ${placement === 'inline' ? 'text-base' : 'text-xl'} text-ws-ink leading-snug`}><MathText text={feedback.title} /></p>
            {feedback.sub && <p className={`${placement === 'inline' ? 'text-sm leading-snug mt-0.5' : 'text-base mt-1 leading-relaxed'} text-ws-soft`}><SentenceLines text={feedback.sub} /></p>}
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
