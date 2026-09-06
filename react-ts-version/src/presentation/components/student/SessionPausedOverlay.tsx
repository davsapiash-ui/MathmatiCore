import { motion } from 'framer-motion';

/**
 * Owner decision (6.9.2026, register item 10): when the teacher pauses the
 * meeting, every learner sees this calm screen in place, over the workspace,
 * without leaving it. The board underneath is kept exactly as it was; the
 * overlay just takes the pointer. Resuming removes it and work continues.
 */
export function SessionPausedOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      dir="rtl"
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm font-body select-none"
    >
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center bg-white dark:bg-slate-900 p-10 rounded-3xl border border-amber-100 dark:border-slate-800 shadow-xl shadow-amber-500/5">
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="w-24 h-24 rounded-3xl bg-amber-500/10 dark:bg-amber-400/15 border-2 border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-5xl shadow-inner"
          aria-hidden="true"
        >
          ⏸️
        </motion.div>
        <div className="flex flex-col gap-2">
          <h2 className="font-display font-black text-2xl text-slate-800 dark:text-slate-100">המורה עצרה את הפעילות לרגע</h2>
          <p className="text-base text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            חכו רגע. כשהמורה תמשיך, העבודה שלכם תחזור בדיוק מאיפה שעצרתם.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.35, ease: 'easeInOut' }}
              className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
