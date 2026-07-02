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
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 min-w-[320px] max-w-[520px] rounded-2xl shadow-2xl border px-6 py-4 flex items-start gap-3 bg-ws-surface ${
            feedback.correct ? 'border-ws-success' : 'border-ws-accent'
          }`}
          dir="rtl"
        >
          <span className="text-2xl leading-none mt-0.5" aria-hidden="true">
            {feedback.correct ? '🌟' : '🤔'}
          </span>
          <div>
            <p className="font-display font-extrabold text-lg text-ws-ink">{feedback.title}</p>
            {feedback.sub && <p className="text-sm text-ws-soft mt-0.5 leading-relaxed">{feedback.sub}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
