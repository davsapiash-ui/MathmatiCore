import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ref, onValue } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { normalizeStudentId } from '@/application/useChatStore';

interface BeeFlightWaitingScreenProps {
  onApproved?: () => void;
}

/**
 * מודול 20: מסך המתנה "מעוף הדבורה" (Bee Flight Waiting Screen)
 * מסך סיום חיובי ומעודד המבשר לתלמיד בנחת כי המורים בודקים את עבודתו.
 * ללא שלטי נעילה, חיוויי חסימה, מילים מעוררות חרדה או משוב שלילי.
 * מאזין בזמן אמת לשדה teacher_gate_approved ומשחרר את הנתיב בפחות מ-1000ms.
 */
export function BeeFlightWaitingScreen({ onApproved }: BeeFlightWaitingScreenProps) {
  const user = useAuthStore((s) => s.user);
  const rawUid = user?.uid || '';
  const studentId = normalizeStudentId(rawUid);
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    if (!studentId) return;

    const studentRef = ref(database, `users/students/${studentId}`);
    const unsub = onValue(studentRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        const approved = val.teacher_gate_approved === true || val.routeStatus === 'APPROVED';
        if (approved) {
          setIsApproved(true);
          if (onApproved) {
            onApproved();
          }
        }
      }
    });

    return () => unsub();
  }, [studentId, onApproved]);

  return (
    <div
      dir="rtl"
      className="relative min-h-[calc(100vh-72px)] flex flex-col items-center justify-center p-6 bg-gradient-to-b from-amber-50/50 via-sky-50/40 to-emerald-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 font-body text-slate-900 dark:text-slate-100 select-none overflow-hidden"
    >
      {/* Soothing Ambient Background Glowing Orbs */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.25, 0.4, 0.25],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-amber-200/40 dark:bg-amber-500/10 blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.1, 1, 1.1],
            opacity: [0.2, 0.35, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-emerald-200/40 dark:bg-emerald-500/10 blur-3xl"
        />
      </div>

      <div className="relative z-10 w-full max-w-lg flex flex-col items-center gap-8 text-center">
        {/* Animated Soothing Bee Illustration */}
        <motion.div
          animate={{
            y: [-8, 8, -8],
            x: [-6, 6, -6],
            rotate: [-3, 3, -3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="relative w-36 h-36 flex items-center justify-center"
        >
          {/* Gentle Flight Path Glow */}
          <div className="absolute inset-0 rounded-full bg-amber-300/30 dark:bg-amber-500/20 blur-xl animate-pulse" />
          
          <svg
            className="w-28 h-28 drop-shadow-md"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Left Wing */}
            <motion.ellipse
              cx="40"
              cy="32"
              rx="14"
              ry="22"
              transform="rotate(-25 40 32)"
              className="fill-sky-200/80 dark:fill-sky-400/50 stroke-sky-300 dark:stroke-sky-500"
              strokeWidth="2"
              animate={{ rotate: [-30, -18, -30] }}
              transition={{ duration: 0.18, repeat: Infinity }}
            />
            {/* Right Wing */}
            <motion.ellipse
              cx="60"
              cy="32"
              rx="14"
              ry="22"
              transform="rotate(25 60 32)"
              className="fill-sky-200/80 dark:fill-sky-400/50 stroke-sky-300 dark:stroke-sky-500"
              strokeWidth="2"
              animate={{ rotate: [30, 18, 30] }}
              transition={{ duration: 0.18, repeat: Infinity }}
            />
            {/* Bee Body */}
            <ellipse cx="50" cy="58" rx="22" ry="26" className="fill-amber-400 dark:fill-amber-500" />
            {/* Black Stripes */}
            <path d="M32 50 C44 54 56 54 68 50" stroke="#1e293b" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M30 60 C44 64 56 64 70 60" stroke="#1e293b" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M34 70 C44 74 56 74 66 70" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" />
            {/* Friendly Smiling Eyes */}
            <circle cx="43" cy="44" r="3" fill="#1e293b" />
            <circle cx="57" cy="44" r="3" fill="#1e293b" />
            {/* Cheerful Smile */}
            <path d="M46 49 Q50 53 54 49" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            {/* Rosy Cheeks */}
            <circle cx="39" cy="48" r="2.5" className="fill-rose-300/80" />
            <circle cx="61" cy="48" r="2.5" className="fill-rose-300/80" />
          </svg>
        </motion.div>

        {/* Message Container */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-col gap-3"
        >
          <h2 className="font-display font-black text-2xl md:text-3xl text-slate-800 dark:text-slate-100">
            עבודה נפלאה! 🐝
          </h2>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-300 font-medium leading-relaxed max-w-md">
            המורים בודקים את עבודתכם בנחת, מיד נמשיך יחד במסע!
          </p>
        </motion.div>

        {/* Peaceful Progress Dots (No Stress, Pure Rhythm) */}
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 1.6,
                repeat: Infinity,
                delay: i * 0.3,
                ease: "easeInOut",
              }}
              className="w-3 h-3 rounded-full bg-amber-400 dark:bg-amber-500"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
