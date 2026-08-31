import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
import { useWorkspaceStore, getActiveTasks, type SessionNumber } from '@/application/useWorkspaceStore';
import { useSettingsStore } from '@/application/useSettingsStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useActiveClassSession } from '@/application/useActiveClassSession';
import { database, authReady, fetchServerClockOffset } from '@/infrastructure/firebase';
import { ref, push, onValue, remove, get, set, update, onDisconnect } from 'firebase/database';
import { useChatStore, normalizeStudentId } from '@/application/useChatStore';
import { motion, AnimatePresence } from 'framer-motion';
import { PlaceValueBoard } from './board/PlaceValueBoard';

import { DienesBlock } from './board/DienesBlock';
import { WorkspaceTopbar } from './WorkspaceTopbar';
import { TaskCard } from './tasks/TaskCard';
import { FeedbackToast } from './overlays/FeedbackToast';
import { HelpOverlays } from './overlays/HelpOverlays';
import { ReflectionScreen } from './ReflectionScreen';
import { Session8ReflectionScreen } from '@/presentation/components/student/Session8ReflectionScreen';
import { firebaseSyncService, emitTelemetry } from '@/infrastructure/services/FirebaseSyncService';
import { useStore } from '@/application/useStore';
import { X } from 'lucide-react';

import { StudentChatOverlay } from './overlays/StudentChatOverlay';
import { AdditionHelper } from './board/AdditionHelper';
import { canvasRecorder } from '@/infrastructure/services/CanvasRecorderService';

import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { useCognitiveHesitationRadar } from '@/application/useCognitiveHesitationRadar';
import { tts } from '@/infrastructure/services/TTSService';
import { toast } from 'sonner';
import { BeeFlightWaitingScreen } from '@/presentation/components/student/BeeFlightWaitingScreen';
import { hasEnhancedSupport as hasEnhancedSupportProfile } from '@/core/supportProfile';
import { ProjectorWaitingScreen } from '@/presentation/components/student/ProjectorWaitingScreen';
import { ReinforcementOrChallengeScreen } from './overlays/ReinforcementOrChallengeScreen';

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
 * מרחב הפעילות של התלמיד — חוויית מסך מלא ממוקדת (100vh, ללא גלילה, ללא טיימרים).
 * פריסה לפי מקור האמת הוונילי: כרטיס משימה (ימין) / טבלת ערך המקום (שמאל), 50/50.
 */
