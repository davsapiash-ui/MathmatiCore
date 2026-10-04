import { motion } from 'framer-motion';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/**
 * נקודות התקדמות — ללא מספרים, ללא אחוזים (בהתאם לאיסור חיוויי לחץ).
 * שלב שהושלם מקבל כוכב קטן; השלב הפעיל גדל ונושם. aria-hidden (דקורטיבי בלבד).
 *
 * מפגש 2: שלב שהושלם מסומן בצבע ניטרלי, בלי ירוק ובלי ✓ — ירוק עם ✓ אחרי
 * תשובה שגויה נקרא כ"נכון" (מרשם: "מפגש 2 — אישור שקט במקום חגיגה על טעות",
 * "בלי ירוק ובלי אדום"; מרשם ז: בלי משוב שמגלה נכונות). `neutralDone` קובע
 * במפורש; בלעדיו — לפי המפגש שבחנות.
 */
export function ProgressDots({ total, current, neutralDone }: { total: number; current: number; neutralDone?: boolean }) {
  const meeting2 = useWorkspaceStore((s) => s.sessionNumber === 2);
  const neutral = neutralDone ?? meeting2;
  return (
    <div className="flex gap-flw-4-10 items-center" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <motion.div
            key={i}
            initial={false}
            animate={{ scale: active ? 1.15 : 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            data-testid="progress-dot"
            className={`rounded-full flex items-center justify-center transition-colors duration-300 ${
              active
                ? 'w-flw-16-20 h-flw-16-20 ws-btn-primary'
                : done
                  ? neutral
                    ? 'w-flw-16-20 h-flw-16-20 bg-ws-ink/30'
                    : 'w-flw-16-20 h-flw-16-20 bg-ws-success text-white text-[10px] leading-none'
                  : 'w-flw-10-12 h-flw-10-12 bg-ws-surface2'
            }`}
          >
            {done && !neutral && '✓'}
          </motion.div>
        );
      })}
    </div>
  );
}
