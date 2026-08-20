import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  rectIntersection,
  useSensor,
  useSensors,
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
import { ref, push, onValue, remove, get, set, update } from 'firebase/database';
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
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
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
import { ProjectorWaitingScreen } from '@/presentation/components/student/ProjectorWaitingScreen';
import { ReinforcementOrChallengeScreen } from './overlays/ReinforcementOrChallengeScreen';

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



  // --- Active Teacher Class Session Listener ---
  const activeClassSession = useActiveClassSession();
  const isTeacherSessionActive = activeClassSession?.active ?? false;

  const [teacherHint, setTeacherHint] = useState<string | null>(null);
  const [isProjectorModeActive, setIsProjectorModeActive] = useState<boolean>(false);
  const normUid = normalizeStudentId(user?.uid || '');

  const lastProjectorTimestampRef = useRef<number>(0);

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

  useEffect(() => {
    if (!normUid) return;
    const myDevId = currentDeviceIdRef.current;
    const myClaimTime = Date.now();
    useWorkspaceStore.getState().setActiveDeviceId(myDevId);
    useWorkspaceStore.getState().setSupersededByOtherDevice(false);

    // 1. Claim ownership of student session for this device
    update(ref(database, `users/students/${normUid}`), {
      active_device_id: myDevId,
      device_claimed_at: myClaimTime,
    }).catch(console.error);

    // 2. Real-time listener: Detect if a NEWER device took over ownership
    const studentNodeRef = ref(database, `users/students/${normUid}`);
    const unsubDevice = onValue(
      studentNodeRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          const remoteDevId = val?.active_device_id;
          const remoteClaimTime = val?.device_claimed_at || 0;

          // Only lock if another newer device explicitly claimed ownership after our claim
          if (remoteDevId && remoteDevId !== myDevId && remoteClaimTime > myClaimTime) {
            useWorkspaceStore.getState().setSupersededByOtherDevice(true);
            canvasRecorder.stopRecording().catch(console.error);
          } else if (remoteDevId === myDevId) {
            useWorkspaceStore.getState().setSupersededByOtherDevice(false);
          }
        }
      },
      (err) => {
        console.warn('[StudentWorkspacePage] deviceRef listener notice:', err);
      }
    );

    return () => unsubDevice();
  }, [normUid]);

  const handleAcknowledgeHint = async () => {
    setTeacherHint(null);
    if (normUid) {
      remove(ref(database, `users/students/${normUid}/teacher_hint`)).catch(console.error);
    }
    if (user?.uid && user.uid !== normUid) {
      remove(ref(database, `users/students/${user.uid}/teacher_hint`)).catch(console.error);
    }

    let resolvedTeacherId: string = '039604483'; // default fallback
    try {
      const studentSnap = await get(ref(database, `users/students/${normUid}`));
      const classId = studentSnap.val()?.classId;
      if (classId) {
        const classSnap = await get(ref(database, `classes/${classId}`));
        const fbTeacherId = classSnap.val()?.teacherId;
        if (fbTeacherId && typeof fbTeacherId === 'string') resolvedTeacherId = fbTeacherId;
      }
    } catch (e) {
      console.error(e);
    }

    const chatStore = useChatStore.getState();
    chatStore.sendMessage(normUid, (user as any)?.name || (user as any)?.displayName || 'תלמיד', resolvedTeacherId, `ראיתי את הרמז ("${teacherHint}"). תודה!`);
    
    setTeacherHint(null);
  };

  const [activeDrag, setActiveDrag] = useState<{ place: Place; source: DragSource; renderPlace?: Place } | null>(null);

  // הרדאר השקט — covert monitoring for the teacher dashboard; nothing student-visible.

  // Session done (meeting 4 end) → back to the hub.
  // NOTE: qMatrixResults/traceData are written ONCE, at the right moment — the
  // ReflectionScreen at the end of meeting 2. A second write here used wrong result
  // keys with correct=true defaults and silently overwrote real diagnostics — removed.
  useEffect(() => {
    if (flowStatus === 'sessionDone') {
      navigate('/hub');
    }
  }, [flowStatus, navigate]);

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

  // --- RRWeb Telemetry Recording (Gated by Active Teacher Class Session) ---
  useEffect(() => {
    let stopRecording: (() => void) | undefined;
    let eventsQueue: any[] = [];
    let flushInterval: any;
    let cancelled = false;

    const uid = normUid;
    const rawUid = user?.uid;
    if (!uid || !isTeacherSessionActive || !activeClassSession) return;

    // Use teacher's active session timestamp as the unified session ID
    const sessionId = `session_${activeClassSession.startedAt}`;

    // Save session metadata under student profile
    const sessionMeta = { 
      latestTelemetrySessionId: sessionId, 
      activeSessionNumber: activeClassSession.sessionNumber,
      lastActive: Date.now() 
    };
    update(ref(database, `users/students/${uid}`), sessionMeta).catch(console.error);
    if (rawUid && rawUid !== uid) {
      update(ref(database, `users/students/${rawUid}`), sessionMeta).catch(console.error);
    }

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
            sessionNumber: activeClassSession.sessionNumber,
          };

          update(ref(database, `users/students/${uid}/telemetry_sessions/${sessionId}/metadata`), {
            [chunkKey]: metaPayload
          }).catch(console.error);

          if (rawUid && rawUid !== uid) {
            const rawChunkRef = ref(database, `users/students/${rawUid}/telemetry_sessions/${sessionId}/chunks/${chunkKey}`);
            set(rawChunkRef, payload).catch(console.error);
            update(ref(database, `users/students/${rawUid}/telemetry_sessions/${sessionId}/metadata`), {
              [chunkKey]: metaPayload
            }).catch(console.error);
          }
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
          // PRD V2.0 Section 7: Milestone Telemetry requirement - strip continuous coordinate streaming
          // Source 2 in rrweb IncrementalSnapshot represents MouseMove
          if (event && event.type === 3 && event.data && event.data.source === 2) {
            return;
          }
          eventsQueue.push(event);
        },
        sampling: {
          mousemove: false,
          mouseInteraction: false,
          scroll: 500,
          input: 'last',
        }
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
  }, [user?.uid, normUid, isTeacherSessionActive, activeClassSession]);

  // Pedagogical Radar — active during student sessions per PRD v4.2 Modules 10 & 12
  useCognitiveHesitationRadar({ 
    isActive: true,
    onHesitationDetected: () => {
      const ws = useWorkspaceStore.getState();
      if (ws.flowStatus === 'task') {
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
  const myData = user?.uid ? (students[user.uid] || students[normalizeStudentId(user.uid)]) : null;
  const isASDMode = myData?.isASD ?? localIsASD;

  // --- PRD Section 4.5: Gate Locked Limbo State Guard ---
  useEffect(() => {
    if (myData?.routeStatus === 'GATE_LOCKED') {
      setNetworkError(false); // Teacher lock, not a network error
      setPendingApproval(true);
    } else if (pendingApproval && myData?.routeStatus === 'APPROVED' && !networkError) {
      setPendingApproval(false);
    }
  }, [myData?.routeStatus, pendingApproval, networkError]);

  // Reset initialization when meeting changes
  useEffect(() => {
    setIsInitialized(false);
  }, [meeting]);

  // Real-time additionBoardEnabled listener
  const [liveAdditionBoardEnabled, setLiveAdditionBoardEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    const boardRef = ref(database, `users/students/${uid}/additionBoardEnabled`);
    const unsub = onValue(
      boardRef,
      (snap) => {
        if (snap.exists()) {
          const val = Boolean(snap.val());
          setLiveAdditionBoardEnabled(val);
          useStore.setState((s) => {
            if (s.students[uid]) {
              return {
                students: {
                  ...s.students,
                  [uid]: {
                    ...s.students[uid],
                    additionBoardEnabled: val,
                  },
                },
              };
            }
            return s;
          });
        }
      },
      (err) => {
        console.warn('[StudentWorkspacePage] boardRef listener notice:', err);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  const isAdditionBoardEnabled = liveAdditionBoardEnabled ?? (myData?.additionBoardEnabled ?? false);

  // --- PRD Section 4.5: Physical Override Listener and Teardown Pipeline ---
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    const normId = normalizeStudentId(uid);
    
    const overrideRef = ref(database, `users/students/${normId}/physicalOverrideActive`);
    let previousOverrideState = false;
    
    const unsubscribe = onValue(
      overrideRef,
      (snapshot) => {
        const isOverrideActive = snapshot.val() === true || myData?.physicalOverrideActive === true || myData?.physicalOverride === true;
        
        // When override is activated, immediately unlock keyboard for student
        if (isOverrideActive && !previousOverrideState) {
          useWorkspaceStore.getState().unlockKeyboard();
        }

        // Listen for transition from TRUE to FALSE (Teardown)
        if (previousOverrideState && !isOverrideActive) {
          console.log("Physical Override Teardown: Cleanup Pipeline triggered.");
          const store = useWorkspaceStore.getState();
          // 1. Restart hesitation timer by toggling keyboard state
          store.lockKeyboard();
          // 2. Validate current block state against target state (VRA Bridge).
          store.proceed(); 
        }
        
        previousOverrideState = isOverrideActive;
      },
      (err) => {
        console.warn('[StudentWorkspacePage] overrideRef listener notice:', err);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, myData?.physicalOverrideActive, myData?.physicalOverride]);

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

          const isAllowedMeeting3 = teacherSessionAllowsMeeting3 || (highestCompleted >= 2 && routeStatus === 'APPROVED' && Boolean(tasks));

          // If prerequisite completion or active teacher session requirement is not met, lock and show waiting screen
          if (!isAllowedMeeting3) {
            setPendingApproval(true);
            setIsInitialized(true);
            setIsInitializing(false);
            return;
          }

          const canRestore = myData?.workspaceState?.sessionNumber === meeting && myData?.workspaceState?.flowStatus === 'task';
          if (canRestore && myData?.workspaceState) {
            restoreSession(myData.workspaceState);
          } else {
            const localSaved = firebaseSyncService.getLocalSessionProgress(normId || username);
            if (localSaved && localSaved.sessionNumber === meeting && localSaved.flowStatus === 'task') {
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
        const canRestore = myData?.workspaceState?.sessionNumber === meeting && myData?.workspaceState?.flowStatus === 'task';
        if (canRestore && myData?.workspaceState) {
          restoreSession(myData.workspaceState);
        } else {
          const localSaved = firebaseSyncService.getLocalSessionProgress(normUid || user?.uid || '');
          if (localSaved && localSaved.sessionNumber === meeting && localSaved.flowStatus === 'task') {
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
      if (cached && cached.sessionNumber === meeting && cached.flowStatus === 'task') {
        restoreSession(cached);
        setIsInitialized(true);
        setIsInitializing(false);
      } else {
        // Extended grace period for Firebase to sync so server progress is never prematurely overwritten
        const timer = setTimeout(() => {
          if (!cancelled && !isInitialized) {
            runInit();
          }
        }, 1500);
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 8 } })
  );

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
    if (!data || !over) return;
    applyDrop({
      source: data.source,
      sourcePlace: data.place,
      target: over.kind === 'trash' ? { kind: 'trash' } : { kind: 'column', place: over.place },
    });
  };

  // WP6 / Chaos Scenario 2: Soft Device Lock (נעילת מכשיר רכה — active_device_id)
  const isSupersededByOtherDevice = useWorkspaceStore((s) => s.isSupersededByOtherDevice);
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

  // Module 14: Post-7 Mandatory Tasks Choice Point (Reinforcement vs Challenge)
  if (flowStatus === 'choice_branch') {
    return (
      <ReinforcementOrChallengeScreen
        onSelectBranch={(branch) => {
          useWorkspaceStore.getState().selectBranch(branch);
        }}
        onSkipToFinish={() => {
          useWorkspaceStore.setState({ flowStatus: 'sessionDone' });
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
  


  if (isInitializing) {
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body">
        <div className="animate-spin text-4xl mb-4">⏳</div>
        <h2 className="text-xl font-bold">טוען את המשימות המותאמות שלך...</h2>
      </div>
    );
  }

  const cachedLocal = firebaseSyncService.getLocalSessionProgress(normUid || user?.uid || '');
  const hasLocalCurrentMeeting = cachedLocal?.sessionNumber === meeting;

  const highestCompleted = myData?.highestCompletedMeeting ?? (myData?.completedMeeting2 ? 2 : 0);
  const isMatchingSessionActive =
    meeting === 1 ||
    hasLocalCurrentMeeting ||
    !firebaseLoaded ||
    highestCompleted >= meeting - 1 ||
    (isTeacherSessionActive && activeClassSession?.sessionNumber ? meeting <= Number(activeClassSession.sessionNumber) : false);

  if (!isMatchingSessionActive && !isInitializing) {
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body p-6">
        <div className="bg-ws-surface p-10 rounded-3xl shadow-xl max-w-md text-center border border-ws-surface2">
          <div className="text-6xl mb-6 animate-pulse">🐝✨</div>
          <h2 className="text-2xl font-bold mb-4 text-ws-ink">מפגש {meeting} ממתין להפעלה בכיתה</h2>
          <p className="text-ws-soft mb-8 leading-relaxed">
            {isTeacherSessionActive
              ? `המורה מפעיל/ה כעת בכיתה את מפגש ${activeClassSession?.sessionNumber}. סביבת הלימוד תעבור אוטומטית ברגע שהמורה יפעיל את מפגש ${meeting}.`
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
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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

        {/* Main 50/50 workspace (or centered in Session 8) */}
        <main className={`flex flex-row flex-1 overflow-hidden p-5 gap-5 max-w-[1600px] mx-auto w-full box-border ${sessionNumber === 8 ? 'justify-center items-center' : ''}`}>
          {/* Task card */}
          <div className={`flex-1 min-h-0 min-w-0 flex flex-col ${sessionNumber === 8 ? 'max-w-3xl flex-none h-auto' : ''}`}>
            <TaskCard />
          </div>

          {/* Place-value board (left in RTL, hidden in Session 8) */}
          {sessionNumber !== 8 && (
            <PlaceValueBoard />
          )}
        </main>

        <AnimatePresence>
          {teacherHint && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border-4 border-ws-accent text-center relative"
              >
                <button 
                  onClick={handleAcknowledgeHint}
                  aria-label="סגור הודעה"
                  className="absolute top-4 left-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="text-5xl mb-4">👨‍🏫</div>
                <h2 className="text-2xl font-black font-display text-ws-ink mb-4">הודעה מהמורה</h2>
                <p className="text-xl text-ws-ink font-medium mb-8 bg-blue-50 p-6 rounded-2xl leading-relaxed">
                  "{teacherHint}"
                </p>
                <button
                  onClick={handleAcknowledgeHint}
                  className="w-full h-14 rounded-2xl bg-ws-accent text-white font-black text-xl shadow-lg hover:bg-blue-600 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  ראיתי, תודה!
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <FeedbackToast />
        <HelpOverlays />
        <StudentChatOverlay />
        
        {isAdditionBoardEnabled && (
          <div className="fixed bottom-20 left-4 z-50 flex flex-col items-end gap-2" dir="rtl">
            <AnimatePresence>
              {isAdditionHelperOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  className="mb-2 shadow-2xl"
                >
                  <AdditionHelper />
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={toggleAdditionHelper}
              className="bg-ws-accent text-white font-bold px-4 py-3 rounded-full shadow-lg hover:bg-ws-accent/90 transition-all flex items-center gap-2 border border-ws-accent/20"
            >
              <span>🧮</span>
              <span>לוח עזר לחיבור</span>
            </button>
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
