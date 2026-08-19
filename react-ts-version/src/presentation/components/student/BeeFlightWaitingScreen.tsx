import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ref, onValue } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { normalizeStudentId } from '@/application/useChatStore';
import { ShieldCheck, Clock } from 'lucide-react';

interface BeeFlightWaitingScreenProps {
  onApproved?: () => void;
}

/**
 * מסך המתנה לאישור שער פדגוגי (Teacher Approval Gate Waiting Screen)
 * מסך נקי, סולידי ומכבד. מאזין בזמן אמת לשדה teacher_gate_approved.
 */
export function BeeFlightWaitingScreen({ onApproved }: BeeFlightWaitingScreenProps) {
  const user = useAuthStore((s) => s.user);
  const rawUid = user?.uid || '';
  const studentId = normalizeStudentId(rawUid);
  const [_isApproved, setIsApproved] = useState(false);

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
      className="relative min-h-[calc(100vh-72px)] flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 font-body text-slate-900 dark:text-slate-100 select-none overflow-hidden"
    >
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center gap-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
          <ShieldCheck className="w-8 h-8" />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="font-display font-black text-2xl text-slate-900 dark:text-slate-100">
            ממתין לאישור המורה
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
            סיימת את חלק האבחון בהצלחה. המורה בודק/ת ומאשר/ת כעת את מסלול ההמשך שלך.
          </p>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800/60 rounded-full text-xs font-bold text-slate-500">
          <Clock className="w-4 h-4 animate-spin text-indigo-500" />
          <span>הפעילות תיפתח אוטומטית בעת קבלת האישור</span>
        </div>
      </div>
    </div>
  );
}

export default BeeFlightWaitingScreen;
