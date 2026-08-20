import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useActiveClassSession } from '@/application/useActiveClassSession';
import { normalizeStudentId } from '@/application/useChatStore';
import { ref, onValue } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { Play, Sparkles } from 'lucide-react';
import { BeeFlightWaitingScreen } from '@/presentation/components/student/BeeFlightWaitingScreen';
import { ProjectorWaitingScreen } from '@/presentation/components/student/ProjectorWaitingScreen';

interface ActiveSessionConfig {
  id: number;
  title: string;
  desc: string;
  icon: string;
}

const SESSIONS_CONFIG: Record<number, ActiveSessionConfig> = {
  1: {
    id: 1,
    title: 'תחנה 1: היכרות עם המערכת',
    desc: 'היכרות עם כלי המעבדה השונים במרחב החקר הווירטואלי.',
    icon: '🧪',
  },
  2: {
    id: 2,
    title: 'תחנה 2: יוצאים למסע',
    desc: 'משימות חקר כדי שהמערכת תלמד את סגנון החשיבה הייחודי שלך.',
    icon: '📡',
  },
  3: {
    id: 3,
    title: 'תחנה 3: מחקר אישי',
    desc: 'משימות מחקר שמותאמות בדיוק עבורך.',
    icon: '🔬',
  },
  4: {
    id: 4,
    title: 'תחנה 4: פריטה וקיבוץ',
    desc: 'ניסויי פריטה וקיבוץ במבנה העשרוני.',
    icon: '🔍',
  },
  5: {
    id: 5,
    title: 'תחנה 5: תכנון ניסויים',
    desc: 'ממשיכים לתכנון ניסויים ולגלות שיטות חשיבה חדשות.',
    icon: '💡',
  },
  6: {
    id: 6,
    title: 'תחנה 6: מחקר מתקדם',
    desc: 'אתגרים מחשבתיים שמותאמים לקצב הגילוי שלך.',
    icon: '🧬',
  },
  7: {
    id: 7,
    title: 'תחנה 7: אתגרי חיבור וחיסור',
    desc: 'חיזוק מיומנויות חקר מתקדמות במבנה המספר.',
    icon: '🚀',
  },
  8: {
    id: 8,
    title: 'תחנה 8: סיכום ותובנות',
    desc: 'מסכמים את המחקר ובודקים מה גילינו בדרך!',
    icon: '🏆',
  },
};

