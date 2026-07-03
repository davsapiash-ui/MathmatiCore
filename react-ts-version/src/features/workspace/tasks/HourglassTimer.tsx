import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HourglassTimerProps {
  initialMinutes?: number;
  onExpire?: () => void;
}

export function HourglassTimer({ initialMinutes = 3, onExpire }: HourglassTimerProps) {
  const [totalSeconds, setTotalSeconds] = useState(initialMinutes * 60);
  const [timeLeft, setTimeLeft] = useState(initialMinutes * 60);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) {
      if (!isExpired) {
        setIsExpired(true);
        onExpire?.();
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isExpired, onExpire]);

  const addMinute = () => {
    setTotalSeconds((prev) => prev + 60);
    setTimeLeft((prev) => prev + 60);
    if (isExpired) setIsExpired(false);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const ratio = Math.max(0, Math.min(1, timeLeft / totalSeconds));
  
  // Height calculations for sand (0% to 100%)
  const topSandHeight = `${ratio * 100}%`;
  const bottomSandHeight = `${(1 - ratio) * 100}%`;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-ws-surface2/30 rounded-3xl border border-ws-blue/10 max-w-sm mx-auto shadow-sm">
      <h3 className="text-xl font-bold text-ws-blue mb-4">זמן לחקור את המעבדה!</h3>
      
      {/* Hourglass Container */}
      <div className="relative w-32 h-48 mb-6 flex flex-col items-center justify-center">
        {/* Frame */}
        <div className="absolute inset-0 z-10 pointer-events-none">
           <svg viewBox="0 0 100 150" fill="none" className="w-full h-full drop-shadow-xl">
             {/* Top Lid */}
             <rect x="20" y="5" width="60" height="8" rx="4" fill="#334155" />
             {/* Bottom Lid */}
             <rect x="20" y="137" width="60" height="8" rx="4" fill="#334155" />
             {/* Glass Outline */}
             <path d="M 25,13 L 25,40 C 25,60 40,65 45,75 C 50,85 50,85 55,75 C 60,65 75,60 75,40 L 75,13" stroke="#cbd5e1" strokeWidth="3" fill="rgba(255,255,255,0.2)" strokeLinejoin="round" />
             <path d="M 25,137 L 25,110 C 25,90 40,85 45,75 C 50,65 50,65 55,75 C 60,85 75,90 75,110 L 75,137" stroke="#cbd5e1" strokeWidth="3" fill="rgba(255,255,255,0.2)" strokeLinejoin="round" />
           </svg>
        </div>

        {/* Top Sand (Masked to the glass shape) */}
        <div className="absolute top-[13px] w-[50px] h-[62px] overflow-hidden" style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 45%, 70% 100%, 30% 100%, 0% 45%)' }}>
          <motion.div 
            className="absolute bottom-0 w-full bg-amber-400"
            initial={false}
            animate={{ height: topSandHeight }}
            transition={{ type: 'tween', duration: 1, ease: 'linear' }}
          />
        </div>

        {/* Bottom Sand (Masked to the glass shape) */}
        <div className="absolute bottom-[13px] w-[50px] h-[62px] overflow-hidden flex flex-col justify-end" style={{ clipPath: 'polygon(30% 0%, 70% 0%, 100% 55%, 100% 100%, 0% 100%, 0% 55%)' }}>
          <motion.div 
            className="w-full bg-amber-400"
            initial={false}
            animate={{ height: bottomSandHeight }}
            transition={{ type: 'tween', duration: 1, ease: 'linear' }}
          />
        </div>

        {/* Falling Sand Stream (Only if time left > 0) */}
        <AnimatePresence>
          {timeLeft > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute w-[3px] bg-amber-300 top-[75px] h-[35px] left-1/2 -translate-x-1/2 rounded-full"
            >
              <motion.div
                className="w-full h-full bg-amber-200 opacity-50"
                animate={{ y: [0, 10, 0] }}
                transition={{ repeat: Infinity, duration: 0.3 }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="text-4xl font-display font-black text-ws-ink mb-6 tabular-nums tracking-wider" dir="ltr">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>

      <button
        onClick={addMinute}
        className="px-6 py-2 bg-white hover:bg-amber-50 text-amber-600 font-bold rounded-full shadow-sm border border-amber-200 transition-all active:scale-95 flex items-center gap-2 group"
      >
        <span className="text-xl group-hover:rotate-180 transition-transform duration-500">⏳</span>
        הוסף דקה
      </button>

    </div>
  );
}
