import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import type { DragSource, Place } from '@/core/placeValue';
import { useWorkspaceStore, getActiveTasks, activeExerciseId, isPathSplitMeeting, savedBankPath, recordLearningPath, isAdditionExercise, selectStandardTask, activeSuccessHold, type SessionNumber } from '@/application/useWorkspaceStore';
import { useAuthStore, stampStudentWindowClosed, touchStudentActivity, currentStudentUid } from '@/application/useAuthStore';
import { submitSRLReflection, hasSavedSRLReflection } from '@/core/srlReflection';
import { useActiveClassSession } from '@/application/useActiveClassSession';
import { useTeacherGender } from '@/application/useTeacherGender';
import { teacherSentenceHe } from '@/core/teacherGender';
import { database, fetchServerClockOffset } from '@/infrastructure/firebase';
import { ref, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { normalizeStudentId } from '@/application/useChatStore';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { PlaceValueBoard } from './board/PlaceValueBoard';

import { setRegroupOrigin } from '@/application/useRegroupAnimationStore';
import { DienesBlock } from './board/DienesBlock';
import { WorkspaceTopbar } from './WorkspaceTopbar';
import { CornerCloudSyncStatus } from './CloudSyncStatus';
import { TaskCard } from './tasks/TaskCard';
import { FeedbackToast } from './overlays/FeedbackToast';
import { HelpOverlays, SocraticSidePanel } from './overlays/HelpOverlays';
import { Session8ReflectionScreen } from '@/presentation/components/student/Session8ReflectionScreen';
import { ClosingSentence } from './ClosingSentence';
import { hasClosingSentence } from '@/core/persistenceEncouragement';
import { StationOpening } from './StationOpening';
import { hasOpeningScreen } from '@/core/stationOpening';
import { firebaseSyncService, emitTelemetry, acknowledgeTeacherReset } from '@/infrastructure/services/FirebaseSyncService';
import { throttledRtdbUpdate, rtdbUpdateNow } from '@/infrastructure/services/ThrottledRtdbWriter';
import { shouldRecordScreen, startScreenRecorder } from './screenRecorder';
import { useStore } from '@/application/useStore';

import { StudentChatOverlay } from './overlays/StudentChatOverlay';
import { AdaptiveAdditionGrid, AdditionGridTab } from './board/AdaptiveAdditionGrid';
import { useIsAdditionGridOverCard } from '@/application/useAdditionGridOverCard';

import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { useCognitiveHesitationRadar } from '@/application/useCognitiveHesitationRadar';
import { Meeting2WaitingScreen } from '@/presentation/components/student/Meeting2WaitingScreen';
import { TeacherWillOpenWaitingScreen } from '@/presentation/components/student/TeacherWillOpenWaitingScreen';
import { ENHANCED_SUPPORT_PROFILE_ID } from '@/core/supportProfile';
import { isRestorableFor, workspaceSavedAt, startedWithoutRecord, isDiagnosticPrimaryRound } from '@/core/workspaceSnapshot';
import { resumeSnapshotFor, savedSnapshotOfMeeting } from '@/core/meetingCompletion';
import { planMeetingEntry } from './meetingEntry';
import { ProjectorWaitingScreen } from '@/presentation/components/student/ProjectorWaitingScreen';
import { SessionPausedOverlay } from '@/presentation/components/student/SessionPausedOverlay';
import { SessionClosedOverlay } from '@/presentation/components/student/SessionClosedOverlay';
import { isMeeting2CloseUnfinished } from '@/core/meeting2CloseNotice';
import { ReinforcementOrChallengeScreen } from './overlays/ReinforcementOrChallengeScreen';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

/**
 * How long the workspace waits for the learner's Firebase record before it
 * starts a meeting from scratch when no local copy of that meeting exists.
 */
export const FIREBASE_RESTORE_GRACE_MS = 6000;

/**
 * This device's saved copy of one meeting: one copy per learner per meeting
 * (FirebaseSyncService.getLocalSessionProgress(uid, meeting)), so the copy of
 * a meeting opened again for catch-up was not overwritten by a later one.
 */
function readDeviceCopy(uid: string, meeting: number): any | null {
  return firebaseSyncService.getLocalSessionProgress(uid, meeting);
}

/**
 * Evaluates whether the local device is superseded by another remote device based on direct ownership in DB.
 * Returns isSuperseded=true if the remote device ID exists and does not match the local device ID.
 * Fail-safe: if remote device is present in DB and local device ID is missing or mismatched, locks the device.
 */
export function evaluateDeviceOwnership(remoteDevId?: string | null, myDevId?: string | null): { isSuperseded: boolean } {
  if (remoteDevId && remoteDevId !== myDevId) {
    return { isSuperseded: true };
  }
  return { isSuperseded: false };
}

/**
 * Guard function to prevent any workspace state or telemetry writes if device is superseded or unauthenticated.
 */
export function canWriteWorkspaceData(uid: string | null | undefined, isSuperseded: boolean): boolean {
  if (!uid || isSuperseded) {
    return false;
  }
  return true;
}

/**
 * The presence heartbeat's lastAction, which the radar tile shows (PRD Module
 * 18). A learner held on the waiting screen because no path is approved for
 * them (no meeting 2 done, or no gate decision) is not at work in the meeting:
 * the heartbeat used to say "פעיל במפגש N" for them too, and the radar showed
 * a learner with no path as active.
 */
export function presenceLastAction(meeting: number, waitingWithoutMeeting: boolean): string {
  // A teacher's line (the radar tile), so it names the meeting, not the station.
  const lastAction = waitingWithoutMeeting ? `ממתין לאישור המסלול לפני מפגש ${meeting}` : `פעיל במפגש ${meeting}`;
  return lastAction;
}

/**
 * מרחב הפעילות של התלמיד — חוויית מסך מלא ממוקדת (100vh, ללא גלילה, ללא טיימרים).
 * פריסה לפי מקור האמת הוונילי: כרטיס משימה (ימין) / טבלת ערך המקום (שמאל), 50/50.
 */
export function StudentWorkspacePage() {
  const [searchParams] = useSearchParams();
  const meetingRaw = parseInt(searchParams.get('meeting') ?? '1', 10);
  const meeting = (Number.isNaN(meetingRaw) ? 1 : Math.min(8, Math.max(1, meetingRaw))) as SessionNumber;

  const navigate = useNavigate();
  const initSession = useWorkspaceStore((s) => s.initSession);
  const restoreSession = useWorkspaceStore((s) => s.restoreSession);
  const applyDrop = useWorkspaceStore((s) => s.applyDrop);
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const flowStatus = useWorkspaceStore((s) => s.flowStatus);
  const successHeld = useWorkspaceStore((s) => activeSuccessHold(s) !== null);
  const qflowPhase = useWorkspaceStore((s) => s.qflow?.phase);
  const isSocraticPanelOpen = useWorkspaceStore((s) => s.helpState === 'socratic');
  const user = useAuthStore((s) => s.user);
  const isTeacherOrAdmin = user?.role === 'teacher' || user?.role === 'admin';

  // PRD V2.0 Section 7 NFR: Pre-fetch Socratic hints upon loading to guarantee <200ms latency
  useEffect(() => {
    SocraticEngine.prefetchSessionHints(sessionNumber);
  }, [sessionNumber]);



  const counts = useWorkspaceStore((s) => s.counts);
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const carryDigits = useWorkspaceStore((s) => s.carryDigits);
  const undoCount = useWorkspaceStore((s) => s.undoCount);
  const hesitationCount = useWorkspaceStore((s) => s.hesitationCount);
  // This meeting's U, E and G: they choose the closing sentence (E1, E2).
  const meetingPersistence = useWorkspaceStore((s) => s.meetingPersistence);
  // Stations 2 and 8 open with one quiet screen, once (owner, 27.9.2026).
  const openingScreenSeen = useWorkspaceStore((s) => s.openingScreenSeen);
  const markOpeningScreenSeen = useWorkspaceStore((s) => s.markOpeningScreenSeen);

  // --- Active Teacher Class Session Listener ---
  const activeClassSession = useActiveClassSession();
  const isTeacherSessionActive = activeClassSession?.active ?? false;
  // The teacher's choice for every sentence about the teacher (core/teacherGender.ts);
  // the waiting screens, the overlays and the help-call toast read it from here.
  const teacherGender = useTeacherGender();

  const [isProjectorModeActive, setIsProjectorModeActive] = useState<boolean>(false);
  // מודול 1: מזהה הלומד נגזר מ-student_id שאומת בכניסה (1-12), ולא ממזהה
  // ה-Auth הגולמי. הנפילה הקודמת ל-'student_user1' גרמה לכך שלומד שמזההו
  // לא נפתר קרא וכתב לתוך הצומת של תלמיד 1 — נוכחות, מצב לוח והכול.
  // מחרוזת ריקה כאן פירושה "אין לומד מזוהה", וכל האפקטים למטה יוצאים בלי
  // לגעת בשום צומת.
  const normUid = currentStudentUid();
  const lastProjectorTimestampRef = useRef<number>(0);

  // Write initial session presence and emit canonical SESSION_START event (Module 5 & 14)
  useEffect(() => {
    if (!normUid) return;
    const sessionId = `session_${meeting}_student_${normUid}`;
    emitTelemetry({
      session_id: sessionId,
      student_id: normUid,
      exercise_id: `ex_${meeting}_01`,
      event_type: 'SESSION_START',
      details: {
        session_number: meeting,
      },
    }).catch(console.error);
  }, [normUid, meeting]);

  // Module 15: Real-time Projector Mode Listener (<1000ms sync) with timestamp ordering protection
  useEffect(() => {
    const projectorRef = ref(database, 'system_control/projector_mode');
    const unsub = onValue(
      projectorRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          if (typeof val === 'object' && val !== null) {
            const timestamp = val.projector_mode_updated_at || val.updated_at || 0;
            if (timestamp > 0 && timestamp <= lastProjectorTimestampRef.current) {
              return; // Ignore stale / out-of-order updates
            }
            if (timestamp > 0) {
              lastProjectorTimestampRef.current = timestamp;
            }
            setIsProjectorModeActive(Boolean(val.projector_mode ?? val.active));
          } else {
            setIsProjectorModeActive(Boolean(val));
          }
        } else {
          setIsProjectorModeActive(false);
        }
      },
      (err) => {
        console.warn('[StudentWorkspacePage] projectorRef listener notice:', err);
      }
    );
    return () => unsub();
  }, []);

  // WP6 / Chaos Scenario 2: Soft Device Lock (active_device_id writer and real-time takeover listener)
  const currentDeviceIdRef = useRef<string>(
    `dev_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`
  );
  const isSupersededRef = useRef<boolean>(false);

  useEffect(() => {
    if (!normUid) return;
    const myDevId = currentDeviceIdRef.current;
    const myClaimTime = Date.now();
    isSupersededRef.current = false;
    useWorkspaceStore.getState().setActiveDeviceId(myDevId);
    useWorkspaceStore.getState().setSupersededByOtherDevice(false);

    // Every page load draws a new id, so until this device's claim has reached
    // the server the record names an earlier load's device — this tab before a
    // refresh, or yesterday's visit. That is not a takeover. The claim waits
    // for the record's write window (PRD 18), and the lobby's "leaving" write
    // has just used it; locking on the earlier id meanwhile locked the only
    // device, and the lock's guard on the presence and board writes queued in
    // the same window then dropped the claim with them: "המשכתם במכשיר אחר"
    // with no other device, through every refresh (owner, live, 28.9.2026).
    let active = true;
    let claimLanded = false;
    let remoteDevId: string | null = null;
    const applyOwnership = () => {
      if (!active) return;
      // Direct ownership check: if the active device recorded in DB is not me, I am locked
      if (evaluateDeviceOwnership(remoteDevId, myDevId).isSuperseded) {
        if (!claimLanded) return;
        isSupersededRef.current = true;
        useWorkspaceStore.getState().setSupersededByOtherDevice(true);
        try {
          onDisconnect(ref(database, `users/students/${normUid}/isOnline`)).cancel();
          onDisconnect(ref(database, `users/students/${normUid}/lastPing`)).cancel();
        } catch {}
      } else if (remoteDevId === myDevId) {
        isSupersededRef.current = false;
        useWorkspaceStore.getState().setSupersededByOtherDevice(false);
        try {
          onDisconnect(ref(database, `users/students/${normUid}/isOnline`)).set(false);
          onDisconnect(ref(database, `users/students/${normUid}/lastPing`)).set(0);
        } catch {}
      }
    };

    // 1. Claim ownership of student session for this device
    throttledRtdbUpdate(`users/students/${normUid}`, {
      active_device_id: myDevId,
      device_claimed_at: myClaimTime,
    })
      .then(() => {
        claimLanded = true;
        applyOwnership();
      })
      .catch(console.error);

    // 2. Real-time listener: Detect if another device took over ownership in DB
    const studentNodeRef = ref(database, `users/students/${normUid}`);
    const unsubDevice = onValue(
      studentNodeRef,
      (snap) => {
        if (snap.exists()) {
          remoteDevId = snap.val()?.active_device_id ?? null;
          applyOwnership();
        }
      },
      (err) => {
        console.warn('[StudentWorkspacePage] deviceRef listener notice:', err);
      }
    );

    return () => {
      active = false;
      unsubDevice();
    };
  }, [normUid]);

  const [activeDrag, setActiveDrag] = useState<{ place: Place; source: DragSource; renderPlace?: Place } | null>(null);

  // Module 15 §ב ("מצב צפייה חסום ואטום"), and the teacher's pause and close
  // (register 7): while one of their screens is up, the workspace under it
  // takes no input. The screen only covered it — Enter still checked and
  // advanced the exercise behind it, Ctrl+Z undid, and a focused box took
  // digits. Exactly the conditions classStateOverlays below shows a screen on.
  const isClassScreenUp =
    isProjectorModeActive ||
    (!isTeacherOrAdmin && (activeClassSession.status === 'paused' || (activeClassSession.status === 'closed' && activeClassSession.isLoaded)));
  const isClassScreenUpRef = useRef(isClassScreenUp);
  isClassScreenUpRef.current = isClassScreenUp;
  // The coaching card that settles under one of these screens is not seen:
  // SOCRATIC_CARD_SHOWN waits until the screen is gone (HelpOverlays).
  useEffect(() => {
    useWorkspaceStore.getState().setClassScreenUp(isClassScreenUp);
  }, [isClassScreenUp]);

  // הרדאר השקט — covert monitoring for the teacher dashboard; nothing student-visible.

  // NOTE: this page writes no qMatrixResults and no traceData. Meeting 2's are
  // written once, when the diagnostic ends (useWorkspaceStore, qflow step
  // 'all_complete'); the exercise results of the later meetings by the store's
  // success and failure handlers. A second write here used wrong result keys with
  // correct=true defaults and silently overwrote real diagnostics — removed.
  // Keyboard: Enter = proceed (outside inputs), Ctrl/Cmd+Z = undo (vanilla app.js 1412–1416).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isClassScreenUpRef.current) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT';
      // A focused button already acts on Enter; running proceed() here too
      // pressed "התקדם" twice, and the second press hit the next exercise.
      if (e.key === 'Enter' && !inInput && tag !== 'BUTTON') {
        useWorkspaceStore.getState().proceed();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (!activeDrag) {
          useWorkspaceStore.getState().undo();
        }
      }
    };
    
    const onVisibilityChange = () => {
      if (document.hidden) {
        const studentId = currentStudentUid();
        if (studentId) {
          AuditLogger.log('TAB_ESCAPE', studentId, 'Student switched to another tab or window');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activeDrag]);


  // Sync workspace state and vector replays continuously to Firebase RTDB
  useEffect(() => {
    const uid = normUid;
    if (!canWriteWorkspaceData(uid, isSupersededRef.current)) return;
    // Until initialisation runs, the store still holds the PREVIOUS meeting's
    // state. Publishing it under this URL's meeting number (as this used to) made
    // the saved record look like progress in the new meeting, and the restore
    // below then put the learner on the old exercise index, board and digits —
    // or on "השלמתם את משימות החובה" of a meeting they had not started.
    if (sessionNumber !== meeting) return;
    // Module 17: the board goes to the record by the rule the sync itself
    // writes by — only the learner's own meeting, started or restored for them
    // (never the store's defaults, never a meeting a teacher's reset
    // discarded), and only once the record has been read. These fields used to
    // be written before that: the defaults of meeting 1 on page load, and a
    // fresh start made without the record, which the database queued offline
    // and layered onto the record's copy on reconnect — the very copy the
    // reconnect then judges and restores.
    if (!firebaseSyncService.mayWriteWorkspaceToRecord(uid, meeting)) return;

    const totalBlocks = (counts.units || 0) + (counts.tens || 0) + (counts.hundreds || 0) + (counts.thousands || 0);
    const hasInteracted = totalBlocks > 0 || Object.values(answerDigits || {}).some(Boolean);

    const wsPayload: any = {
      'workspaceState/counts': counts,
      'workspaceState/answerDigits': answerDigits,
      'workspaceState/carryDigits': carryDigits,
      'workspaceState/undoCount': undoCount,
      'workspaceState/hesitationCount': hesitationCount,
      'workspaceState/hasInteracted': hasInteracted,
      'workspaceState/sessionNumber': sessionNumber,
      'workspaceState/flowStatus': flowStatus,
      lastActivityTimestamp: Date.now(),
      lastPing: serverTimestamp(),
      lastAction: `פעילות בבית המספרים במפגש ${meeting}`,
    };

    // PRD 18: "Throttle client writes to maximum once per 1000ms". This ran on
    // every board change — five writes in half a second while a child dragged
    // blocks. The shared writer sends at most one per second per path, the
    // latest state last, merged with the store's own writes to this record.
    // The device check runs again when the write is SENT: a takeover inside the
    // window must not let this device write its board over the new one.
    throttledRtdbUpdate(`users/students/${uid}`, wsPayload, {
      guard: () => canWriteWorkspaceData(uid, isSupersededRef.current),
    }).catch(() => {});
  }, [normUid, counts, answerDigits, carryDigits, undoCount, hesitationCount, meeting, sessionNumber, flowStatus]);

  // --- Module 21 screen recording: see the recorder effect below initialisation ---
  const classStartedAt = activeClassSession?.startedAt ?? null;
  const classSessionNumber = activeClassSession?.sessionNumber ?? null;
  // WP6: another device took this learner's session over (the soft device lock below).
  const isSupersededByOtherDevice = useWorkspaceStore((s) => s.isSupersededByOtherDevice);

  // The meeting the learner is in, on the learner's record: a single-learner
  // reset with no meeting open restarts this one (register deviation 10).
  useEffect(() => {
    const uid = normUid;
    if (!uid) return;
    throttledRtdbUpdate(`users/students/${uid}`, {
      activeSessionNumber: classSessionNumber || meeting || 1,
      lastActive: Date.now(),
    }).catch(console.error);
  }, [normUid, classSessionNumber, meeting]);

  const [isInitializing, setIsInitializing] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  // The meeting this learner entered was already finished (meetingEntry). Set
  // at initialisation only: a learner at work is never moved to the end screen.
  const [finishedOnEntry, setFinishedOnEntry] = useState<number | null>(null);
  const isAdditionHelperOpen = useWorkspaceStore((s) => s.isAdditionHelperOpen);
  const additionHelperOffered = useWorkspaceStore((s) => s.additionHelperOffered);

  // Tab switching & background throttling detection (Module 10 & 18)
  const [isTabHidden, setIsTabHidden] = useState<boolean>(
    typeof document !== 'undefined' ? document.hidden : false
  );

  useEffect(() => {
    const handleVisChange = () => {
      setIsTabHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisChange);
    };
  }, []);

  // Retrieve saved progress from Firebase (synced into useStore)
  const students = useStore((s) => s.students);
  const firebaseLoaded = useStore((s) => s.firebaseLoaded);
  const myData = normUid ? (students[normUid] || (user?.uid ? students[user.uid] : null)) : null;
  const isASDMode = myData?.isASD ?? false;

  // --- PRD Section 4.5 & Module 20: Gate Locked / Pending Approval Guard ---
  const isGateApproved = Boolean(myData?.teacher_gate_approved === true || myData?.routeStatus === 'APPROVED');
  // Module 26: "Never load, prefetch, or fall back to an exercise from the
  // non-matching bank under any circumstance." A learner in meetings 3–8 needs
  // the gate's approval and the path it approved; until both are on the
  // record the meeting is not started (a teacher previewing the workspace has
  // no learner path and is not held).
  const needsApprovedPath = isPathSplitMeeting(meeting) && !isTeacherOrAdmin;
  // pedagogicalPath, or — for a learner approved before 2.9.2026 — the gate's
  // teacher_selected_path (recordLearningPath).
  const learnerPath = recordLearningPath(myData as Record<string, unknown> | null);
  const hasApprovedPath = isGateApproved && learnerPath !== null;
  // The meeting-2 waiting screen says "סיימתם את התחנה השנייה בהצלחה": it is shown only to a
  // learner who did finish meeting 2 and is waiting for the gate. Anyone else
  // waiting here — no completed meeting 2, or no path — is told only "המורה
  // תפתח את הפעילות בקרוב." (PRD 14 §ב0), so the text matches what the child did.
  const completedMeeting2 = Boolean(
    myData?.completedMeeting2 ||
    (myData as any)?.session_completed === 2 ||
    (typeof myData?.highestCompletedMeeting === 'number' && myData.highestCompletedMeeting >= 2) ||
    myData?.routeStatus === 'PENDING_TEACHER_APPROVAL'
  );
  const showMeeting2Waiting = completedMeeting2 && !isGateApproved;

  // Meeting 2 opened again (owner decision 2.10.2026: to let the learners who
  // did not finish, finish). A learner the teacher's close completed part-way
  // and whose path the teacher has already approved does not go back into the
  // diagnostic: the approval rests on what was there, and finishing would
  // rewrite it. Same quiet wait as a finished learner (#196). Learners not yet
  // approved go on from where they stopped and are re-scored. Not work either:
  // no hesitation is measured behind this screen (isOverlayActive).
  const waitingAfterApproval =
    meeting === 2 && !isTeacherOrAdmin && completedMeeting2 && isGateApproved &&
    isDiagnosticPrimaryRound({ sessionNumber, flowStatus, qflow: { phase: qflowPhase } });

  // A meeting opened again for catch-up (owner decision 2.10.2026) that this
  // learner had already finished: the quiet end screen, and — as behind
  // waitingAfterApproval — no hesitation is measured behind it.
  const quietFinished = !isTeacherOrAdmin && finishedOnEntry === meeting;

  // Active overlay or background tab detection: when projector, teacher pause/close, gate lock, sessionDone, or tab is hidden
  const isOverlayActive = isProjectorModeActive || 
    activeClassSession.status === 'paused' || 
    activeClassSession.status === 'closed' || 
    pendingApproval || 
    waitingAfterApproval ||
    quietFinished ||
    flowStatus === 'sessionDone' ||
    // The opening screen of station 2 or 8 is not work: no hesitation is measured on it.
    (hasOpeningScreen(sessionNumber) && flowStatus === 'task' && !openingScreenSeen) ||
    isTabHidden;

  // Pedagogical Radar — active during real student problem solving, strictly PAUSED during overlays.
  // Not on the reinforcement-or-challenge screen either: no exercise is open
  // there, and the clock kept running from the last digit of exercise 7, so a
  // learner with the enhanced profile who took half a minute to choose got
  // the addition grid open — and logged as a 30-second opening — before the
  // first optional exercise began (PRD Module 10 §א: 0–30 s is the learner's own).
  // It restarts from zero when the chosen exercise opens. (Not part of
  // isOverlayActive: that one also shifts the task timer, and the chosen
  // exercise starts its own.)
  // Nor on the meeting-8 reflection board: it has no column to hesitate in
  // (PRD 18: '45 שניות רצופות ללא פעולה בטור הפעיל'), and the teacher's tile
  // turned yellow while the learner was reflecting.
  // Nor while a solved exercise is held on the screen (owner, 7.10.2026):
  // reading why the answer is right is not hesitating, and no grid or card
  // opens on an exercise that is done.
  useCognitiveHesitationRadar({
    isActive: !isOverlayActive && flowStatus !== 'choice_branch' && flowStatus !== 'reflection' && !isTeacherOrAdmin && !successHeld,
    onHesitationDetected: () => {
      const ws = useWorkspaceStore.getState();
      const currentTask = ws.sessionNumber === 2 ? null : getActiveTasks(ws)[ws.standardTaskIdx];
      const isSandbox = currentTask?.id === 's1_sandbox_controlled' || currentTask?.type === 'session1_intro';
      if (ws.flowStatus === 'task' && !isSandbox) {
        ws.setKeyboardSocratic();
      }
    }
  });

  // X55: set while the meeting shows this device's cached copy and the learner record has not arrived yet.
  const restoredFromCacheRef = useRef<{ meeting: number; savedAt: number } | null>(null);

  // Problem-duration telemetry: pause elapsed timer during projector, paused, or closed overlays
  const overlayStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (isOverlayActive) {
      if (overlayStartRef.current === null) {
        overlayStartRef.current = Date.now();
      }
    } else {
      if (overlayStartRef.current !== null) {
        const pausedDurationMs = Date.now() - overlayStartRef.current;
        overlayStartRef.current = null;
        if (pausedDurationMs > 0) {
          const currentStartTime = useWorkspaceStore.getState().taskStartTime;
          if (currentStartTime) {
            useWorkspaceStore.setState({
              taskStartTime: currentStartTime + pausedDurationMs,
            });
          }
        }
      }
    }
  }, [isOverlayActive]);

  useEffect(() => {
    const isApproved = isGateApproved;
    // PRD 14 §ב0: "כדי שמפגש 3 ייפתח נדרשים שני התנאים במצטבר: אישור בשער
    // המורה עבור אותו לומד, ופתיחת מפגש 3 על ידי המורה."
    //
    // התנאי כאן דרש בנוסף שהלומד יישא סימן כלשהו של מפגש 2 — routeStatus
    // נעול/ממתין, או session_2_completed. לומד שלא סיים את האבחון כלל אינו
    // נושא אף אחד מהם, ולכן דווקא הוא — היחיד שאיש לא ניתב למסלול — נכנס
    // למפגש 3 בלי אישור, על המאגר הירוק, וזה בדיוק מה ששני התנאים
    // במצטבר נועדו למנוע. האישור נדרש עכשיו ללא יוצא מן הכלל.
    //
    // firebaseLoaded: לפני שהרשומה נטענה אין מה להכריע, וממילא
    // initSession עצמו ממתין לה — כך שאין הבהוב של מסך המתנה.
    //
    // Module 26 and the owner's ruling of 28.9.2026 ("ילד לא יתחיל שלב לפני
    // שהוא עשה את השלבים הקודמים"): meetings 3–8 run on the bank of the
    // learner's approved path, so without an approved path they wait here too.
    const isAwaitingGate = firebaseLoaded && ((meeting === 3 && !isApproved) || (needsApprovedPath && !hasApprovedPath));

    if (myData?.routeStatus === 'GATE_LOCKED' || isAwaitingGate) {
      setNetworkError(false); // Teacher lock, not a network error
      setPendingApproval(true);
    } else if (pendingApproval && isInitialized && isApproved && !networkError) {
      // A meeting that is already running goes on. One not yet started is
      // released by its initialisation (runInit), which starts it on the
      // approved path in the same step.
      setPendingApproval(false);
    }
  }, [isGateApproved, myData?.routeStatus, meeting, firebaseLoaded, pendingApproval, networkError, needsApprovedPath, hasApprovedPath, isInitialized]);

  // Reset initialization when meeting changes
  useEffect(() => {
    setIsInitialized(false);
    setFinishedOnEntry(null);
  }, [meeting]);

  // Real-time additionBoardEnabled & teacher adaptations listener (bound to canonical normUid)
  const [, setLiveAdditionBoardEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!normUid) return;
    const studentRef = ref(database, `users/students/${normUid}`);
    const unsub = onValue(
      studentRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.val() || {};
          const boardVal = Boolean(val.additionBoardEnabled || val.forceAdditionHelper);
          setLiveAdditionBoardEnabled(boardVal);

          // Direct lock / unlock sync from teacher: only explicit root isBoardLocked
          // can lock the board; stale workspaceState must never trap the learner.
          const isLocked = val.isBoardLocked !== undefined ? Boolean(val.isBoardLocked) : false;
          if (isLocked !== useWorkspaceStore.getState().isBoardLocked) {
            useWorkspaceStore.setState({ isBoardLocked: isLocked });
          }

          // Module 19 §ב: stage a teacher-queued differentiation change without
          // applying it — useWorkspaceStore's startTask() applies (and clears)
          // this only at the next task boundary, never mid-exercise.
          if (val.pendingAdaptation !== undefined) {
            useWorkspaceStore.setState({ pendingAdaptation: val.pendingAdaptation || null });
          }

          useStore.setState((s) => {
            const existing = s.students[normUid] || {};
            return {
              students: {
                ...s.students,
                [normUid]: {
                  ...existing,
                  additionBoardEnabled: boardVal,
                  forceAdditionHelper: Boolean(val.forceAdditionHelper),
                  isBoardLocked: isLocked !== undefined ? Boolean(isLocked) : existing.isBoardLocked,
                  scaffoldLevel: val.scaffoldLevel !== undefined ? val.scaffoldLevel : existing.scaffoldLevel,
                  // The snapshot is the whole record: a path reset to null is gone (Module 26).
                  pedagogicalPath: val.pedagogicalPath || undefined,
                  teacher_selected_path: val.teacher_selected_path || undefined,
                  routeStatus: val.routeStatus || existing.routeStatus,
                  teacher_gate_approved: val.teacher_gate_approved !== undefined ? val.teacher_gate_approved : existing.teacher_gate_approved,
                },
              },
            };
          });
        }
      },
      (err) => {
        console.warn('[StudentWorkspacePage] studentRef adaptations listener notice:', err);
      }
    );
    return () => unsub();
  }, [normUid]);

  // --- Real-time Teacher Reset & Force Reload Listener ---
  useEffect(() => {
    if (!normUid) return;
    const studentRef = ref(database, `users/students/${normUid}`);
    const unsub = onValue(studentRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        if (val?.forceReload === true) {
          acknowledgeTeacherReset(normUid, user?.uid, canWriteWorkspaceData(normUid, isSupersededRef.current), val);
          window.location.href = '/hub';
        }
      }
    });
    return () => unsub();
  }, [normUid]);

  // --- Module 18: Live Presence Heartbeat & Session Sync (5s interval, 60s server window) ---
  // Read by the heartbeat when it sends, so a change does not restart the
  // effect (its cleanup writes the learner offline).
  const waitingWithoutMeetingRef = useRef(false);
  waitingWithoutMeetingRef.current = pendingApproval && !isInitialized;
  useEffect(() => {
    if (!normUid) return;
    // Checked again when the throttled write is SENT: a device taken over in
    // the meantime writes nothing.
    const canWrite = () => canWriteWorkspaceData(normUid, isSupersededRef.current);

    // Built when it is sent: lastAction follows whether the learner is at
    // work or waiting (presenceLastAction), without restarting this effect.
    const presencePayload = () => ({
      isOnline: true,
      lastPing: serverTimestamp(),
      lastActivityTimestamp: Date.now(),
      hasJoinedSession: true,
      sessionJoined: true,
      lastAction: presenceLastAction(meeting, waitingWithoutMeetingRef.current),
      // No workspaceState keys here. This payload is re-sent on every (re)connect,
      // and it used to stamp flowStatus 'task' and this URL's meeting number over
      // whatever the learner had really reached ('sessionDone', 'choice_branch').
      // The store's own sync owns workspaceState.
    });

    // Re-arm presence and server-side onDisconnect hooks on every connection cycle (PRD Module 18)
    const connectedRef = ref(database, '.info/connected');
    const unsubConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        if (!canWriteWorkspaceData(normUid, isSupersededRef.current)) return;

        throttledRtdbUpdate(`users/students/${normUid}`, presencePayload(), { guard: canWrite }).catch(() => {});
        try {
          onDisconnect(ref(database, `users/students/${normUid}/isOnline`)).set(false);
          onDisconnect(ref(database, `users/students/${normUid}/onlineStatus`)).set('offline');
          onDisconnect(ref(database, `users/students/${normUid}/lastPing`)).set(0);
          onDisconnect(ref(database, `users/students/${normUid}/lastAction`)).set('לא מחובר');
        } catch {
          // ignore offline mock disconnect
        }
      }
    });

    const handleBeforeUnload = () => {
      stampStudentWindowClosed();
      if (canWriteWorkspaceData(normUid, isSupersededRef.current)) {
        rtdbUpdateNow(`users/students/${normUid}`, { isOnline: false, onlineStatus: 'offline', lastPing: 0, lastAction: 'לא מחובר' }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    const interval = setInterval(() => {
      touchStudentActivity();
      if (!canWriteWorkspaceData(normUid, isSupersededRef.current)) return;

      throttledRtdbUpdate(`users/students/${normUid}`, {
        isOnline: true,
        onlineStatus: 'active',
        lastPing: serverTimestamp(),
        lastActivityTimestamp: Date.now(),
        hasJoinedSession: true,
        lastAction: presenceLastAction(meeting, waitingWithoutMeetingRef.current),
      }, { guard: canWrite }).catch(() => {});
    }, 4000);

    return () => {
      unsubConnected();
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      if (canWriteWorkspaceData(normUid, isSupersededRef.current)) {
        rtdbUpdateNow(`users/students/${normUid}`, { isOnline: false, onlineStatus: 'offline', lastPing: 0, lastAction: 'לא מחובר' }).catch(() => {});
      }
    };
    // Not isASDMode: nothing here reads it, and with it in the list a teacher
    // saving quiet mode restarted this effect — the cleanup wrote the learner
    // offline, and the radar showed "יצא מהחלון" until the next heartbeat.
  }, [normUid, meeting]);

  // PRD v7.1 Module 10: Load adaptive addition grid strictly and only when the
  // authoritative support profile is 'enhanced_cognitive_support' (shared
  // contract in core/supportProfile.ts, honoring the legacy boolean on live
  // records). No manual teacher toggle during a live session. For every other
  // learner the grid must not mount, render or exist in the DOM.
  // Module 19 §ב: the profile applied at this exercise's start — a change the
  // teacher makes mid-exercise waits for the next one (useWorkspaceStore
  // receiveSupportProfile), so the grid does not appear or vanish under the
  // learner's hands.
  const hasEnhancedSupport = useWorkspaceStore((s) => s.activeSupportProfileId === ENHANCED_SUPPORT_PROFILE_ID);
  // Register 18: "רק לפרופיל תמיכה מוגבר, ורק במפגשים 3–7" — never meeting 1, 2 or 8.
  // Owner, 1.10.2026 (D7): and only in an addition exercise — not in station
  // 3's representations, not in a subtraction. A grid the learner left open
  // stays open (register decision ב: only the learner closes it); it is
  // simply not shown, nor its return tab, while the exercise is not an addition.
  const isAdditionOnScreen = useWorkspaceStore((s) => isAdditionExercise(selectStandardTask(s)));
  const isAdditionBoardEnabled = hasEnhancedSupport && sessionNumber >= 3 && sessionNumber <= 7 && isAdditionOnScreen;
  // The grid and its tab have a slot of their own in the workspace row, beside
  // the board (AdaptiveAdditionGrid.tsx). The coaching card is the next level
  // of the same hierarchy (Module 10 §א: grid at 30s, Socratic intervention at
  // 45s), and the two are never shown together: two aids at once are too much
  // for the learner they serve, and the row cannot hold the sheet, the board,
  // the grid and the card on a 1024px screen without squeezing the exercise
  // out of view. Owner's decision, 4.10.2026 — one mechanism, two named tabs,
  // each in its own place, the same on every screen size:
  //  - the grid's place is this slot; the card's place is its column at the
  //    edge of the screen. The one that is not shown is a tab in its own
  //    place, so a swap never moves a tab;
  //  - while the card is open, the card is shown and the grid is its amber
  //    "לוח החיבור" tab beside the card — whenever the grid was offered:
  //    open when the card arrived, closed earlier, or offered at 30 seconds
  //    under the card (useCognitiveHesitationRadar);
  //  - pressing that tab shows the grid, and the card folds into its "כרטיס
  //    החניכה" tab (SocraticSidePanel); that tab, or the grid's X, brings the
  //    card back (useAdditionGridOverCard.ts).
  // A grid that waits as a tab is not closed (מסמך 03 §1.3 ה', register
  // decision ב: only the learner closes it) and not unmounted, only hidden
  // (display: none), so it is back exactly as it was — the chosen row and
  // column kept, no second fade-in, clickable at once. (When the exercise on
  // the screen is not an addition the grid is unmounted instead, and has no
  // tab: owner, 1.10.2026, D7.)
  const isAdditionGridMounted = isAdditionBoardEnabled && isAdditionHelperOpen;
  const isAdditionGridOverCard = useIsAdditionGridOverCard();
  const isAdditionGridShown = isAdditionGridMounted && (!isSocraticPanelOpen || isAdditionGridOverCard);
  // An open grid always has its tab while it is not shown, whatever the offer flag says.
  const isAdditionGridTabShown = isAdditionBoardEnabled && (additionHelperOffered || isAdditionHelperOpen) && !isAdditionGridShown;
  const isAdditionGridSlotShown = isAdditionGridShown || isAdditionGridTabShown;


  useEffect(() => {
    if (isInitialized) {
      // X55: the meeting opened on this device's cached copy before the
      // learner record had loaded. The record is the authority: once it is
      // here, a copy of this meeting on it that is later than the cached one
      // (saved from another device, or after this cache was written) is
      // restored over it. The sync subscription stays paused until the first
      // record snapshot, so the cached copy was never pushed over it.
      const fromCache = restoredFromCacheRef.current;
      if (fromCache && firebaseLoaded) {
        restoredFromCacheRef.current = null;
        // This meeting's copy on the record — also after the class moved on
        // and workspaceState holds a later meeting (catch-up, 2.10.2026).
        const server = savedSnapshotOfMeeting(myData as Record<string, unknown> | null, meeting);
        if (
          fromCache.meeting === meeting &&
          isRestorableFor(server, meeting) &&
          workspaceSavedAt(server) > fromCache.savedAt &&
          (!needsApprovedPath || savedBankPath(server as { activeBankPath?: unknown }) !== null)
        ) {
          restoreSession(server);
        }
      }
      return;
    }
    let cancelled = false;

    // Module 26 / owner, 28.9.2026: no approved path, no meeting. The learner
    // waits on the waiting screen, and this effect runs again when the record
    // changes — the approval and the path arrive together from the gate — so
    // the meeting starts on the approved bank the moment they do. It used to
    // start on the green bank behind the waiting screen, and nothing started
    // it again after the approval.
    const waitForApprovedPath = () => {
      setPendingApproval(true);
      setIsInitializing(false);
    };
    // Starting or restoring the meeting also releases the waiting screen.
    const markInitialized = () => {
      setPendingApproval(false);
      setIsInitialized(true);
      setIsInitializing(false);
    };

    // PRD 14 §ג: a learner who has finished "ממתין במסך סיום שקט"; PRD 14 §ב0:
    // re-opening a completed meeting deletes nothing. A saved 'sessionDone' used to
    // be refused here, so the lobby's entry into the open meeting restarted it at
    // exercise 1: after the diagnostic the meeting-2 waiting screen never appeared, and a
    // second pass before the approval overwrote the score, the recommended path
    // and the Q-matrix. Starting a meeting over is what the level-2 reset is for —
    // it clears the saved state, and only then is there nothing to restore.
    //
    // Catch-up (owner decision 2.10.2026): a meeting opened again goes on from
    // its own saved copy, and a learner who had finished it waits on the quiet
    // end screen (meetingEntry). Decided here, once — never mid-work.
    const enterMeeting = (uid: string) => {
      const entry = planMeetingEntry(myData as Record<string, unknown> | null, readDeviceCopy(uid, meeting), meeting);
      if (entry.kind === 'start') {
        initSession(meeting, isASDMode, 0);
        return;
      }
      restoreSession(entry.snapshot);
      if (entry.kind === 'finished') setFinishedOnEntry(meeting);
    };

    const runInit = async () => {
      if (needsApprovedPath && !hasApprovedPath) {
        waitForApprovedPath();
        return;
      }
      if (meeting === 3) {
        // מזהה קנוני בלבד. מזהה שאינו נפתר למספר תלמיד 1-12 נחשב
        // "אין לומד מזוהה", ולא נופל לתלמיד כלשהו.
        const username = currentStudentUid();
        const activeSessionNum = isTeacherSessionActive ? (Number(activeClassSession?.sessionNumber) || 1) : null;
        const teacherSessionAllowsMeeting3 = isTeacherSessionActive && activeSessionNum !== null && activeSessionNum >= 3;
        const routeStatus = myData?.routeStatus;
        const highestCompleted = myData?.highestCompletedMeeting ?? (myData?.completedMeeting2 ? 2 : 0);
        const isAllowedMeeting3 = username
          ? teacherSessionAllowsMeeting3 || (highestCompleted >= 2 && routeStatus === 'APPROVED') || Boolean(myData?.physicalOverride || (myData as any)?.physicalOverrideActive)
          : teacherSessionAllowsMeeting3;

        // If prerequisite completion or active teacher session requirement is
        // not met, wait. Not marked initialised: when the teacher opens the
        // meeting or the record changes, this runs again and starts it.
        if (!isAllowedMeeting3) {
          waitForApprovedPath();
          return;
        }

        setIsInitializing(true);
        try {
          // תרחיש 1 — שעון עקום: קריאת offset שרת פעם אחת לפני כל חישוב deadline
          await fetchServerClockOffset();
          if (cancelled) return;

          if (!username) {
            initSession(meeting, isASDMode, 0);
            markInitialized();
            return;
          }
          enterMeeting(username);
          markInitialized();
        } catch (err) {
          if (cancelled) return;
          console.error("Network or server error during Teacher Gate verification:", err);
          setNetworkError(true);
          setPendingApproval(true);
          setIsInitialized(true);
          setIsInitializing(false);
        }
      } else if (meeting !== 2) {
        enterMeeting(normUid || user?.uid || '');
        markInitialized();
      } else {
        // Meeting 2 as before (#196/#207), from its own saved copy.
        // X55: the record wins unless this device holds a strictly later state.
        const saved = resumeSnapshotFor(
          myData as Record<string, unknown> | null,
          readDeviceCopy(normUid || user?.uid || '', meeting),
          meeting
        );
        if (saved) {
          restoreSession(saved);
        } else if (
          meeting === 2 &&
          (myData?.completedMeeting2 === true ||
            (typeof myData?.highestCompletedMeeting === 'number' && myData.highestCompletedMeeting >= 2))
        ) {
          // The diagnostic is done and the learner has moved on, so there is no
          // meeting-2 state to restore. Starting it again let a second run
          // overwrite the Q-matrix the gate rests on (system check 1.10.2026).
          // The learner waits instead; the level-2 reset clears these fields
          // when the teacher really wants meeting 2 done again.
          waitForApprovedPath();
          return;
        } else {
          initSession(meeting, isASDMode, 0);
        }
        markInitialized();
      }
    };

    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    if (firebaseLoaded) {
      runInit();
    } else {
      // Check if local cache has current meeting state for instantaneous restoration.
      // In meetings 3–8 only a copy that carries the bank it was pinned to
      // (Module 26): an older copy without it waits for the record, which
      // says which path was approved — never the green bank by default.
      const cached = readDeviceCopy(normUid || user?.uid || '', meeting);
      if (
        cached && cached.sessionNumber === meeting && Boolean(cached.flowStatus) &&
        (!needsApprovedPath || savedBankPath(cached) !== null)
      ) {
        restoreSession(cached);
        // X55: shown at once, but provisional — when the record arrives, a
        // later copy of this meeting on it replaces this one (effect start).
        // A copy of a fresh start made without the record is settled by the
        // sync instead, by the fresh-start rule (Module 17, keepsFreshStartWork).
        if (!startedWithoutRecord(cached)) {
          restoredFromCacheRef.current = { meeting, savedAt: workspaceSavedAt(cached) };
        }
        markInitialized();
      } else {
        // No local copy of this meeting: wait for the learner's Firebase
        // record before deciding. Starting a fresh session here right away —
        // as this used to — put the learner on exercise 1 while the real
        // progress was still loading, and the sync then pushed that fresh
        // state over the saved one. The record's arrival re-runs this effect
        // (firebaseLoaded); the timer only covers a connection that never
        // answers, so an offline learner is not left on the loader.
        fallbackTimer = setTimeout(() => {
          if (!cancelled) runInit();
        }, FIREBASE_RESTORE_GRACE_MS);
      }
    }

    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [meeting, firebaseLoaded, isInitialized, myData, initSession, restoreSession, isASDMode, activeClassSession, isTeacherSessionActive, needsApprovedPath, hasApprovedPath]);

  // --- Module 21: screen recording (rrweb) ---
  // It runs only for this meeting's own recording: once the class session's
  // server start stamp is known (the recording id), once the store holds this
  // meeting (every chunk's exercise_id), and never on a device another device
  // took over. Before, it started on mount — under a stray `session_{Date.now()}`
  // with a fresh 50MB, with the previous meeting's exercise ids, and on a
  // superseded device.
  const recordScreen = shouldRecordScreen({
    uid: normUid,
    classStartedAt,
    classSessionNumber,
    meeting,
    storeSessionNumber: sessionNumber,
    initialized: isInitialized,
    superseded: isSupersededByOtherDevice,
  });
  useEffect(() => {
    if (!recordScreen || !normUid || classStartedAt === null) return;
    return startScreenRecorder({
      uid: normUid,
      meeting,
      classStartedAt,
      // Same derivation the telemetry writers use, so a chunk's exercise_id
      // lines up exactly with the decision-table rows beside it.
      currentExerciseId: () => activeExerciseId(useWorkspaceStore.getState()),
    });
    // Values, not the session object: the object used to be rebuilt on every
    // 15-second refresh, and each rebuild restarted rrweb with a full-DOM
    // snapshot, which is why a replay looked like it started over on every
    // chunk.
  }, [recordScreen, normUid, classStartedAt, meeting]);

  // Meeting 8, 8.10 of the 28.9.2026 audit: a learner whose reflection is
  // already saved — on the server, or waiting in the offline queue on this
  // device — is done (PRD Module 16 §ג, "כפתור סיום מפגש סופי"). The
  // finished state is saved with the workspace, so this only acts
  // when that state did not land before a reload — the board is not shown again
  // over a reflection the rules will not let anyone overwrite.
  useEffect(() => {
    if (isTeacherOrAdmin || sessionNumber !== 8 || flowStatus !== 'reflection') return;
    let cancelled = false;
    hasSavedSRLReflection(currentStudentUid()).then((saved) => {
      if (saved && !cancelled) useWorkspaceStore.getState().finishReflection();
    });
    return () => {
      cancelled = true;
    };
  }, [isTeacherOrAdmin, sessionNumber, flowStatus]);

  // The learner's own RTDB listener re-runs initialisation when the gate
  // opens; there is no separate task list to poll for any more (tasks come
  // from the session banks per learning path, never from a per-learner node).

  // Distance stays 0-delay (drag still starts the instant the pointer moves
  // past the threshold, per PRD Module 5's "immediate" requirement) but 6px
  // was tight enough that an intended click/tap — especially a child's
  // less-precise tap, or ordinary mouse/trackpad jitter — regularly crossed
  // it. Once dnd-kit's distance constraint activates it swallows the click
  // event for that gesture (see AbstractPointerSensor.handleStart in
  // @dnd-kit/core), so the intended click action never ran and the drag
  // itself usually resolved to a no-op or, worse, a delete (see
  // handleDragEnd below) — that's the "click vs. drag conflict" / stuck
  // feeling. 10px is still effectively instant but meaningfully more
  // forgiving of natural jitter.
  // Unified PointerSensor: seamlessly supports mouse, trackpad, touchscreen,
  // and stylus across all devices and operating systems without delay.
  // 6px threshold allows immediate pickup without competing TouchSensor conflicts.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions && pointerCollisions.length > 0) {
      // Prioritize specific columns and trash over the full board container
      const specific = pointerCollisions.find(
        (c) => String(c.id).startsWith('column-') || c.id === 'trash'
      );
      return specific ? [specific] : pointerCollisions;
    }
    // rectIntersection only matches a droppable the dragged block's rect
    // actually overlaps. closestCenter used to sit here instead, but it has
    // no distance cutoff — it always names *some* "nearest" droppable even
    // while the pointer is nowhere near the board (still over the palette,
    // mid-transit, etc.), which lit up the wrong column and popped the trash
    // lid open with nothing near it, and could even route a drop that far
    // away to that bogus target on release.
    const rectCollisions = rectIntersection(args);
    if (rectCollisions && rectCollisions.length > 0) {
      const specific = rectCollisions.find(
        (c) => String(c.id).startsWith('column-') || c.id === 'trash'
      );
      return specific ? [specific] : rectCollisions;
    }
    return [];
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { source: DragSource; place: Place; renderPlace?: Place } | undefined;
    if (data) setActiveDrag({ place: data.place, source: data.source, renderPlace: data.renderPlace });

    // Semantic Event Injection. dnd-kit calls this handler BEFORE it commits
    // the drag (setStatus / dispatch DragStart run after onDragStart in the
    // same batch), so anything thrown here leaves the block sitting on the
    // palette with no drag and no error the learner can see. Telemetry is a
    // side record of the drag, never a precondition for it.
    try {
      const studentId = useAuthStore.getState().user?.uid;
      if (studentId && data) {
        const s = useWorkspaceStore.getState();
        const task = getActiveTasks(s)[s.standardTaskIdx] || null;
        useStore.getState().logSemanticEvent(studentId, {
          action: 'drag_started',
          element: data.source === 'palette' ? 'palette_block' : `${data.place}_block`,
          context: 'User picked up a block',
          ...(task?.targetNode ? { q_matrix_node: task.targetNode } : {}),
          state_snapshot: `Units: ${s.counts.units}, Tens: ${s.counts.tens}, Hundreds: ${s.counts.hundreds}, Thousands: ${s.counts.thousands}`
        });
      }
    } catch (err) {
      console.error('[StudentWorkspacePage] drag_started telemetry failed (drag continues):', err);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const data = event.active.data.current as { source: DragSource; place: Place } | undefined;
    const over = event.over?.data.current as { kind: 'column'; place: Place } | { kind: 'trash' } | { kind: 'board' } | undefined;
    if (!data) return;
    
    if (!over) {
      return;
    }

    // Same rule as handleDragStart: a failure inside the drop's own telemetry
    // must surface in the console, not as a block that silently refuses to
    // land — the learner cannot tell a rejected drop from a broken one.
    try {
      if (over.kind === 'trash') {
        applyDrop({
          source: data.source,
          sourcePlace: data.place,
          target: { kind: 'trash' },
        });
        return;
      }

      if (over.kind === 'board') {
        // Smart Routing: dropping anywhere on the numbers house routes block to its designated column
        applyDrop({
          source: data.source,
          sourcePlace: data.place,
          target: { kind: 'column', place: data.place },
        });
        return;
      }

      // A block dragged right breaks apart where it was let go, not back in
      // its own column (owner, 7.10.2026): the child sees the trade happen
      // under the hand that made it.
      const dropped = event.active.rect.current.translated;
      setRegroupOrigin(dropped ? { x: dropped.left + dropped.width / 2, y: dropped.top + dropped.height / 2 } : null);
      applyDrop({
        source: data.source,
        sourcePlace: data.place,
        target: { kind: 'column', place: over.place },
      });
    } catch (err) {
      console.error('[StudentWorkspacePage] drop failed:', err);
    } finally {
      setRegroupOrigin(null);
    }
  };

  // WP6 / Chaos Scenario 2: Soft Device Lock (נעילת מכשיר רכה — active_device_id);
  // isSupersededByOtherDevice is read above, beside the recorder that also needs it.

  useEffect(() => {
    if (activeClassSession.isLoaded && activeClassSession.active && activeClassSession.sessionNumber) {
      const activeNum = Number(activeClassSession.sessionNumber);
      if (activeNum >= 1 && activeNum <= 8 && activeNum !== meeting && !isTeacherOrAdmin) {
        navigate(`/workspace?meeting=${activeNum}`, { replace: true });
      }
    }
  }, [activeClassSession.isLoaded, activeClassSession.active, activeClassSession.sessionNumber, meeting, isTeacherOrAdmin, navigate]);

  // The child is locked out here with no other cue: the screen's own words get a
  // read-aloud button (PRD 7 §א; register, 15.9.2026 — every child state screen
  // carries one), on the child's click only. The cloud stays in the corner
  // (PRD 17 §ד): work may still wait in this device's queue. Its z-[60] is above
  // the lock's z-50.
  if (isSupersededByOtherDevice) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-6 font-body text-center" dir="rtl">
        <CornerCloudSyncStatus />
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center text-3xl shadow-inner">
            📱
          </div>
          <h2 className="font-display font-black text-xl text-slate-900 dark:text-white">
            המשכתם במכשיר אחר
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            הפעילות שלכם פתוחה עכשיו במכשיר אחר. המסך הזה נעול כדי לשמור על העבודה שלכם.
          </p>
          <UdlSpeechButton text="המשכתם במכשיר אחר. הפעילות שלכם פתוחה עכשיו במכשיר אחר. המסך הזה נעול כדי לשמור על העבודה שלכם." />
        </div>
      </div>
    );
  }


  // The teacher’s three controls (Module 14 / register 7: start, pause,
  // close) and projector mode (Module 15) reach the learner live, in place —
  // on every screen. They used to render only under the task board, so a
  // learner on the choice screen, the reflection or the "well done" screen
  // saw nothing when the teacher paused, closed or projected.
  const classStateOverlays = (
    <>
      <AnimatePresence>
        {isProjectorModeActive && <ProjectorWaitingScreen />}
      </AnimatePresence>
      <AnimatePresence>
        {activeClassSession.status === 'paused' && !isTeacherOrAdmin && <SessionPausedOverlay />}
      </AnimatePresence>
      <AnimatePresence>
        {activeClassSession.status === 'closed' && !isTeacherOrAdmin && activeClassSession.isLoaded && (
          <SessionClosedOverlay
            meeting2Unfinished={isMeeting2CloseUnfinished({
              meeting,
              isTeacherOrAdmin,
              isGateApproved,
              workspaceOnMeeting2: isInitialized && sessionNumber === 2,
              flowStatus,
              qflowPhase,
              recordLoaded: firebaseLoaded,
              record: { completedMeeting2, qMatrixResults: myData?.qMatrixResults },
            })}
          />
        )}
      </AnimatePresence>
    </>
  );

  // An approved learner completed part-way by the teacher's close (waitingAfterApproval).
  if (waitingAfterApproval) {
    return <><TeacherWillOpenWaitingScreen />{classStateOverlays}</>;
  }

  // A meeting that has not started because the learner waits for an approved
  // path (Module 26; owner, 28.9.2026) shows the waiting screen, not whatever
  // the previous meeting left in the store — its end screen or choice screen.
  // The meeting starts, and this screen goes, when the approval and the path
  // arrive (runInit above).
  if (pendingApproval && !isInitialized) {
    return <>{showMeeting2Waiting ? <><Meeting2WaitingScreen /><CornerCloudSyncStatus /></> : <TeacherWillOpenWaitingScreen />}{classStateOverlays}</>;
  }

  // Module 14: Post-Mandatory Tasks Choice Point (Reinforcement vs Challenge)
  if (flowStatus === 'choice_branch') {
    return (
      <>
        <ReinforcementOrChallengeScreen
          onSelectBranch={(branch) => {
            useWorkspaceStore.getState().selectBranch(branch);
          }}
          onSkipToFinish={() => {
            useWorkspaceStore.getState().finishMeetingEarly();
          }}
        />
        {classStateOverlays}
      </>
    );
  }

  // Meeting 8 ends on the reflection board (Module 16 §א), and only meeting 8:
  // owner decision E2 (27.9.2026) gives meetings 3–7 one closing sentence and
  // no board, and meetings 1–2 nothing. A 'reflection' in any other meeting can
  // only be a snapshot older code saved (restoreSession already turns it into
  // 'sessionDone'); it is shown as the finished meeting it is.
  // After every hook so React's hook order stays stable.
  const endScreen = flowStatus === 'reflection' && sessionNumber !== 8 ? 'sessionDone' : flowStatus;
  if (endScreen === 'reflection') {
    {
      // Meeting 8's own U, E and G, counted from the events the server counts
      // (E1). They choose the stage-3 sentence and are saved for the teacher.
      const { undos: undoCount, wrongDigits: errorCount, wrongOptions: guessCount } = meetingPersistence;

      return <>
        <Session8ReflectionScreen
        metrics={{
          fastestTaskType: 'כפל פי 10 ו-100',
          slowestTaskType: 'כפל פי 20 ו-30',
          undoCount,
          errorCount,
          guessCount
        }}
        onComplete={async (result) => {
          // מודול 16: הרפלקציה נשמרת. הקריאה הקודמת כאן כתבה את רמת המאמץ
          // לתוך routeRecommendation — שדה צבע המסלול שהמורה רואה — וגם
          // דרסה את routeStatus ל-'PENDING', כלומר ביטלה את החלטת השער.
          const outcome = await submitSRLReflection(currentStudentUid(), result);
          if (!outcome.ok) {
            // Not even stored in the offline queue on this device (Module 17
            // holds everything else): the board stays on step 3 with the same
            // answers, the button works again, and the board itself tells the
            // child what to do, under the button, with a read-aloud button
            // (REFLECTION_TEXT_HE.notSaved). Ending the meeting here would lose
            // the reflection for good behind "העבודה נשמרה בבטחה".
            return false;
          }
          // In the offline queue, which sends it and removes it only on the
          // server's Ack: the reflection is safe, and the child is done —
          // "כפתור סיום מפגש סופי" (Module 16 §ג).
          // The learner stays here, on the quiet end screen. Sending them to the
          // lobby sent them straight back into meeting 8 — still open — and the
          // board started again at step 1 (audit 8.10).
          useWorkspaceStore.getState().finishReflection();
          return true;
        }}
      />
        <CornerCloudSyncStatus />
        {classStateOverlays}
      </>;
    }
  }

  // Module 20 §ב: finishing the diagnostic meeting lands on the waiting screen.
  // The learner cannot go anywhere from here — the teacher's gate approval and
  // the opening of meeting 3 are both hers. The screen listens for the
  // approval and returns the learner to the lobby the moment it lands.
  if (endScreen === 'sessionDone' && sessionNumber === 2 && !isGateApproved) {
    return <><Meeting2WaitingScreen onApproved={() => navigate('/hub')} /><CornerCloudSyncStatus />{classStateOverlays}</>;
  }

  // Module 14: Session complete screen. In meetings 3–7 it carries the one
  // closing sentence of owner decision E2, chosen by this meeting's own
  // persistence index (E1): the sentence and its read-aloud button, and
  // nothing else — no number, no board, no question. Meetings 1 and 2 have
  // no sentence; meeting 8 has its own on the reflection board.
  //
  // One praise, one sentence: every closing sentence already opens with
  // "כל הכבוד", so where it is shown the heading only says which station is
  // done (and the end toast carries no praise either, useWorkspaceStore).
  //
  // Meeting 8 reaches this screen from its reflection board, whose last step
  // already said "כל הכבוד": the heading only says which station is done. It is
  // the last station, so there is no "next station" line.
  //
  // Read-aloud: meetings 3–7 carry the closing sentence's own button and nothing
  // more (E2). Meetings 1, 2 and 8 had no button at all; there one button beside
  // the heading reads the screen's lines (PRD 7 §א; register, 15.9.2026), on the
  // child's click only. The ✓ is not spoken.
  if (endScreen === 'sessionDone') {
    const withClosingSentence = hasClosingSentence(sessionNumber);
    const afterReflection = sessionNumber === 8;
    const endScreenSpeech = afterReflection
      ? `סיימתם את תחנה ${sessionNumber}! העבודה נשמרה בבטחה.`
      : `כל הכבוד, מתמטיקאים! סיימתם את תחנה ${sessionNumber}! העבודה נשמרה בבטחה. ${teacherSentenceHe('nextStation', teacherGender)}`;
    const endScreenSpeechButton = withClosingSentence ? null : (
      <UdlSpeechButton text={endScreenSpeech} className="shrink-0" />
    );
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body p-6 animate-in fade-in duration-300">
        <div className="bg-ws-surface p-10 rounded-3xl shadow-2xl max-w-md w-full text-center border-2 border-ws-surface2 space-y-6">
          <div className="text-6xl animate-bounce motion-essential">🎉✨</div>
          {withClosingSentence || afterReflection ? (
            <div className="flex items-center justify-center gap-3">
              <h1 className="text-3xl font-display font-black text-ws-ink">
                סיימתם את תחנה {sessionNumber}!
              </h1>
              {endScreenSpeechButton}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-3">
                <h1 className="text-3xl font-display font-black text-ws-ink">
                  כל הכבוד, מתמטיקאים!
                </h1>
                {endScreenSpeechButton}
              </div>
              <p className="text-base text-ws-soft leading-relaxed">
                סיימתם את תחנה {sessionNumber}!
              </p>
            </>
          )}
          <ClosingSentence sessionNumber={sessionNumber} counts={meetingPersistence} />
          <div className="pt-4 flex flex-col gap-2">
            <div className="inline-flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 text-sm">
              <span>העבודה נשמרה בבטחה</span>
              <span>✓</span>
            </div>
            {!afterReflection && (
              <p className="text-xs text-ws-soft">{teacherSentenceHe('nextStation', teacherGender)}</p>
            )}
          </div>
        </div>
        <CornerCloudSyncStatus />
        {classStateOverlays}
      </div>
    );
  }

  // Not started yet: never the workspace with what the previous meeting left in the store.
  if (isInitializing || !isInitialized) {
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body">
        <div className="animate-spin text-4xl mb-4">⏳</div>
        <h2 className="text-xl font-bold">טוענים את התרגילים שלכם...</h2>
      </div>
    );
  }

  // Teacher switched to another meeting: brief quiet transition indicator while URL syncs
  if (!isTeacherOrAdmin && activeClassSession.isLoaded && isTeacherSessionActive && Number(activeClassSession?.sessionNumber) !== meeting) {
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body">
        <div className="animate-spin text-4xl mb-4">⏳</div>
        <h2 className="text-xl font-bold text-ws-ink">עוברים לתחנה {activeClassSession?.sessionNumber}...</h2>
      </div>
    );
  }

  // With the class-state screens, like every other waiting screen above: a
  // learner waiting here used to see nothing when the teacher paused, closed
  // or projected.
  if (pendingApproval) {
    return showMeeting2Waiting
      ? <><Meeting2WaitingScreen onApproved={() => setPendingApproval(false)} /><CornerCloudSyncStatus />{classStateOverlays}</>
      : <><TeacherWillOpenWaitingScreen />{classStateOverlays}</>;
  }

  // Stations 2 and 8, before their first task: one text, its read-aloud button
  // and "מתחילים" (owner, 27.9.2026). Once pressed it does not return, not even
  // after a reload (openingScreenSeen travels with the saved workspace).
  if (hasOpeningScreen(sessionNumber) && meeting === sessionNumber && endScreen === 'task' && !openingScreenSeen) {
    return <><StationOpening meeting={sessionNumber} onStart={markOpeningScreenSeen} />{classStateOverlays}</>;
  }

  return (
    // מצב שקט חזותי חייב לכסות גם את framer-motion, לא רק כיתות CSS:
    // מסכי ההמתנה (המורה השהתה / סגרה, מצב מקרן) מנפישים ב-repeat: Infinity
    // דרך סגנון מוטבע, והמשיכו לפעום מול ילד שהמורה סימנה כרגיש חושית.
    // 'always' מכבה תנועת תמרה וגודל ומשאיר מעברי שקיפות רגועים.
    <MotionConfig reducedMotion={isASDMode ? 'always' : 'user'}>
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div
      dir="rtl"
      // מסמך העיצוב §1.3 ("מצב שקט חזותי"): המורה כבר מסמנת רגישות חושית
      // בתנאי הלמידה, אבל הסימון הזה לא השפיע על שום דבר במסך הילד. כאן
      // הוא מכבה את התנועה הדקורטיבית — פעימות, ריצודים והבהובים — בלי
      // לגעת בתנועה שמלמדת (היד המנחה, חגיגת הסיום), שמסומנת
      // motion-essential.
      data-quiet={isASDMode ? 'true' : undefined}
      // Module 15 §ב: under the projector, pause or close screen the workspace
      // is kept as it is and takes no focus, typing or keyboard drag.
      inert={isClassScreenUp || undefined}
      className="h-[100dvh] w-full overflow-hidden font-body text-ws-ink flex flex-col relative bg-ws-bg"
    >
      {/* Flat vector background shapes — playful world energy, zero visual noise.
            These were animated (animate-breathe) AND blended (mix-blend-multiply).
            A continuous transform animation on this full-viewport layer forced the
            compositor to repaint the whole region every frame, and the blend mode
            made that repaint uncacheable — together they roughly halved the frame
            rate (measured 60fps -> ~30fps, 2 -> 60+ janky frames per 180). On a
            laptop that surfaced as the drag "not lifting", the flicker on pickup,
            and the cursor lagging from arrow to grab. The shapes are decorative at
            5% opacity, so they stay exactly as they look — just static and
            unblended, which restores a smooth 60fps and makes block dragging
            responsive again. */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-indigo-500/5" />
          <div className="absolute -bottom-32 -right-20 w-[380px] h-[380px] rounded-full bg-teal-500/5" />
          <div className="absolute top-[30%] right-[42%] w-16 h-16 rounded-2xl rotate-12 bg-blue-500/5" />
        </div>

        <WorkspaceTopbar isDragging={activeDrag !== null} />

        {/* Main 50/50 workspace (or centered in Session 2 & 8) */}
        <main className={`flex flex-row flex-1 overflow-hidden p-fl-10-20 gap-fl-10-20 max-w-[1600px] mx-auto w-full box-border ${(sessionNumber === 2 || sessionNumber === 8) ? 'justify-center items-center' : ''}`}>
          {/* Task card */}
          <div className={`flex-1 min-h-0 min-w-0 flex flex-col ${(sessionNumber === 2 || sessionNumber === 8) ? 'max-w-3xl flex-none h-auto max-h-full' : ''}`}>
            <TaskCard />
          </div>

          {/* Place-value board (hidden/unmounted in Session 2 and Session 8) */}
          {sessionNumber !== 2 && sessionNumber !== 8 && (
            <PlaceValueBoard activeDragPlace={activeDrag?.place ?? null} shareRow={isSocraticPanelOpen || isAdditionGridSlotShown} />
          )}

          {/* Module 10 (register decision ב): the addition grid fades in over 2s
              and stays until the learner closes it with the X. It has its own
              slot in this row, beside the board, so it covers nothing the
              learner works with (Module 10 §ב: blocks, typing and regrouping
              go on while it is open). AnimatePresence here lets the exit
              animation play after the store closes it. */}
          {isAdditionBoardEnabled && (
            <AnimatePresence>
              {isAdditionGridMounted && (
                <AdaptiveAdditionGrid key="adaptive-grid" hidden={!isAdditionGridShown} overCard={isAdditionGridOverCard} />
              )}
            </AnimatePresence>
          )}
          {/* מסמך 03 §1.3 ב' / 04 §1 (register deviation 18): a learner may bring
              back an aid that faded. The tab sits where the grid itself appears,
              not in the topbar — מסמך 04 §3א keeps the topbar to "כפתורי ניווט
              בסיסיים ושקטים". isAdditionBoardEnabled already restricts this to
              enhanced_cognitive_support learners in sessions 3–7. It is here
              also while the coaching card is open: the grid's place, beside
              the card. */}
          {isAdditionGridTabShown && <AdditionGridTab />}

          {/* מסמך 03 / 04 §א: the Socratic card is a side panel that slides out
              from the side of the screen (the left edge in RTL) and keeps the
              exercise fully visible. It is part of this row, so it can never
              cover the sheet, the board or the result row. */}
          <SocraticSidePanel />
        </main>

        {/* Meetings with the number house show the feedback in the task column (TaskCard). */}
        {(sessionNumber === 2 || sessionNumber === 8) && <FeedbackToast />}
        <HelpOverlays />
        <StudentChatOverlay />

      </div>

      {/* Module 15 projector, teacher pause and teacher close (register 7):
          wait in place, board untouched underneath. המורה סגרה את המפגש.
          Outside the workspace, which is inert while they are up: their
          read-aloud buttons must still work. The quiet mode still reaches
          them (a display: contents wrapper adds no box). */}
      <div data-quiet={isASDMode ? 'true' : undefined} className="contents">
        {classStateOverlays}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="pointer-events-none scale-105 rotate-1 opacity-95 filter drop-shadow-[0_16px_32px_rgba(0,0,0,0.3)] select-none">
            <DienesBlock id="drag-overlay" place={activeDrag.renderPlace ?? activeDrag.place} source={activeDrag.source} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
    </MotionConfig>
  );
}
