import { motion } from 'framer-motion';

/**
 * נקודות התקדמות — ללא מספרים, ללא אחוזים (בהתאם לאיסור חיוויי לחץ).
 * שלב שהושלם מקבל כוכב קטן; השלב הפעיל גדל ונושם. aria-hidden (דקורטיבי בלבד).
 */
export function ProgressDots({ total, current }: { total: number; current: number }) {
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
            className={`rounded-full flex items-center justify-center transition-colors duration-300 ${
              active
                ? 'w-flw-16-20 h-flw-16-20 ws-btn-primary'
                : done
                  ? 'w-flw-16-20 h-flw-16-20 bg-ws-success text-white text-[10px] leading-none'
                  : 'w-flw-10-12 h-flw-10-12 bg-ws-surface2'
            }`}
          >
            {done && '✓'}
          </motion.div>
        );
      })}
    </div>
  );
}
