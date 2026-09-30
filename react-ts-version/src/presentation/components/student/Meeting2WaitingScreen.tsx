import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { normalizeStudentId } from '@/application/useChatStore';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

const MEETING2_WAITING_MESSAGE_HE = 'כל הכבוד, מתמטיקאים! סיימתם את התחנה השנייה. המורה בודקת את העבודה שלכם. כשהמורה תסיים לבדוק, נמשיך.';

interface Meeting2WaitingScreenProps {
  onApproved?: () => void;
}

/**
 * מסך ההמתנה בסיום מפגש 2, עד שהמורה מאשרת את המסלול (מודול 20).
 * מסך נקי, סולידי ומכבד. מאזין בזמן אמת לשדה teacher_gate_approved.
 * בלי דבורה: בעל המוצר, 29.9.2026 — "אני לא רוצה שתהיה שום דבורה באייקונים".
 */
export function Meeting2WaitingScreen({ onApproved }: Meeting2WaitingScreenProps) {
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
        console.warn('[Meeting2WaitingScreen] listener notice:', err);
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
        {/* PRD Module 20 §ב gives the message; the words on screen are
            reworded under the owner's delegation of on-screen wording
            (28.9.2026; register deviation 25, not a line-by-line approval):
            the teacher is feminine as on every other screen of the child, the
            address has its comma, and nothing promises an immediate
            continuation — the wait can last until the next lesson. */}
        <p className="text-base text-slate-700 dark:text-slate-200 font-semibold leading-relaxed">
          {MEETING2_WAITING_MESSAGE_HE}
        </p>
        <UdlSpeechButton text={MEETING2_WAITING_MESSAGE_HE} />
      </div>
    </div>
  );
}

export default Meeting2WaitingScreen;
