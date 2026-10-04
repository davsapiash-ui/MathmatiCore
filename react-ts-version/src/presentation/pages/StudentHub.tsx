import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore, stampStudentWindowClosed, touchStudentActivity, currentStudentUid } from '@/application/useAuthStore';
import { useActiveClassSession } from '@/application/useActiveClassSession';
import { ref, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { acknowledgeTeacherReset } from '@/infrastructure/services/FirebaseSyncService';
import { throttledRtdbUpdate, rtdbUpdateNow } from '@/infrastructure/services/ThrottledRtdbWriter';
import { Sparkles } from 'lucide-react';
import { Meeting2WaitingScreen } from '@/presentation/components/student/Meeting2WaitingScreen';
import { UdlSpeechButton } from "@/presentation/design-system/UdlSpeechButton";
import { ProjectorWaitingScreen } from '@/presentation/components/student/ProjectorWaitingScreen';
import { useProjectorMode } from '@/application/useProjectorMode';
import { useTeacherGender } from '@/application/useTeacherGender';
import { stationTitleHe } from '@/core/stationNames';
import { teacherSentenceHe } from '@/core/teacherGender';

interface ActiveSessionConfig {
  id: number;
  title: string;
  desc: string;
  icon: string;
}

/**
 * The name of each meeting on the lobby card — the headings of מסמך 02 ("הגדרת
 * רצף המפגשים") and מסמך 03 §3.1–3.8, in words a third-grader reads, as the
 * register decided (תיקונים נדרשים במסמכי האפיון, row 4): 3 place value, built
 * and taken apart up to a thousand and ten thousand; 4 addition WITH grouping;
 * 5 SUBTRACTION with decomposition; 6 the zero challenge; 7 inquiry problems;
 * 8 the researcher meeting, blocks removed entirely. The earlier names
 * ("מחקר אישי", "פריטה וקיבוץ", "תכנון ניסויים"…) described no meeting — the
 * subtraction meeting was called "תכנון ניסויים". Descriptions say what the
 * children do, second person plural where there is a sentence; meetings 1, 2
 * and 8 reuse the on-screen wording of מסמך 03.
 */
const SESSIONS_CONFIG: Record<number, ActiveSessionConfig> = {
  // שמות התחנות בשפה של הילד: פעולה בכותרת, הוראה בגוף שני רבים מתחת,
  // בלי מונחים של אנשי חינוך (אבחון, הערכה, רפלקציה). בעל המוצר, 27.9.2026.
  // השם עצמו נקרא מ-core/stationNames: אותו מקור שממנו המורה רואה אותו.
  1: {
    id: 1,
    // מסמך 04 §1: "ארגז החול" for the first meeting; מסמך 03 §3.1 step 1.
    title: stationTitleHe(1),
    desc: 'שחקו עם הלבנים ועם בית המספרים, והכירו את הכלים. בתחנה הזאת אין ציון.',
    icon: '🧱',
  },
  2: {
    id: 2,
    // מסמך 03 §3.2: "התחילו בתחנה שתיים יוצאים למסע. אין לחץ. עבדו בקצב שלכם."
    // and "הפעם פתרו לבד, ללא עזרים."
    title: stationTitleHe(2),
    desc: 'הפעם פתרו לבד. אין לחץ, עבדו בקצב שלכם.',
    icon: '📡',
  },
  3: {
    id: 3,
    // מסמכים 02/03: "ערך המקום וגמישות ייצוגית (פירוק והרכבה)".
    title: stationTitleHe(3),
    desc: 'פרטו לבנת מאה אחת לעשר לבני עשרת. בדקו איזה מספר מייצגות הלבנים לאחר הפריטה.',
    icon: '🔬',
  },
  4: {
    id: 4,
    // מסמכים 02/03: "אלגוריתם החיבור במאונך והמרה פשוטה (הקבצה)".
    title: stationTitleHe(4),
    desc: 'כשמצטברות בטור עשר לבנים, קבצו אותן ללבנה אחת בטור שמשמאלו.',
    icon: '🔍',
  },
  5: {
    id: 5,
    // מסמכים 02/03: "אלגוריתם החיסור במאונך והמרה פשוטה (פריטה)".
    title: stationTitleHe(5),
    desc: 'כשאין בטור מספיק לבנים, פרטו לבנה אחת מהטור שמשמאלו.',
    icon: '💡',
  },
  6: {
    id: 6,
    // מסמכים 02/03: "אתגר האפס כשומר מקום ומעבר מעל אפסים (המרה כפולה)".
    title: stationTitleHe(6),
    desc: 'גלו מה עושים כשצריך לפרוט לבנה מטור שיש בו אפס.',
    icon: '🧬',
  },
  7: {
    id: 7,
    // מסמכים 02/03: "פתרון בעיות חקר ואינטגרציה של פעולות החשבון".
    title: stationTitleHe(7),
    desc: 'מצאו ספרות חסרות, וגלו איפה התחבאה הטעות.',
    icon: '🚀',
  },
  8: {
    id: 8,
    // מסמכים 02/03: "מפגש חוקר (הערכה ורפלקציה מסכמת)"; §3.8 on screen:
    // "פתרו את התרגילים בנחת ובקצב שלכם". The blocks and the board are gone.
    title: stationTitleHe(8),
    desc: 'הפעם פתרו בלי לבנים. בסוף סמנו מה עזר לכם.',
    icon: '🏆',
  },
};

export function StudentHub() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const uid = user?.uid || '';
  // The learner's own record, users/students/student_user{N} (1–12), or ''.
  // A teacher may open /hub too (App.tsx), and normalizeStudentId kept her
  // 'teacher_…' id as it is: the presence below then wrote a thirteenth
  // "learner" under users/students, which travelled into the research backups
  // (Module 3: zero-PII, learners 1–12 only) — the write unifiedLogout already
  // stopped. With no learner number nothing below reads or writes a record.
  const normUid = currentStudentUid();

  const [activeSessionId, setActiveSessionId] = useState<number>(1);
  const [, setLiveRouteStatus] = useState<string | null>(null);
  const [isTeacherGateApproved, setIsTeacherGateApproved] = useState<boolean>(false);
  const [hasCompletedSession2, setHasCompletedSession2] = useState<boolean>(false);

  // Realtime Active Class Session from Teacher
  const activeClassSession = useActiveClassSession();
  // Module 15: real-time projector broadcast reaches the lobby too
  const isProjectorModeActive = useProjectorMode();
  // The teacher's choice for every sentence about the teacher (core/teacherGender.ts).
  const teacherGender = useTeacherGender();
  const willOpenActivity = teacherSentenceHe('willOpenActivity', teacherGender);
  const pausedTitle = teacherSentenceHe('pausedTitle', teacherGender);
  const isTeacherSessionActive = Boolean(activeClassSession && activeClassSession.active);
  const teacherSessionNum = isTeacherSessionActive ? Number(activeClassSession?.sessionNumber) || 1 : null;

  useEffect(() => {
    if (!uid || !normUid) return;
    const studentRef = ref(database, `users/students/${normUid}`);
    const unsub = onValue(
      studentRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          if (val?.forceReload === true) {
            acknowledgeTeacherReset(normUid, uid, true, val);
            setHasCompletedSession2(false);
            setIsTeacherGateApproved(false);
            setLiveRouteStatus(null);
            setActiveSessionId(teacherSessionNum || 1);
            return;
          }

          setLiveRouteStatus(val.routeStatus || null);
          const approved = val.teacher_gate_approved === true || val.routeStatus === 'APPROVED';
          setIsTeacherGateApproved(approved);

          const highest = typeof val.highestCompletedMeeting === 'number' ? val.highestCompletedMeeting : 0;

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

  // Maintain live presence heartbeat while in Student Hub / Lobby
  useEffect(() => {
    if (!normUid) return;
    // Every write to the learner record goes through its one throttled writer
    // (PRD 18: at most once per 1000 ms); leaving is sent at once.
    const presencePath = `users/students/${normUid}`;

    throttledRtdbUpdate(presencePath, {
      isOnline: true,
      onlineStatus: 'active',
      lastPing: serverTimestamp(),
      lastActivityTimestamp: Date.now(),
      hasJoinedSession: true,
      lastAction: 'בלובי / ממתין לשיעור',
    }).catch(() => {});

    try {
      onDisconnect(ref(database, `users/students/${normUid}/isOnline`)).set(false);
      onDisconnect(ref(database, `users/students/${normUid}/onlineStatus`)).set('offline');
      onDisconnect(ref(database, `users/students/${normUid}/lastPing`)).set(0);
      onDisconnect(ref(database, `users/students/${normUid}/lastAction`)).set('לא מחובר');
    } catch {}

    const handleDisconnect = () => {
      stampStudentWindowClosed();
      rtdbUpdateNow(presencePath, {
        isOnline: false,
        onlineStatus: 'offline',
        lastPing: 0,
        lastAction: 'לא מחובר',
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleDisconnect);
    window.addEventListener('pagehide', handleDisconnect);

    const interval = setInterval(() => {
      touchStudentActivity();
      throttledRtdbUpdate(presencePath, {
        isOnline: true,
        onlineStatus: 'active',
        lastPing: serverTimestamp(),
        lastActivityTimestamp: Date.now(),
      }).catch(() => {});
    }, 4000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleDisconnect);
      window.removeEventListener('pagehide', handleDisconnect);
      handleDisconnect();
    };
  }, [normUid]);

  // Compute the single active session to render - teacher broadcast takes direct reactive precedence
  const effectiveSessionId = teacherSessionNum
    ? Math.min(Math.max(1, teacherSessionNum), 8)
    : Math.min(Math.max(1, activeSessionId), 8);

  const activeSession = SESSIONS_CONFIG[effectiveSessionId] || SESSIONS_CONFIG[1];

  // Module 20: If student completed Session 2 and attempts Session 3 without teacher approval -> the meeting-2 waiting screen
  const isAwaitingTeacherGate = hasCompletedSession2 && effectiveSessionId === 3 && !isTeacherGateApproved;

  // Deviation 10: When teacher opens/starts session, auto-navigate waiting student into workspace
  useEffect(() => {
    if (isTeacherSessionActive && teacherSessionNum && activeClassSession?.status === 'active' && !isAwaitingTeacherGate && !isProjectorModeActive) {
      navigate(`/workspace?meeting=${teacherSessionNum}`, { replace: true });
    }
  }, [isTeacherSessionActive, teacherSessionNum, activeClassSession?.status, isAwaitingTeacherGate, isProjectorModeActive, navigate]);

  // Module 15: projector broadcast covers every student surface, the lobby included
  if (isProjectorModeActive) {
    return <ProjectorWaitingScreen />;
  }

  if (isAwaitingTeacherGate) {
    return <Meeting2WaitingScreen inAppShell onApproved={() => setIsTeacherGateApproved(true)} />;
  }

  return (
    <div
      dir="rtl"
      className="relative min-h-full flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 font-body text-slate-900 dark:text-slate-100 select-none overflow-hidden"
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
          <span>מרחב הלמידה האישי שלכם</span>
        </motion.div>

        {/* Dynamic Class Session State: Gated strictly by Teacher's Broadcast */}
        {!activeClassSession.isLoaded ? (
          <div className="w-full max-w-[480px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-slate-500">מתחברים לכיתה...</p>
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

            <div className="flex flex-col gap-2 items-center">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white">
                  היום עוד לא התחלנו
                </h2>
                {/* Module 7 (UDL): every on-screen instruction carries its own read-aloud
                    button, triggered only by the learner. The lobby was the one waiting
                    screen without it. */}
                <UdlSpeechButton text={`היום עוד לא התחלנו. ${willOpenActivity}`} className="shrink-0" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm">
                {willOpenActivity}
              </p>
            </div>

            {/* PRD Module 14 §ב0 gives this screen's exact text, above, and
                nothing else. A second line here said the same in the masculine
                singular, with an abbreviation and a third name for the meeting
                ("השיעור"), and the read-aloud button skipped it (audit ע0.1,
                28.9.2026). */}
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

            <div className="flex flex-col gap-2 items-center">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white">
                  {activeSession.title}
                </h2>
                <UdlSpeechButton text={`${activeSession.title}. ${activeSession.desc}`} className="shrink-0" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm">
                {activeSession.desc}
              </p>
            </div>

            {/* The card carries no entry button. A running meeting moves the
                learner in by itself (the effect above; register, "תיקונים נדרשים"
                rows 14 and 17), and it does so in every state in which a button could
                have shown: the only other live state is the pause, below. The
                button only flashed for the frame before that navigation.
                PRD Module 6 / 14 §ב0: no navigation control in the lobby. */}
            {activeClassSession.status === 'paused' && (
              <div className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-extrabold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                <span aria-hidden="true">⏸️</span>
                <span>{pausedTitle}. חכו…</span>
                <UdlSpeechButton text={`${pausedTitle}. חכו.`} className="shrink-0" />
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