export function StudentHub() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const students = useStore((s) => s.students);
  const startSession = useWorkspaceStore((s) => s.startSession);

  const uid = user?.uid || '';
  const normUid = normalizeStudentId(uid);
  const currentStudent = uid ? students[uid] || students[normUid] : null;

  const [activeSessionId, setActiveSessionId] = useState<number>(1);
  const [highestCompletedMeeting, setHighestCompletedMeeting] = useState<number>(0);
  const [liveRouteStatus, setLiveRouteStatus] = useState<string | null>(null);
  const [isTeacherGateApproved, setIsTeacherGateApproved] = useState<boolean>(false);
  const [hasCompletedSession2, setHasCompletedSession2] = useState<boolean>(false);

  // Realtime Active Class Session from Teacher
  const activeClassSession = useActiveClassSession();
  const isTeacherSessionActive = Boolean(activeClassSession && activeClassSession.active);
  const teacherSessionNum = isTeacherSessionActive ? Number(activeClassSession?.sessionNumber) || 1 : null;

  useEffect(() => {
    if (!uid) return;
    const studentRef = ref(database, `users/students/${normUid}`);
    const unsub = onValue(
      studentRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          setLiveRouteStatus(val.routeStatus || null);
          const approved = val.teacher_gate_approved === true || val.routeStatus === 'APPROVED';
          setIsTeacherGateApproved(approved);

          const highest = typeof val.highestCompletedMeeting === 'number' ? val.highestCompletedMeeting : 0;
          setHighestCompletedMeeting(highest);

          const completedM2 = Boolean(
            val.completedMeeting2 ||
            val.session_completed === 2 ||
            highest >= 2 ||
            val.routeStatus === 'PENDING_TEACHER_APPROVAL'
          );
          setHasCompletedSession2(completedM2);

          // Determine active session ID strictly: Teacher's live broadcast takes absolute precedence
          const resolvedSession = teacherSessionNum || 1;
          setActiveSessionId(resolvedSession);
        }
      },
      (err) => {
        console.warn('[StudentHub] student listener notice:', err);
      }
    );
    return () => unsub();
  }, [uid, normUid, teacherSessionNum]);

  // Compute the single active session to render - teacher broadcast takes direct reactive precedence
  const effectiveSessionId = teacherSessionNum
    ? Math.min(Math.max(1, teacherSessionNum), 8)
    : Math.min(Math.max(1, activeSessionId), 8);

  const activeSession = SESSIONS_CONFIG[effectiveSessionId] || SESSIONS_CONFIG[1];

  // If student completed current teacher broadcasted session -> Locked waiting state
  const isCurrentSessionFinished = Boolean(
    isTeacherSessionActive && teacherSessionNum && highestCompletedMeeting >= teacherSessionNum
  );

  // Module 20: If student completed Session 2 and attempts Session 3 without teacher approval -> Bee Flight
  const isAwaitingTeacherGate = hasCompletedSession2 && effectiveSessionId === 3 && !isTeacherGateApproved;

  if (isAwaitingTeacherGate) {
    return <BeeFlightWaitingScreen onApproved={() => setIsTeacherGateApproved(true)} />;
  }

  const handleStartActiveSession = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!isTeacherSessionActive || isCurrentSessionFinished) return;

    const targetSessionId = activeSession?.id || 1;
    try {
      startSession(targetSessionId);
    } catch (err) {
      console.warn('[StudentHub] startSession non-blocking error:', err);
    }
    try {
      navigate(`/workspace?meeting=${targetSessionId}`);
    } catch (navErr) {
      console.warn('[StudentHub] navigate fallback:', navErr);
      window.location.href = `/workspace?meeting=${targetSessionId}`;
    }
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

        {/* Dynamic Class Session State: Gated strictly by Teacher's Broadcast */}
        {!activeClassSession.isLoaded ? (
          <div className="w-full max-w-[480px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-slate-500">מתחבר למפגש הכיתתי...</p>
          </div>
        ) : !isTeacherSessionActive ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[480px] bg-white dark:bg-slate-900 border-2 border-dashed border-amber-300 dark:border-amber-700/60 rounded-3xl p-8 shadow-xl shadow-slate-200/50 dark:shadow-none flex flex-col items-center gap-6"
          >
            <div className="w-20 h-20 rounded-3xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center text-4xl shadow-inner animate-pulse">
              <span aria-hidden="true">⏳</span>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white">
                המפגש טרם נפתח על ידי המורה
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm">
                השיעור יתחיל ברגע שהמורה יפעיל את המפגש בדשבורד הכיתתי. המערכת תיפתח כאן אוטומטית!
              </p>
            </div>

            <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-xs font-extrabold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>ממתין לפתיחת השיעור ע״י המורה...</span>
            </div>
          </motion.div>
        ) : isCurrentSessionFinished ? (
          /* Student completed current active meeting -> Waiting for teacher to broadcast next meeting */
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[480px] bg-white dark:bg-slate-900 border-2 border-emerald-300 dark:border-emerald-700/60 rounded-3xl p-8 shadow-xl shadow-slate-200/50 dark:shadow-none flex flex-col items-center gap-6"
          >
            <div className="w-20 h-20 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center text-4xl shadow-inner animate-bounce">
              <span aria-hidden="true">🎉</span>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white">
                סיימת בהצלחה את {activeSession.title}!
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm">
                כל הכבוד! סיימת את משימות התחנה בהצלחה. כעת ממתינים לפתיחת התחנה הבאה על ידי המורה בדשבורד הכיתתי.
              </p>
            </div>

            <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-xs font-extrabold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>ממתין להפעלת התחנה הבאה ע״י המורה ⏳</span>
            </div>
          </motion.div>
        ) : (
          /* SINGLE Dynamic Active Session Card */
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
              className="w-full h-14 min-h-[48px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl font-display font-extrabold text-lg flex items-center justify-center gap-3 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-[0.98] transition-all cursor-pointer"
            >
              <span>התחל פעילות</span>
              <Play className="w-5 h-5 fill-current" />
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

