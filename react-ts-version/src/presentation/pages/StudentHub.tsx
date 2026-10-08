import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, stampStudentWindowClosed, touchStudentActivity, currentStudentUid } from '@/application/useAuthStore';
import { useActiveClassSession } from '@/application/useActiveClassSession';
import { ref, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { acknowledgeTeacherReset } from '@/infrastructure/services/FirebaseSyncService';
import { throttledRtdbUpdate, rtdbUpdateNow } from '@/infrastructure/services/ThrottledRtdbWriter';
import { Meeting2WaitingScreen } from '@/presentation/components/student/Meeting2WaitingScreen';
import { UdlSpeechButton } from "@/presentation/design-system/UdlSpeechButton";
import { ProjectorWaitingScreen } from '@/presentation/components/student/ProjectorWaitingScreen';
import { useProjectorMode } from '@/application/useProjectorMode';
import { useTeacherGender } from '@/application/useTeacherGender';
import { teacherSentenceHe } from '@/core/teacherGender';
import { lobbyState } from '@/core/lobbyState';

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
  // The learner's own record, for their finished mark at the station (the lobby's sentence).
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);

  // Realtime Active Class Session from Teacher
  const activeClassSession = useActiveClassSession();
  // Module 15: real-time projector broadcast reaches the lobby too
  const isProjectorModeActive = useProjectorMode();
  // The teacher's choice for every sentence about the teacher (core/teacherGender.ts).
  const teacherGender = useTeacherGender();
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
          setRecord(val && typeof val === 'object' ? val : null);
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

  // Module 20: If student completed Session 2 and attempts Session 3 without teacher approval -> the meeting-2 waiting screen
  const isAwaitingTeacherGate = hasCompletedSession2 && effectiveSessionId === 3 && !isTeacherGateApproved;

  // PRD Module 6 / 14 §ב0: the lobby shows one of two things — the quiet
  // waiting screen with the sentence of its state, or, once the teacher
  // activates the session, the station's opening screen. The swap happens in
  // place: a client-side route change to the workspace (no reload), whose first
  // screen is that opening screen until the learner presses "מתחילים" (saved
  // with the workspace, so a learner who already pressed it returns to where
  // they stopped). There is no entry button and no navigation control here.
  const state = lobbyState({
    live: isTeacherSessionActive,
    status: activeClassSession.status,
    sessionNumber: teacherSessionNum,
    lastMeeting: activeClassSession.lastMeeting ?? null,
    record,
  });
  const openingMeeting = activeClassSession.isLoaded && state.kind === 'opening' && !isAwaitingTeacherGate && !isProjectorModeActive
    ? state.meeting
    : null;

  useEffect(() => {
    if (openingMeeting !== null) {
      navigate(`/workspace?meeting=${openingMeeting}`, { replace: true });
    }
  }, [openingMeeting, navigate]);

  // Module 15: projector broadcast covers every student surface, the lobby included
  if (isProjectorModeActive) {
    return <ProjectorWaitingScreen />;
  }

  if (isAwaitingTeacherGate) {
    return <Meeting2WaitingScreen inAppShell onApproved={() => setIsTeacherGateApproved(true)} />;
  }

  // Until the broadcast is read, and for the moment of the swap: the same quiet
  // page with nothing on it yet — never a sentence that is not true.
  const sentence = activeClassSession.isLoaded && state.kind === 'waiting' ? teacherSentenceHe(state.sentence, teacherGender) : null;

  return (
    <div
      dir="rtl"
      data-testid="student-lobby"
      className="relative min-h-full flex flex-col items-center justify-center p-6 bg-ws-bg font-body text-ws-ink select-none"
    >
      {sentence && (
        <div
          data-testid="lobby-waiting"
          role="status"
          className="w-full max-w-md bg-ws-surface p-8 rounded-3xl shadow-sm border-2 border-ws-surface2 flex items-center justify-center gap-3"
        >
          <p className="text-xl font-bold text-ws-ink leading-relaxed text-center">{sentence}</p>
          {/* Module 7 (UDL): its read-aloud button, on the learner's click only. */}
          <UdlSpeechButton text={sentence} className="shrink-0" />
        </div>
      )}
    </div>
  );
}
