import { motion } from 'framer-motion';

/**
 * מודול 15: מסך המתנה למצב מקרן (Projector Waiting Screen)
 * מסך שליו ורגוע המופיע בעת שהמורה מפעיל את מצב המקרן בכיתה.
 * רקע סטטי נעים, אייקון מקרן ברור, וטקסט: "הקשיבו להסבר של המורה על גבי המקרן".
 * ללא חלונות קופצים או מודאלים מסיחים, סנכרון בזמן אמת מתחת ל-1000ms.
 */
export function ProjectorWaitingScreen() {
  return (
    <div
      dir="rtl"
      className="relative min-h-[calc(100vh-72px)] flex flex-col items-center justify-center p-6 bg-gradient-to-b from-indigo-50/60 via-slate-50 to-blue-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 font-body text-slate-900 dark:text-slate-100 select-none overflow-hidden"
    >
      {/* Serene Ambient Background */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-200/30 dark:bg-indigo-900/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-blue-200/30 dark:bg-blue-900/15 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-8 text-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-10 rounded-3xl border border-indigo-100 dark:border-slate-800 shadow-xl shadow-indigo-500/5">
        {/* Projector Icon */}
        <motion.div
          animate={{
            y: [-3, 3, -3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="w-24 h-24 rounded-3xl bg-indigo-600/10 dark:bg-indigo-500/20 border-2 border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-inner"
        >
          <svg
            className="w-12 h-12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Projector Body */}
            <rect width="18" height="12" x="3" y="6" rx="2" />
            <circle cx="9" cy="12" r="3" />
            <path d="M15 10h2" />
            <path d="M15 14h2" />
            {/* Projector Lens Light Beam */}
            <path d="M9 9l-3-3" strokeDasharray="2 2" opacity="0.6" />
            <path d="M9 15l-3 3" strokeDasharray="2 2" opacity="0.6" />
            {/* Legs */}
            <line x1="6" y1="18" x2="6" y2="20" />
            <line x1="18" y1="18" x2="18" y2="20" />
          </svg>
        </motion.div>

        {/* Message */}
        <div className="flex flex-col gap-3">
          <h2 className="font-display font-black text-2xl text-slate-800 dark:text-slate-100">
            הדגמה על גבי המקרן 📽️
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            הקשיבו להסבר של המורה על גבי המקרן
          </p>
        </div>

        {/* Subtle breathing indicator */}
        <div className="flex items-center gap-2 pt-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                delay: i * 0.35,
                ease: "easeInOut",
              }}
              className="w-2.5 h-2.5 rounded-full bg-indigo-500 dark:bg-indigo-400"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
