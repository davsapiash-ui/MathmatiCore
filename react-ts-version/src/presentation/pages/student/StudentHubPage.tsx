import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useActiveClassSession } from '@/application/useActiveClassSession';
import { normalizeStudentId } from '@/application/useChatStore';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '@/infrastructure/firebase';
import { Play, Sparkles } from 'lucide-react';
import { BeeFlightWaitingScreen } from '@/presentation/components/student/BeeFlightWaitingScreen';
import type { SessionDocument } from '@/types';

interface ActiveSessionConfig {
  id: number;
  title: string;
  desc: string;
  icon: string;
}

const SESSIONS_CONFIG: Record<number, ActiveSessionConfig> = {
  1: {
    id: 1,
    title: 'תחנה אחת הכרות עם המערכת',
    desc: 'היכרות עם כלי המעבדה השונים במרחב החקר הווירטואלי.',
    icon: '🧪',
  },
  2: {
    id: 2,
    title: 'תחנה שתיים יוצאים למסע',
    desc: 'משימות חקר כדי שהמערכת תלמד את סגנון החשיבה הייחודי שלך.',
    icon: '📡',
  },
  3: {
    id: 3,
    title: 'תחנה שלוש מחקר אישי',
    desc: 'משימות מחקר שמותאמות בדיוק עבורך.',
    icon: '🔬',
  },
  4: {
    id: 4,
    title: 'תחנה ארבע פריטה וקיבוץ',
    desc: 'ניסויי פריטה וקיבוץ במבנה העשרוני.',
    icon: '🔍',
  },
  5: {
    id: 5,
    title: 'תחנה חמש תכנון ניסויים',
    desc: 'ממשיכים לתכנון ניסויים ולגלות שיטות חשיבה חדשות.',
    icon: '💡',
  },
  6: {
    id: 6,
    title: 'תחנה שש מחקר מתקדם',
    desc: 'אתגרים מחשבתיים שמותאמים לקצב הגילוי שלך.',
    icon: '🧬',
  },
  7: {
    id: 7,
    title: 'תחנה שבע אתגרי חיבור וחיסור',
    desc: 'חיזוק מיומנויות חקר מתקדמות במבנה המספר.',
    icon: '🚀',
  },
  8: {
    id: 8,
    title: 'תחנה שמונה סיכום ותגליות',
    desc: 'מסכמים את המחקר ורואים אילו תגליות גילינו!',
    icon: '🏆',
  },
};

/**
 * StudentHubPage (Module 6: Student Lobby & Module 20: Firestore Session Gate)
 * Listens strictly to Cloud Firestore canonical SessionDocument (teacher_gate_approved, is_completed, session_number).
 */
export function StudentHubPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const startSession = useWorkspaceStore((s) => s.startSession);

  const uid = user?.uid || '';
  const rawNum = typeof user?.student_id === 'number' ? user.student_id : (uid.match(/\d+/)?.[0] || '1');
  const studentNum = parseInt(String(rawNum), 10) || 1;

  const [activeSessionId, setActiveSessionId] = useState<number>(1);
  const [isSession2Completed, setIsSession2Completed] = useState<boolean>(false);
  const [isTeacherGateApproved, setIsTeacherGateApproved] = useState<boolean>(false);

  // Realtime Active Class Broadcast from Teacher (RTDB)
  const activeClassSession = useActiveClassSession();
  const teacherSessionNum = activeClassSession?.active ? Number(activeClassSession.sessionNumber) || 1 : null;

  useEffect(() => {
    if (!uid) return;

    // Module 20 Canonical Gate: Firestore SessionDocument for Session 2
    const session2DocId = `session_02_student_${studentNum}`;
    const sessionDocRef = doc(firestore, 'sessions', session2DocId);

    const unsubFirestore = onSnapshot(sessionDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as SessionDocument;
        const completed = data.is_completed === true;
        const approved = data.teacher_gate_approved === true;

        setIsSession2Completed(completed);
        setIsTeacherGateApproved(approved);

        if (completed && approved) {
          setActiveSessionId((prev) => Math.max(prev, 3));
        } else if (completed && !approved) {
          setActiveSessionId(3); // Attempting Session 3 triggers gate
        }
      }
    }, (error) => {
      console.warn('Firestore session doc subscription notice:', error);
    });

    return () => {
      unsubFirestore();
    };
  }, [uid, studentNum]);

  // Priority to teacher's live broadcast session if active
  const effectiveSessionId = teacherSessionNum 
    ? Math.min(Math.max(1, teacherSessionNum), 8)
    : Math.min(Math.max(1, activeSessionId), 8);

  const activeSession = SESSIONS_CONFIG[effectiveSessionId] || SESSIONS_CONFIG[1];

  // Module 20 Gate Rule:
  // session_number == 2 && is_completed == true && teacher_gate_approved == false
  const isAwaitingTeacherGate = isSession2Completed && !isTeacherGateApproved && effectiveSessionId === 3;

  if (isAwaitingTeacherGate) {
    return <BeeFlightWaitingScreen onApproved={() => setIsTeacherGateApproved(true)} />;
  }

  const handleStartActiveSession = () => {
    startSession(activeSession.id);
    navigate('/workspace');
  };

  return (
    <div
      dir="rtl"
      className="relative min-h-[calc(100vh-72px)] flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 font-body text-slate-900 dark:text-slate-100 select-none overflow-hidden"
    >
      {/* Background Soft Ambient Elements */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: 'hsl(var(--ws-blue))' }}
        />
        <div
          className="absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: 'hsl(var(--ws-gold))' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-xl flex flex-col items-center gap-8 text-center">
        {/* Header Badge */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-extrabold bg-[hsl(var(--ws-blue-soft))] text-[hsl(var(--ws-blue))] shadow-sm"
        >
          <Sparkles className="w-4 h-4" />
          <span>מרחב הלמידה האישי שלך</span>
        </motion.div>

        {/* SINGLE Dynamic Active Session Card (Master PRD Module 6) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[480px] bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-[hsl(var(--ws-blue))] rounded-3xl p-8 shadow-xl shadow-slate-200/50 dark:shadow-none flex flex-col items-center gap-6 transition-all"
        >
          <div className="w-20 h-20 rounded-3xl bg-[hsl(var(--ws-blue-soft))] text-[hsl(var(--ws-blue))] flex items-center justify-center text-4xl shadow-inner">
            <span aria-hidden="true">{activeSession.icon}</span>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white">
              {activeSession.title}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm">
              {activeSession.desc}
            </p>
          </div>

          <button
            onClick={handleStartActiveSession}
            className="w-full h-14 min-h-[48px] bg-[hsl(var(--ws-blue))] hover:bg-[hsl(var(--ws-blue))/0.9] text-white rounded-2xl font-display font-extrabold text-lg flex items-center justify-center gap-3 shadow-lg shadow-[hsl(var(--ws-blue)/0.25)] active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>התחל פעילות</span>
            <Play className="w-5 h-5 fill-current" />
          </button>
        </motion.div>
      </div>
    </div>
  );
}

export default StudentHubPage;
