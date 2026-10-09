import { motion } from 'framer-motion';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { LogoutButton } from '@/presentation/components/ui/LogoutButton';
import { useTeacherGenderStore } from '@/application/useTeacherGender';
import { teacherSentenceHe } from '@/core/teacherGender';

/**
 * החלטת בעל המוצר (6.9.2026, סטייה 10 ברשם הסטיות):
 * כאשר המורה סוגרת את המפגש, כל לומד רואה את המסך השקט הזה במקום (In-Place),
 * מעל מרחב העבודה, ללא ניווט אוטומטי ללובי וללא השמדת מרחב העבודה (Unmount).
 * העבודה של התלמיד שמורה לחלוטין מתחת.
 * כפתור התנתקות נגיש מאפשר לתלמיד להתנתק בצורה מסודרת בסיום יום הלימודים.
 */
export function SessionClosedOverlay() {
  // PRD 14 §ב0, the close: shown only to a learner who has not finished the
  // station (one who has sees the station's own end screen), so the second
  // line is the same in every station — the teacher sets a time with them to
  // go on (catch-up time, stations 2–8).
  // No looping animation on this screen (a calm screen; ASD and special
  // education): the icon stands still and there is no "breathing" row of dots.
  const gender = useTeacherGenderStore((s) => s.gender);
  const title = teacherSentenceHe('closedTitle', gender);
  const body = teacherSentenceHe('closedBodyMeeting2Unfinished', gender);
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
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center bg-white dark:bg-slate-900 p-10 rounded-3xl border border-indigo-100 dark:border-slate-800 shadow-xl shadow-indigo-500/5">
        <div
          className="w-24 h-24 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-5xl shadow-inner"
          aria-hidden="true"
        >
          ✨
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-display font-black text-2xl text-slate-800 dark:text-slate-100">
            {title}
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            {body}
          </p>
          <UdlSpeechButton text={`${title}. ${body}`} className="self-center" />
        </div>

        {/* Accessible logout button so the student is never trapped when class ends */}
        <div className="pt-2 w-full flex justify-center">
          <LogoutButton className="h-12 px-6 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-slate-200 dark:border-slate-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs" />
        </div>
      </div>
    </motion.div>
  );
}