export function StudentWorkspacePage() {
  const [searchParams] = useSearchParams();
  const meetingRaw = parseInt(searchParams.get('meeting') ?? '1', 10);
  const meeting = (Number.isNaN(meetingRaw) ? 1 : Math.min(8, Math.max(1, meetingRaw))) as SessionNumber;

  const navigate = useNavigate();
  const { isASDMode: localIsASD } = useSettingsStore();
  const initSession = useWorkspaceStore((s) => s.initSession);
  const restoreSession = useWorkspaceStore((s) => s.restoreSession);
  const applyDrop = useWorkspaceStore((s) => s.applyDrop);
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const flowStatus = useWorkspaceStore((s) => s.flowStatus);
  const aiSocraticHint = useWorkspaceStore((s) => s.aiSocraticHint);
  const user = useAuthStore((s) => s.user);

  // PRD V2.0 Section 7 NFR: Pre-fetch Socratic hints upon loading to guarantee <200ms latency
  useEffect(() => {
    SocraticEngine.prefetchSessionHints(sessionNumber);
  }, [sessionNumber]);



  const counts = useWorkspaceStore((s) => s.counts);
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const carryDigits = useWorkspaceStore((s) => s.carryDigits);
  const undoCount = useWorkspaceStore((s) => s.undoCount);
  const hesitationCount = useWorkspaceStore((s) => s.hesitationCount);

  // --- Active Teacher Class Session Listener ---
  const activeClassSession = useActiveClassSession();
  const isTeacherSessionActive = activeClassSession?.active ?? false;
  const teacherSessionNum = isTeacherSessionActive ? Number(activeClassSession?.sessionNumber) || 1 : null;

  const [isProjectorModeActive, setIsProjectorModeActive] = useState<boolean>(false);
  const effectiveStudentId = user?.uid || (user?.id as string) || (user?.student_id ? `student_user${user.student_id}` : '') || 'student_user1';
  const normUid = normalizeStudentId(effectiveStudentId);
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

    // 1. Claim ownership of student session for this device
    update(ref(database, `users/students/${normUid}`), {
      active_device_id: myDevId,
      device_claimed_at: myClaimTime,
    }).catch(console.error);

    // 2. Real-time listener: Detect if another device took over ownership in DB
    const studentNodeRef = ref(database, `users/students/${normUid}`);
    const unsubDevice = onValue(
      studentNodeRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          const remoteDevId = val?.active_device_id;

          // Direct ownership check: if the active device recorded in DB is not me, I am locked
          const ownership = evaluateDeviceOwnership(remoteDevId, myDevId);
          if (ownership.isSuperseded) {
            isSupersededRef.current = true;
            useWorkspaceStore.getState().setSupersededByOtherDevice(true);
            canvasRecorder.stopRecording().catch(console.error);
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
        }
      },
      (err) => {
        console.warn('[StudentWorkspacePage] deviceRef listener notice:', err);
      }
    );

    return () => unsubDevice();
  }, [normUid]);

  const [activeDrag, setActiveDrag] = useState<{ place: Place; source: DragSource; renderPlace?: Place } | null>(null);

  // הרדאר השקט — covert monitoring for the teacher dashboard; nothing student-visible.

  // Session done (meeting 4 end) → back to the hub.
  // NOTE: qMatrixResults/traceData are written ONCE, at the right moment — the
  // ReflectionScreen at the end of meeting 2. A second write here used wrong result
  // keys with correct=true defaults and silently overwrote real diagnostics — removed.
  // Keyboard: Enter = proceed (outside inputs), Ctrl/Cmd+Z = undo (vanilla app.js 1412–1416).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (e.key === 'Enter' && !inInput) {
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
        const studentId = normalizeStudentId(useAuthStore.getState().user?.uid || '');
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

  // Enforce strict alignment with active teacher broadcast (PRD Module 14 & 20)
  useEffect(() => {
    if (!activeClassSession.isLoaded) return;
    if (!isTeacherSessionActive) {
      navigate('/hub');
      return;
    }
    if (teacherSessionNum && meeting !== teacherSessionNum) {
      navigate(`/workspace?meeting=${teacherSessionNum}`);
    }
  }, [activeClassSession.isLoaded, isTeacherSessionActive, teacherSessionNum, meeting, navigate]);

  // Sync workspace state and vector replays continuously to Firebase RTDB
  useEffect(() => {
    const uid = normUid;
    if (!canWriteWorkspaceData(uid, isSupersededRef.current)) return;

    const totalBlocks = (counts.units || 0) + (counts.tens || 0) + (counts.hundreds || 0) + (counts.thousands || 0);
    const hasInteracted = totalBlocks > 0 || Object.values(answerDigits || {}).some(Boolean);

    const wsPayload: any = {
      'workspaceState/counts': counts,
      'workspaceState/answerDigits': answerDigits,
      'workspaceState/carryDigits': carryDigits,
      'workspaceState/undoCount': undoCount,
      'workspaceState/hesitationCount': hesitationCount,
      'workspaceState/hasInteracted': hasInteracted,
      'workspaceState/sessionNumber': meeting,
      'workspaceState/flowStatus': flowStatus,
      lastActivityTimestamp: Date.now(),
      lastPing: Date.now(),
      lastAction: `פעילות בלוח במפגש ${meeting}`,
    };

    update(ref(database, `users/students/${uid}`), wsPayload).catch(() => {});
  }, [normUid, counts, answerDigits, carryDigits, undoCount, hesitationCount, meeting, flowStatus]);

  // --- RRWeb Telemetry Recording (Authentic High-Definition Screen Capture) ---
  useEffect(() => {
    let stopRecording: (() => void) | undefined;
    let eventsQueue: any[] = [];
    let flushInterval: any;
    let cancelled = false;

    const uid = normUid;
    if (!uid) return;

    // Use active class session timestamp or fallback to current student session start
    const sessionTs = activeClassSession?.startedAt || Date.now();
    const effectiveSessionNum = activeClassSession?.sessionNumber || meeting || 1;
    const sessionId = `session_${sessionTs}`;

    // Save session metadata under student profile
    const sessionMeta = { 
      latestTelemetrySessionId: sessionId, 
      activeSessionNumber: effectiveSessionNum,
      lastActive: Date.now() 
    };
    update(ref(database, `users/students/${uid}`), sessionMeta).catch(console.error);

    const flushTelemetry = () => {
      if (eventsQueue.length > 0) {
        const batch = [...eventsQueue];
        eventsQueue = [];
        
        const newChunkRef = push(ref(database, `users/students/${uid}/telemetry_sessions/${sessionId}/chunks`));
        const chunkKey = newChunkRef.key;
        if (chunkKey) {
          const payload = JSON.stringify(batch);
          set(newChunkRef, payload).catch(err => console.error('Telemetry push failed:', err));
          
          const metaPayload = {
            startTime: batch[0].timestamp,
            endTime: batch[batch.length - 1].timestamp,
            sessionNumber: effectiveSessionNum,
          };

          update(ref(database, `users/students/${uid}/telemetry_sessions/${sessionId}/metadata`), {
            [chunkKey]: metaPayload
          }).catch(console.error);
        }
      }
    };

    // Load rrweb asynchronously
    (async () => {
      const [rrweb] = await Promise.all([import('rrweb')]);
      if (cancelled) return;

      const authOk = await authReady;
      if (!authOk || cancelled) return;

      const rrwebAny = rrweb as any;
      const recordFn = rrweb.record || (rrwebAny.default && rrwebAny.default.record) || rrwebAny;
      if (typeof recordFn !== 'function') {
        console.error('rrweb.record is not a function:', rrweb);
        return;
      }

      stopRecording = recordFn({
        emit(event: any) {
          eventsQueue.push(event);
        },
        sampling: {
          mousemove: 50,
          mouseInteraction: true,
          scroll: 150,
          input: 'last',
        },
        recordCanvas: true,
        collectFonts: true,
        inlineStylesheet: true,
      });

      flushInterval = setInterval(flushTelemetry, 2000);
      window.addEventListener('beforeunload', flushTelemetry);
    })();

    return () => {
      cancelled = true;
      if (stopRecording) stopRecording();
      if (flushInterval) clearInterval(flushInterval);
      window.removeEventListener('beforeunload', flushTelemetry);
      flushTelemetry();
    };
  }, [user?.uid, normUid, isTeacherSessionActive, activeClassSession, meeting]);

  // Pedagogical Radar — active during student sessions per PRD v4.2 Modules 10 & 12
  useCognitiveHesitationRadar({ 
    isActive: true,
    onHesitationDetected: () => {
      const ws = useWorkspaceStore.getState();
      const currentTask = ws.sessionNumber === 2 ? null : getActiveTasks(ws)[ws.standardTaskIdx];
      const isSandbox = currentTask?.id === 's1_sandbox_controlled' || currentTask?.type === 'session1_intro';
      if (ws.flowStatus === 'task' && !isSandbox) {
        ws.setKeyboardSocratic();
      }
    }
  });
  const [isInitializing, setIsInitializing] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const isAdditionHelperOpen = useWorkspaceStore((s) => s.isAdditionHelperOpen);
  const toggleAdditionHelper = useWorkspaceStore((s) => s.toggleAdditionHelper);

  // Retrieve saved progress from Firebase (synced into useStore)
  const students = useStore((s) => s.students);
  const firebaseLoaded = useStore((s) => s.firebaseLoaded);
  const myData = normUid ? (students[normUid] || (user?.uid ? students[user.uid] : null)) : null;
  const isASDMode = myData?.isASD ?? localIsASD;

  // --- PRD Section 4.5 & Module 20: Gate Locked / Pending Approval Guard ---
  useEffect(() => {
    const isApproved = Boolean(myData?.teacher_gate_approved === true || myData?.routeStatus === 'APPROVED');
    const isSession2Done = Boolean(myData?.session_2_completed || myData?.completedMeeting2 || (myData as any)?.session_02_completed);
    const isAwaitingGate = meeting === 3 && (myData?.routeStatus === 'GATE_LOCKED' || myData?.routeStatus === 'PENDING_TEACHER_APPROVAL' || isSession2Done) && !isApproved;

    if (myData?.routeStatus === 'GATE_LOCKED' || isAwaitingGate) {
      setNetworkError(false); // Teacher lock, not a network error
      setPendingApproval(true);
    } else if (pendingApproval && isApproved && !networkError) {
      setPendingApproval(false);
    }
  }, [myData?.routeStatus, myData?.teacher_gate_approved, myData?.session_2_completed, myData?.completedMeeting2, meeting, pendingApproval, networkError]);

  // Reset initialization when meeting changes
  useEffect(() => {
    setIsInitialized(false);
  }, [meeting]);

  // Real-time additionBoardEnabled & teacher adaptations listener (bound to canonical normUid)
  const [liveAdditionBoardEnabled, setLiveAdditionBoardEnabled] = useState<boolean | null>(null);
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

          // Direct lock / unlock sync from teacher
          const isLocked = val.workspaceState?.isBoardLocked ?? val.isBoardLocked;
          if (isLocked !== undefined && isLocked !== useWorkspaceStore.getState().isBoardLocked) {
            useWorkspaceStore.setState({ isBoardLocked: Boolean(isLocked) });
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
                  pedagogicalPath: val.pedagogicalPath || existing.pedagogicalPath,
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
          if (canWriteWorkspaceData(normUid, isSupersededRef.current)) {
            update(studentRef, { forceReload: null, isOnline: false, lastPing: 0 }).catch(() => {});
          } else {
            update(studentRef, { forceReload: null }).catch(() => {});
          }
          useWorkspaceStore.getState().resetWorkspace?.();
          firebaseSyncService.clearLocalSessionProgress(normUid);
          if (user?.uid) firebaseSyncService.clearLocalSessionProgress(user.uid);
          window.location.href = '/hub';
        }
      }
    });
    return () => unsub();
  }, [normUid]);

  // --- Module 18: Live Presence Heartbeat & Session Sync (5s interval, 60s server window) ---
  useEffect(() => {
    if (!normUid) return;
    const studentPresenceRef = ref(database, `users/students/${normUid}`);
    
    const presencePayload = {
      isOnline: true,
      lastPing: Date.now(),
      lastActivityTimestamp: Date.now(),
      hasJoinedSession: true,
      sessionJoined: true,
      lastAction: `פעיל/ה במפגש ${meeting}`,
      'workspaceState/sessionNumber': meeting,
      'workspaceState/isASD': Boolean(isASDMode),
      'workspaceState/flowStatus': 'task',
    };

    // Set immediate online heartbeat and onDisconnect hook
    update(studentPresenceRef, presencePayload).catch(() => {});
    try {
      onDisconnect(ref(database, `users/students/${normUid}/isOnline`)).set(false);
      onDisconnect(ref(database, `users/students/${normUid}/onlineStatus`)).set('offline');
      onDisconnect(ref(database, `users/students/${normUid}/lastPing`)).set(0);
      onDisconnect(ref(database, `users/students/${normUid}/lastAction`)).set('לא מחובר');
    } catch {
      // ignore offline mock disconnect
    }

    const handleBeforeUnload = () => {
      if (canWriteWorkspaceData(normUid, isSupersededRef.current)) {
        update(studentPresenceRef, { isOnline: false, onlineStatus: 'offline', lastPing: 0, lastAction: 'לא מחובר' }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    const interval = setInterval(() => {
      if (!canWriteWorkspaceData(normUid, isSupersededRef.current)) return;

      update(studentPresenceRef, {
        isOnline: true,
        onlineStatus: 'active',
        lastPing: Date.now(),
        lastActivityTimestamp: Date.now(),
        hasJoinedSession: true,
        lastAction: `פעיל/ה במפגש ${meeting}`,
        'workspaceState/sessionNumber': meeting,
      }).catch(() => {});
    }, 4000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      if (canWriteWorkspaceData(normUid, isSupersededRef.current)) {
        update(studentPresenceRef, { isOnline: false, onlineStatus: 'offline', lastPing: 0, lastAction: 'לא מחובר' }).catch(() => {});
      }
    };
  }, [normUid, meeting, isASDMode]);

  // PRD v7.1 Module 10: Load adaptive addition grid strictly and only when the
  // authoritative support profile is 'enhanced_cognitive_support' (shared
  // contract in core/supportProfile.ts, honoring the legacy boolean on live
  // records). No manual teacher toggle during a live session. For every other
  // learner the grid must not mount, render or exist in the DOM.
  const hasEnhancedSupport = hasEnhancedSupportProfile(user as Record<string, unknown> | null) ||
    hasEnhancedSupportProfile(myData as Record<string, unknown> | null);
  const isAdditionBoardEnabled = hasEnhancedSupport && sessionNumber !== 2 && sessionNumber !== 8;


  useEffect(() => {
    if (isInitialized) return;
    let cancelled = false;

    const runInit = async () => {
      if (meeting === 3) {
        setIsInitializing(true);
        try {
          // תרחיש 1 — שעון עקום: קריאת offset שרת פעם אחת לפני כל חישוב deadline
          await fetchServerClockOffset();

          const username = useAuthStore.getState().user?.uid;
          const activeSessionNum = isTeacherSessionActive ? (Number(activeClassSession?.sessionNumber) || 1) : null;
          const teacherSessionAllowsMeeting3 = isTeacherSessionActive && activeSessionNum !== null && activeSessionNum >= 3;

          if (!username) {
            if (!teacherSessionAllowsMeeting3) {
              setPendingApproval(true);
              setIsInitialized(true);
              setIsInitializing(false);
              return;
            }
            initSession(meeting, isASDMode, null, 0);
            setIsInitialized(true);
            setIsInitializing(false);
            return;
          }
          const normId = normalizeStudentId(username);
          const tasks = (await SocraticEngine.getApprovedTasks(username)) || (await SocraticEngine.getApprovedTasks(normId));
          if (cancelled) return;

          const routeStatus = myData?.routeStatus;
          const highestCompleted = myData?.highestCompletedMeeting ?? (myData?.completedMeeting2 ? 2 : 0);

          const isAllowedMeeting3 = teacherSessionAllowsMeeting3 || (highestCompleted >= 2 && routeStatus === 'APPROVED' && Boolean(tasks)) || Boolean(myData?.physicalOverride || (myData as any)?.physicalOverrideActive);

          // If prerequisite completion or active teacher session requirement is not met, lock and show waiting screen
          if (!isAllowedMeeting3) {
            setPendingApproval(true);
            setIsInitialized(true);
            setIsInitializing(false);
            return;
          }

          const canRestore = myData?.workspaceState?.sessionNumber === meeting && Boolean(myData?.workspaceState?.flowStatus) && myData?.workspaceState?.flowStatus !== 'sessionDone';
          if (canRestore && myData?.workspaceState) {
            restoreSession(myData.workspaceState);
          } else {
            const localSaved = firebaseSyncService.getLocalSessionProgress(normId || username);
            if (localSaved && localSaved.sessionNumber === meeting && Boolean(localSaved.flowStatus) && localSaved.flowStatus !== 'sessionDone') {
              restoreSession(localSaved);
            } else {
              initSession(meeting, isASDMode, tasks || null, 0);
            }
          }
          setIsInitialized(true);
          setIsInitializing(false);
        } catch (err) {
          if (cancelled) return;
          console.error("Network or server error during Teacher Gate verification:", err);
          setNetworkError(true);
          setPendingApproval(true);
          setIsInitialized(true);
          setIsInitializing(false);
        }
      } else {
        const canRestore = myData?.workspaceState?.sessionNumber === meeting && Boolean(myData?.workspaceState?.flowStatus) && myData?.workspaceState?.flowStatus !== 'sessionDone';
        if (canRestore && myData?.workspaceState) {
          restoreSession(myData.workspaceState);
        } else {
          const localSaved = firebaseSyncService.getLocalSessionProgress(normUid || user?.uid || '');
          if (localSaved && localSaved.sessionNumber === meeting && Boolean(localSaved.flowStatus) && localSaved.flowStatus !== 'sessionDone') {
            restoreSession(localSaved);
          } else {
            initSession(meeting, isASDMode, null, 0);
          }
        }
        setIsInitialized(true);
        setIsInitializing(false);
      }
    };

    if (firebaseLoaded) {
      runInit();
    } else {
      // Check if local cache has current meeting state for instantaneous restoration
      const cached = firebaseSyncService.getLocalSessionProgress(normUid || user?.uid || '');
      if (cached && cached.sessionNumber === meeting && Boolean(cached.flowStatus)) {
        restoreSession(cached);
        setIsInitialized(true);
        setIsInitializing(false);
      } else {
        // Fast init fallback without arbitrary delay
        runInit();
      }
    }

    return () => {
      cancelled = true;
    };
  }, [meeting, firebaseLoaded, isInitialized, myData, initSession, restoreSession, isASDMode, activeClassSession, isTeacherSessionActive]);

  // Fix 5: Auto-Retry Polling when Network Error occurs
  useEffect(() => {
    let pollInterval: number | undefined;
    if (meeting === 3 && networkError && pendingApproval) {
      pollInterval = window.setInterval(async () => {
        const username = useAuthStore.getState().user?.uid;
        if (!username) return;
        try {
          const tasks = await SocraticEngine.getApprovedTasks(username);
          if (tasks) {
            clearInterval(pollInterval);
            setNetworkError(false);
            setPendingApproval(false);
            initSession(meeting, isASDMode, tasks, 0);
          }
        } catch (err) {
          console.log("Auto-poll retry failed, waiting 5s...", err);
        }
      }, 5000);
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [meeting, networkError, pendingApproval, isASDMode, initSession]);

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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } })
  );

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions && pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    return rectIntersection(args);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { source: DragSource; place: Place; renderPlace?: Place } | undefined;
    if (data) setActiveDrag({ place: data.place, source: data.source, renderPlace: data.renderPlace });

    // Semantic Event Injection
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
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const data = event.active.data.current as { source: DragSource; place: Place } | undefined;
    const over = event.over?.data.current as { kind: 'column'; place: Place } | { kind: 'trash' } | undefined;
    if (!data) return;
    
    if (!over) {
      // Releasing outside any droppable (board or trash) is treated as an
      // aborted gesture, not a delete. This used to auto-delete column
      // blocks, but that made an accidental micro-drag — e.g. a click that
      // just barely crossed the activation distance — silently destroy the
      // block instead of doing nothing. TrashZone is the one deliberate,
      // clearly-labeled way to delete by dragging; clicking a block
      // (removeBlockClick / splitBlockClick) covers the rest.
      return;
    }

    applyDrop({
      source: data.source,
      sourcePlace: data.place,
      target: over.kind === 'trash' ? { kind: 'trash' } : { kind: 'column', place: over.place },
    });
  };

  // WP6 / Chaos Scenario 2: Soft Device Lock (נעילת מכשיר רכה — active_device_id)
  const isSupersededByOtherDevice = useWorkspaceStore((s) => s.isSupersededByOtherDevice);

  const isTeacherOrAdmin = user?.role === 'teacher' || user?.role === 'admin';
  const isMatchingSessionActive =
    isTeacherOrAdmin ||
    (activeClassSession.isLoaded && isTeacherSessionActive && Number(activeClassSession?.sessionNumber) === meeting);

  useEffect(() => {
    if (activeClassSession.isLoaded && activeClassSession.active && activeClassSession.sessionNumber) {
      const activeNum = Number(activeClassSession.sessionNumber);
      if (activeNum >= 1 && activeNum <= 8 && activeNum !== meeting && !isTeacherOrAdmin) {
        navigate(`/workspace?meeting=${activeNum}`, { replace: true });
      }
    }
  }, [activeClassSession.isLoaded, activeClassSession.active, activeClassSession.sessionNumber, meeting, isTeacherOrAdmin, navigate]);

  if (isSupersededByOtherDevice) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-6 font-body text-center" dir="rtl">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center text-3xl shadow-inner">
            📱
          </div>
          <h2 className="font-display font-black text-xl text-slate-900 dark:text-white">
            המשכת במכשיר אחר
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            הפעילות שלך פתוחה כעת במכשיר אחר. מסך זה נעול באופן שקט כדי למנוע כפילויות ולשמור על הנתונים שלך.
          </p>
        </div>
      </div>
    );
  }

  // Module 15: If teacher activated Projector Mode, render serene waiting screen immediately (<1000ms)
  if (isProjectorModeActive) {
    return <ProjectorWaitingScreen />;
  }

  // Module 14: Post-Mandatory Tasks Choice Point (Reinforcement vs Challenge)
  if (flowStatus === 'choice_branch') {
    return (
      <ReinforcementOrChallengeScreen
        onSelectBranch={(branch) => {
          useWorkspaceStore.getState().selectBranch(branch);
        }}
        onSkipToFinish={() => {
          useWorkspaceStore.setState({ flowStatus: 'reflection' });
        }}
      />
    );
  }

  // All diagnostic tasks done → reflection (icons, no numeric grades).
  // After every hook so React's hook order stays stable.
  if (flowStatus === 'reflection') {
    if (sessionNumber === 8) {
      const undoCount = useWorkspaceStore.getState().undoCount || myData?.traceData?.undo_clicks || 0;
      const errorCount = (myData as any)?.errorCount || (myData as any)?.errors || 0;
      const guessCount = (myData as any)?.guessCount || (myData as any)?.distractorClicks || 0;

      return <Session8ReflectionScreen 
        metrics={{ 
          fastestTaskType: 'כפל פי 10 ו-100', 
          slowestTaskType: 'כפל פי 20 ו-30',
          undoCount,
          errorCount,
          guessCount
        }}
        onComplete={async (focusArea) => {
          if (user?.uid) {
            try {
              await firebaseSyncService.syncRouteRecommendation(user.uid, focusArea);
              navigate('/hub');
            } catch (err: any) {
              const errMsg = String(err?.message || err);
              if (errMsg.includes('PERMISSION_DENIED') || errMsg.includes('auth')) {
                toast.error('פג תוקף ההתחברות. מתחבר מחדש...');
                navigate('/login');
                return;
              }
              navigate('/hub');
            }
          } else {
            navigate('/hub');
          }
        }}
      />;
    }
    return <ReflectionScreen />;
  }

  // Module 14: Session complete screen
  if (flowStatus === 'sessionDone') {
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body p-6 animate-in fade-in duration-300">
        <div className="bg-ws-surface p-10 rounded-3xl shadow-2xl max-w-md w-full text-center border-2 border-ws-surface2 space-y-6">
          <div className="text-6xl animate-bounce">🎉✨</div>
          <h1 className="text-3xl font-display font-black text-ws-ink">
            כל הכבוד, מתמטיקאים!
          </h1>
          <p className="text-base text-ws-soft leading-relaxed">
            השלמתם את מפגש {sessionNumber} בהצלחה רבה!
          </p>
          <div className="pt-4 flex flex-col gap-3">
            <button
              onClick={() => {
                initSession(meeting, isASDMode, null, 0);
              }}
              className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-display font-extrabold text-base rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-700"
            >
              <span>תרגול נוסף בתחנה זו</span>
              <span>🔄</span>
            </button>
            <button
              onClick={() => navigate('/hub')}
              className="w-full py-3.5 bg-ws-accent text-white font-display font-extrabold text-base rounded-2xl hover:brightness-105 active:scale-95 transition-all cursor-pointer shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              <span>חזרה ללובי התלמיד</span>
              <span>🏠</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body">
        <div className="animate-spin text-4xl mb-4">⏳</div>
        <h2 className="text-xl font-bold">טוען את המשימות המותאמות שלך...</h2>
      </div>
    );
  }

  if (!isMatchingSessionActive && !isInitializing && activeClassSession.isLoaded) {
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body p-6">
        <div className="bg-ws-surface p-10 rounded-3xl shadow-xl max-w-md text-center border border-ws-surface2">
          <div className="text-6xl mb-6 animate-pulse">🐝✨</div>
          <h2 className="text-2xl font-bold mb-4 text-ws-ink">
            {isTeacherSessionActive ? `מפגש ${meeting} אינו המפגש הפעיל` : `המפגש הכיתתי סגור`}
          </h2>
          <p className="text-ws-soft mb-8 leading-relaxed">
            {isTeacherSessionActive
              ? `המורה מפעיל/ה כעת בכיתה את מפגש ${activeClassSession?.sessionNumber}.`
              : 'סביבת הלימוד ממתינה להפעלת השיעור על ידי המורה בדשבורד הכיתה.'}
          </p>
          <button 
            onClick={() => navigate('/hub')}
            className="w-full py-4 bg-ws-accent text-white font-bold rounded-2xl hover:brightness-105 transition-all cursor-pointer shadow-md"
          >
            חזרה ללובי התלמיד
          </button>
        </div>
      </div>
    );
  }

  if (pendingApproval) {
    return <BeeFlightWaitingScreen onApproved={() => setPendingApproval(false)} />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetectionStrategy} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
      dir="rtl"
      className="h-[100dvh] w-full overflow-hidden font-body text-ws-ink flex flex-col relative bg-ws-bg"
    >
      {/* Flat vector background shapes — playful world energy, zero visual noise */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden animate-breathe">
          <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-indigo-500/5 mix-blend-multiply dark:mix-blend-screen" />
          <div className="absolute -bottom-32 -right-20 w-[380px] h-[380px] rounded-full bg-teal-500/5 mix-blend-multiply dark:mix-blend-screen" />
          <div className="absolute top-[30%] right-[42%] w-16 h-16 rounded-2xl rotate-12 bg-blue-500/5 mix-blend-multiply dark:mix-blend-screen" />
        </div>

        <WorkspaceTopbar isDragging={activeDrag !== null} />

        {/* Main 50/50 workspace (or centered in Session 2 & 8) */}
        <main className={`flex flex-row flex-1 overflow-hidden p-5 gap-5 max-w-[1600px] mx-auto w-full box-border ${(sessionNumber === 2 || sessionNumber === 8) ? 'justify-center items-center' : ''}`}>
          {/* Task card */}
          <div className={`flex-1 min-h-0 min-w-0 flex flex-col ${(sessionNumber === 2 || sessionNumber === 8) ? 'max-w-3xl flex-none h-auto' : ''}`}>
            <TaskCard />
          </div>

          {/* Place-value board (hidden/unmounted in Session 2 and Session 8) */}
          {sessionNumber !== 2 && sessionNumber !== 8 && (
            <PlaceValueBoard activeDragPlace={activeDrag?.place ?? null} />
          )}
        </main>

        <FeedbackToast />
        <HelpOverlays />
        <StudentChatOverlay />
        
        {isAdditionBoardEnabled && isAdditionHelperOpen && (
          <div className="fixed bottom-6 left-6 z-50 flex flex-col items-end gap-2" dir="rtl">
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="shadow-2xl"
              >
                <AdditionHelper />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="pointer-events-none scale-105 rotate-1 opacity-95 filter drop-shadow-[0_16px_32px_rgba(0,0,0,0.3)] select-none">
            <DienesBlock id="drag-overlay" place={activeDrag.renderPlace ?? activeDrag.place} source={activeDrag.source} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
