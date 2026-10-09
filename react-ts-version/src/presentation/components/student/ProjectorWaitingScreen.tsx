import { motion } from 'framer-motion';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

/**
 * מודול 15: מסך המתנה למצב מקרן (Projector Waiting Screen)
 * מסך שליו ורגוע המופיע בעת שהמורה מפעיל את מצב המקרן בכיתה.
 * רקע סטטי נעים, אייקון מקרן ברור, וטקסט: "הקשיבו להסבר של המורה על גבי המקרן".
 * ללא חלונות קופצים או מודאלים מסיחים, סנכרון בזמן אמת מתחת ל-1000ms.
 */
export function ProjectorWaitingScreen() {
  // No looping animation on this screen (a calm screen; ASD and special
  // education): the icon stands still and there is no "breathing" row of dots.
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      dir="rtl"
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-ws-bg font-body select-none overflow-hidden"
    >
      {/* The same quiet card as the lobby, the opening and the end screens
          (PRD 7 §א: one calm colour code across the learner's screens). */}
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center bg-ws-surface text-ws-ink p-10 rounded-3xl shadow-sm border-2 border-ws-surface2">
        {/* PRD Module 15: "איור מקרן שליו" — a still line drawing, no emoji. */}
        <div aria-hidden="true" className="w-24 h-24 rounded-3xl bg-ws-surface2/60 flex items-center justify-center text-ws-soft">
          <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="12" x="3" y="6" rx="2" />
            <circle cx="9" cy="12" r="3" />
            <path d="M15 10h2" />
            <path d="M15 14h2" />
            <line x1="6" y1="18" x2="6" y2="20" />
            <line x1="18" y1="18" x2="18" y2="20" />
          </svg>
        </div>
        {/* PRD Module 15: the one sentence, with no heading above it (not "הדגמה על גבי המקרן"). */}
        <div className="flex flex-col gap-3">
          <p className="font-display font-black text-2xl text-ws-ink leading-relaxed">
            הקשיבו להסבר של המורה על גבי המקרן
          </p>
          <UdlSpeechButton text="הקשיבו להסבר של המורה על גבי המקרן" className="self-center" />
        </div>
      </div>
    </motion.div>
  );
}
