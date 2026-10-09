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
      className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-ws-bg font-body select-none"
    >
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center bg-ws-surface text-ws-ink p-10 rounded-3xl shadow-sm border-2 border-ws-surface2">
        <div className="flex flex-col gap-2">
          <h2 className="font-display font-black text-2xl text-ws-ink">
            {title}
          </h2>
          <p className="text-base text-ws-soft font-medium leading-relaxed">
            {body}
          </p>
          <UdlSpeechButton text={`${title}. ${body}`} className="self-center" />
        </div>

        {/* Accessible logout button so the student is never trapped when class ends */}
        <div className="pt-2 w-full flex justify-center">
          <LogoutButton className="h-12 px-6 rounded-2xl text-sm font-bold text-ws-soft hover:text-rose-600 hover:bg-rose-50 border border-ws-surface2 transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs" />
        </div>
      </div>
    </motion.div>
  );
}
