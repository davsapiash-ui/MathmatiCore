import { motion } from 'framer-motion';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { useTeacherGenderStore } from '@/application/useTeacherGender';
import { teacherSentenceHe } from '@/core/teacherGender';

/**
 * Owner decision (6.9.2026, register item 7): when the teacher pauses the
 * meeting, every learner sees this calm screen in place, over the workspace,
 * without leaving it. The board underneath is kept exactly as it was; the
 * overlay just takes the pointer. Resuming removes it and work continues.
 */
export function SessionPausedOverlay() {
  // No looping animation on this screen (a calm screen; ASD and special
  // education): the icon stands still and there is no "breathing" row of dots.
  const gender = useTeacherGenderStore((s) => s.gender);
  const title = teacherSentenceHe('pausedTitle', gender);
  const body = teacherSentenceHe('pausedBody', gender);
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
        <div
          className="w-24 h-24 rounded-3xl bg-amber-500/10 dark:bg-amber-400/15 border-2 border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-5xl shadow-inner"
          aria-hidden="true"
        >
          ⏸️
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-display font-black text-2xl text-slate-800 dark:text-slate-100">{title}</h2>
          <p className="text-base text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            {body}
          </p>
          <UdlSpeechButton text={`${title}. ${body}`} className="self-center" />
        </div>
      </div>
    </motion.div>
  );
}
