import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import type { DragSource, Place } from '@/core/placeValue';
import { useWorkspaceStore, type SessionNumber } from '@/application/useWorkspaceStore';
import { useSettingsStore } from '@/application/useSettingsStore';
import { useAuthStore } from '@/application/useAuthStore';
import { database, authReady } from '@/infrastructure/firebase';
import { ref, onValue, remove, push } from 'firebase/database';
import { getCurrentQTask, isSubtaskActive } from '@/core/qmatrixFlow';
import { PlaceValueBoard } from './board/PlaceValueBoard';

import { DienesBlock } from './board/DienesBlock';
import { WorkspaceTopbar } from './WorkspaceTopbar';
import { TaskCard } from './tasks/TaskCard';
import { FeedbackToast } from './overlays/FeedbackToast';
import { HelpOverlays } from './overlays/HelpOverlays';
import { ReflectionScreen } from './ReflectionScreen';
import { useWorkspaceRadar } from './useWorkspaceRadar';

import { StudentChatOverlay } from './overlays/StudentChatOverlay';
import { telemetryTracker } from '@/infrastructure/TelemetryTracker';

import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';

/**
 * מרחב הפעילות של התלמיד — חוויית מסך מלא ממוקדת (100vh, ללא גלילה, ללא טיימרים).
 * פריסה לפי מקור האמת הוונילי: כרטיס משימה (ימין) / טבלת ערך המקום (שמאל), 50/50.
 */
export function StudentWorkspacePage() {
  const [searchParams] = useSearchParams();
  const meetingRaw = parseInt(searchParams.get('meeting') ?? '1', 10);
  const meeting = (Number.isNaN(meetingRaw) ? 1 : Math.min(4, Math.max(1, meetingRaw))) as SessionNumber;

  const navigate = useNavigate();
  const { isASDMode } = useSettingsStore();
  const initSession = useWorkspaceStore((s) => s.initSession);
  const applyDrop = useWorkspaceStore((s) => s.applyDrop);
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const flowStatus = useWorkspaceStore((s) => s.flowStatus);
  const qflow = useWorkspaceStore((s) => s.qflow);
  const user = useAuthStore((s) => s.user);

  // Start telemetry session so the radar tracker is active
  useEffect(() => {
    if (!user?.uid) return;
    telemetryTracker.startSession(user.uid);
    return () => {
      telemetryTracker.endSession();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const hintRef = ref(database, `users/students/${user.uid}/teacher_hint`);
    const unsub = onValue(hintRef, (snap) => {
      if (snap.exists()) {
        const hintData = snap.val();
        if (hintData && hintData.message) {
          // Display the hint using the non-blocking toast
          useWorkspaceStore.getState().showFeedback({ correct: false, title: 'הודעה מהמורה', sub: hintData.message }, 5000);
          // Clear the hint so it doesn't fire again on reload
          remove(hintRef);
        }
      }
    });
    return () => unsub();
  }, [user?.uid]);

  const [activeDrag, setActiveDrag] = useState<{ place: Place; source: DragSource; renderPlace?: Place } | null>(null);

  // הרדאר השקט — covert monitoring for the teacher dashboard; nothing student-visible.
  useWorkspaceRadar(sessionNumber);

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
        useWorkspaceStore.getState().undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // RRWeb recording with batching
  useEffect(() => {
    let stopRecording: (() => void) | undefined;
    let eventsQueue: any[] = [];
    let flushInterval: any;
    let cancelled = false;

    const uid = useAuthStore.getState().user?.uid;
    if (!uid) return;
    const sessionKey = `${uid}/${Date.now()}`;

    // Load rrweb asynchronously
    (async () => {
      const [rrweb] = await Promise.all([
        import('rrweb')
      ]);

      if (cancelled) return;

      const authOk = await authReady;
      if (!authOk || cancelled) return;

      stopRecording = rrweb.record({
        emit(event) {
          eventsQueue.push(event);
        },
        sampling: {
          mousemove: false,
          mouseInteraction: true,
          scroll: 150,
          input: 'last',
        }
      });

      flushInterval = setInterval(() => {
        if (eventsQueue.length > 0) {
          const batch = [...eventsQueue];
          eventsQueue = [];
          push(ref(database, `replays/${sessionKey}`), JSON.stringify(batch)).catch(() => {});
        }
      }, 5000);
    })();

    return () => {
      cancelled = true;
      if (stopRecording) stopRecording();
      if (flushInterval) clearInterval(flushInterval);
    };
  }, []);

  // Session-2 estimation: hide the live value display during the number-line task
  // (the point is estimating magnitude, not reading a number).
  const qTask = sessionNumber === 2 ? getCurrentQTask(qflow) : null;
  const hideValueDisplay = qTask?.type === 'number_line' && !isSubtaskActive(qflow);

  // Redundant useSilentRadar removed here to prevent ghost alerts for non-students.
  // useWorkspaceRadar already handles radar tracking safely and globally.

  const [isInitializing, setIsInitializing] = useState(meeting === 3);
  const [pendingApproval, setPendingApproval] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (meeting === 3) {
      setIsInitializing(true);
      // Any failure in this async chain must NOT strand the student on the loading
      // screen — the outer .catch falls back to the standard session tasks.
      (async () => {
        if (cancelled) return;
        const username = useAuthStore.getState().user?.uid;
        if (!username) {
          initSession(meeting, isASDMode);
          setIsInitializing(false);
          return;
        }
        const tasks = await SocraticEngine.getApprovedTasks(username);
        if (cancelled) return;
        if (tasks) {
          initSession(meeting, isASDMode, tasks);
        } else {
          // Pending teacher approval — blocking screen with a way back to the hub.
          setPendingApproval(true);
        }
        setIsInitializing(false);
      })().catch(() => {
        if (cancelled) return;
        initSession(meeting, isASDMode);
        setIsInitializing(false);
      });
    } else {
      initSession(meeting, isASDMode);
      setIsInitializing(false);
    }
    return () => {
      cancelled = true;
    };
    // isASDMode intentionally not a dependency: mid-session toggling must not reset the student's work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting, initSession]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    import('./radarBus').then(({ radar }) => radar.recordAction());
    const data = event.active.data.current as { source: DragSource; place: Place; renderPlace?: Place } | undefined;
    if (data) setActiveDrag({ place: data.place, source: data.source, renderPlace: data.renderPlace });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    import('./radarBus').then(({ radar }) => radar.recordAction());
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

  if (pendingApproval) {
    return (
      <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body p-6">
        <div className="bg-ws-surface p-10 rounded-3xl shadow-xl max-w-md text-center border border-ws-surface2">
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
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-indigo-500/5 mix-blend-multiply dark:mix-blend-screen" />
          <div className="absolute -bottom-32 -right-20 w-[380px] h-[380px] rounded-full bg-teal-500/5 mix-blend-multiply dark:mix-blend-screen" />
          <div className="absolute top-[30%] right-[42%] w-16 h-16 rounded-2xl rotate-12 bg-blue-500/5 mix-blend-multiply dark:mix-blend-screen" />
        </div>

        <WorkspaceTopbar />

        {/* Main 50/50 workspace */}
        <main className="flex flex-1 overflow-hidden p-5 gap-5 max-w-[1600px] mx-auto w-full box-border">
          {/* Task card (right in RTL) */}
          <TaskCard />

          {/* Place-value board (left in RTL) */}
          <PlaceValueBoard hideValueDisplay={hideValueDisplay} />
        </main>

        <FeedbackToast />
        <HelpOverlays />
        <StudentChatOverlay />
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
