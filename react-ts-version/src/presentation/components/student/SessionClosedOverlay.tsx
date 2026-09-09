import { motion } from 'framer-motion';
import { LogoutButton } from '@/presentation/components/ui/LogoutButton';

/**
 * החלטת בעל המוצר (6.9.2026, סטייה 10 ברשם הסטיות):
 * כאשר המורה סוגרת את המפגש, כל לומד רואה את המסך השקט הזה במקום (In-Place),
 * מעל מרחב העבודה, ללא ניווט אוטומטי ללובי וללא השמדת מרחב העבודה (Unmount).
 * העבודה של התלמיד שמורה לחלוטין מתחת. כשהמורה תפתח מפגש חדש, הפעילות תתחדש מיד.
 * כפתור התנתקות נגיש מאפשר לתלמיד להתנתק בצורה מסודרת בסיום יום הלימודים.
 */
export function SessionClosedOverlay() {
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
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="w-24 h-24 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-5xl shadow-inner"
          aria-hidden="true"
        >
          🐝✨
        </motion.div>
        <div className="flex flex-col gap-2">
          <h2 className="font-display font-black text-2xl text-slate-800 dark:text-slate-100">
            המורה סגרה את המפגש
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            העבודה שלכם נשמרה בבטחה. כשהמורה תפתח מפגש חדש, הפעילות תתחדש כאן מיד.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.35, ease: 'easeInOut' }}
              className="w-2.5 h-2.5 rounded-full bg-indigo-500 dark:bg-indigo-400"
            />
          ))}
        </div>

        {/* Accessible logout button so the student is never trapped when class ends */}
        <div className="pt-2 w-full flex justify-center">
          <LogoutButton className="h-12 px-6 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-slate-200 dark:border-slate-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs" />
        </div>
      </div>
    </motion.div>
  );
}
