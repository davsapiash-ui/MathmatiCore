import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/**
 * משוב נכון/שגוי — top toast (replaces vanilla SweetAlert2 + confetti CDN).
 * Success fires confetti (150 particles, spread 70 — vanilla showFeedback).
 * Display duration is owned by the store (nonce-guarded timers).
 */
export function FeedbackToast() {
  const feedback = useWorkspaceStore((s) => s.feedback);
  const isASD = useWorkspaceStore((s) => s.isASD);

  useEffect(() => {
    if (feedback?.correct && !isASD) {
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
          role="status"
          aria-live="assertive"
          initial={{ y: -80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 min-w-[340px] max-w-[540px] rounded-3xl px-6 py-5 flex items-start gap-4 bg-ws-surface border-2 shadow-[0_24px_48px_-16px_hsl(var(--ws-shadow-warm)/0.45)] ${
            feedback.correct ? 'border-ws-success/50' : 'border-ws-accent/50'
          }`}
          dir="rtl"
        >
          <span
            className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${
              feedback.correct ? 'bg-green-50' : 'bg-ws-accentSoft'
            }`}
            aria-hidden="true"
          >
            {feedback.correct ? '🌟' : '🤔'}
          </span>
          <div className="pt-0.5">
            <p className="font-display font-extrabold text-xl text-ws-ink leading-snug">{feedback.title}</p>
            {feedback.sub && <p className="text-base text-ws-soft mt-1 leading-relaxed">{feedback.sub}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
