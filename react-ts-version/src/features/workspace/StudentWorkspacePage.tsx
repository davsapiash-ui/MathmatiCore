import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
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
import { database, authReady } from '@/infrastructure/firebase';
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

import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { GraphicOrganizerHint } from './overlays/GraphicOrganizerHint';
import { useCognitiveHesitationRadar } from '@/application/useCognitiveHesitationRadar';
import { tts } from '@/infrastructure/services/TTSService';

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

  const [audioUnlocked, setAudioUnlocked] = useState(() => tts.isAudioUnlocked());

  // PRD V2.0 Section 7 NFR: Pre-fetch Socratic hints upon loading to guarantee <200ms latency
  useEffect(() => {
    SocraticEngine.prefetchSessionHints(sessionNumber);
  }, [sessionNumber]);



  // --- Active Teacher Class Session Listener ---
  const activeClassSession = useActiveClassSession();
  const isTeacherSessionActive = activeClassSession?.active ?? false;

  const [teacherHint, setTeacherHint] = useState<string | null>(null);
  const normUid = normalizeStudentId(user?.uid || '');

  useEffect(() => {
    if (!normUid) return;
    const hintRef = ref(database, `users/students/${normUid}/teacher_hint`);
    const unsub = onValue(hintRef, (snap) => {
      if (snap.exists()) {
        const hintData = snap.val();
        if (hintData && hintData.message) {
          setTeacherHint(hintData.message);
        }
      }
    });
    return () => unsub();
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
    const unsub = onValue(boardRef, (snap) => {
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
    });
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
    
    const unsubscribe = onValue(overrideRef, (snapshot) => {
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
    });

    return () => unsubscribe();
  }, [user?.uid, myData?.physicalOverrideActive, myData?.physicalOverride]);

  useEffect(() => {
    if (isInitialized) return;
    let cancelled = false;

    const runInit = async () => {
      if (meeting === 3) {
        setIsInitializing(true);
        try {
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
            initSession(meeting, isASDMode, tasks || null, 0);
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
          initSession(meeting, isASDMode, null, 0);
        }
        setIsInitialized(true);
        setIsInitializing(false);
      }
    };

    if (firebaseLoaded) {
      runInit();
    } else {
      // Grace period of 300ms for Firebase to sync, otherwise initialize from local state to never block the student
      const timer = setTimeout(() => {
        if (!cancelled && !isInitialized) {
          runInit();
        }
      }, 300);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
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

  // All 5 diagnostic tasks done → reflection (icons, no numeric grades).
  // After every hook so React's hook order stays stable.
  if (flowStatus === 'reflection') {
    if (sessionNumber === 8) {
      return <Session8ReflectionScreen 
        metrics={{ fastestTaskType: 'כפל פי 10 ו-100', slowestTaskType: 'כפל פי 20 ו-30' }}
        onComplete={async (focusArea) => {
          if (user?.uid) {
            try {
              await firebaseSyncService.syncRouteRecommendation(user.uid, focusArea);
              navigate('/hub');
            } catch (err: any) {
              const errMsg = String(err?.message || err);
              if (errMsg.includes('PERMISSION_DENIED') || errMsg.includes('auth')) {
                alert('פג תוקף ההתחברות שלך (PERMISSION_DENIED). עליך להתחבר מחדש.');
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

  const highestCompleted = myData?.highestCompletedMeeting ?? (myData?.completedMeeting2 ? 2 : 0);
  const isMatchingSessionActive =
    meeting === 1 ||
    highestCompleted >= meeting - 1 ||
    (isTeacherSessionActive && activeClassSession?.sessionNumber ? meeting <= Number(activeClassSession.sessionNumber) : false);

  if (!isMatchingSessionActive) {
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body p-6">
        <div className="bg-ws-surface p-10 rounded-3xl shadow-xl max-w-md text-center border border-ws-surface2">
          <div className="text-6xl mb-6 animate-pulse">🔒🧑‍🏫</div>
          <h2 className="text-2xl font-bold mb-4 text-ws-ink">מפגש {meeting} אינו פתוח כעת</h2>
          <p className="text-ws-soft mb-8 leading-relaxed">
            {isTeacherSessionActive
              ? `המורה מפעיל/ה כעת בכיתה את מפגש ${activeClassSession?.sessionNumber}. עליך להמתין שהמורה יבחר ויפעיל את מפגש ${meeting} בדשבורד המורה.`
              : 'המורה עדיין לא הפעיל/ה את השיעור בכיתה. סביבת הלימוד תיפתח אוטומטית ברגע שהמורה יפעיל את השיעור בדשבורד המורה.'}
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
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body p-6">
        <div className="bg-ws-surface p-10 rounded-3xl shadow-xl max-w-md text-center border border-ws-surface2">
          {networkError ? (
            <>
              <div className="text-5xl mb-6 animate-pulse">📡⚠️</div>
              <h2 className="text-2xl font-bold mb-4 text-rose-600">שגיאת תקשורת ברשת</h2>
              <p className="text-ws-soft mb-8 leading-relaxed">
                לא ניתן להתחבר לשרת לבדיקת אישור המורה עבור מפגש 3. 
                מטעמי אבטחה ופדגוגיה, הגישה למשימות חסומה עד לחידוש החיבור לרשת.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl transition-all shadow-md mb-3 cursor-pointer"
              >
                🔄 נסה להתחבר מחדש
              </button>
              <button 
                onClick={() => navigate('/hub')}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-2xl transition-all cursor-pointer"
              >
                חזרה לעמוד הראשי
              </button>
            </>
          ) : (
            <>
              <div className="text-5xl mb-6">🧑‍🏫</div>
              <h2 className="text-2xl font-bold mb-4 text-ws-ink">המורה בודק את המסלול שלך</h2>
              <p className="text-ws-soft mb-8">
                סיימת את שלב האבחון בהצלחה! כעת, המורה עובר על התוצאות ומאשר את המשימות המותאמות במיוחד עבורך. אפשר לחזור מאוחר יותר.
              </p>
              <button 
                onClick={() => navigate('/hub')}
                className="w-full py-4 bg-ws-accent text-white font-bold rounded-2xl hover:brightness-105 transition-all"
              >
                חזרה לעמוד הראשי
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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

        {!audioUnlocked && (
          <div className="bg-blue-600/90 text-white px-5 py-2.5 text-sm flex items-center justify-between font-bold z-40 max-w-[1600px] mx-auto w-full rounded-2xl mb-2 shadow-md backdrop-blur-sm" dir="rtl">
            <span className="flex items-center gap-2">
              <span className="text-xl">🔊</span>
              <span>להפעיל את הקראת ההוראות הקולית, לחצו על הכפתור:</span>
            </span>
            <button
              onClick={() => {
                tts.initializeAudioGate();
                setAudioUnlocked(true);
              }}
              className="bg-white hover:bg-slate-100 text-blue-700 px-5 py-1.5 rounded-xl font-black text-sm transition-all shadow cursor-pointer active:scale-95"
            >
              בואו נתחיל! 🎧
            </button>
          </div>
        )}

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
        
        {aiSocraticHint && (useSettingsStore.getState().autoShowHints || useWorkspaceStore.getState().helpState !== 'closed') && (
          <GraphicOrganizerHint 
            hint={aiSocraticHint} 
            onClose={() => useWorkspaceStore.setState({ aiSocraticHint: null, helpState: 'closed' })}
            onSelectOption={(id) => {
              const state = useWorkspaceStore.getState();
              if (state.keyboardState === 'SOCRATIC_ONLY') {
                if (!(aiSocraticHint as any).correctChoiceId || (aiSocraticHint as any).correctChoiceId === id) {
                  state.unlockKeyboard();
                }
              }
            }}
          />
        )}

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

      <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeDrag ? (
          // 15% smaller than the old 1.10 per user request — the dragged block must not dwarf the board
          <div className="scale-[0.93] rotate-2 opacity-90 drop-shadow-2xl">
            <DienesBlock id="drag-overlay" place={activeDrag.renderPlace ?? activeDrag.place} source={activeDrag.source} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
