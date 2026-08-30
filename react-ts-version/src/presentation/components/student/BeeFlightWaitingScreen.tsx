import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { normalizeStudentId } from '@/application/useChatStore';

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
    const unsub = onValue(
      studentRef,
      (snap) => {
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
      },
      (err) => {
        console.warn('[BeeFlightWaitingScreen] listener notice:', err);
      }
    );
    return () => unsub();
  }, [studentId, onApproved]);

  return (
    <div
      dir="rtl"
      className="relative min-h-[calc(100vh-72px)] flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 font-body text-slate-900 dark:text-slate-100 select-none overflow-hidden"
    >
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center gap-6 text-center">
        {/* §ב specifies this message verbatim. */}
        <p className="text-base text-slate-700 dark:text-slate-200 font-semibold leading-relaxed">
          כל הכבוד מתמטיקאים! סיימתם את התחנה השנייה בהצלחה. המורה בודק את העבודה שלכם כעת, ומיד נמשיך במסע המשותף שלנו.
        </p>
      </div>
    </div>
  );
}

export default BeeFlightWaitingScreen;
