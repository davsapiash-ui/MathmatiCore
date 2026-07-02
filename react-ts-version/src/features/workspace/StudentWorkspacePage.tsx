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

  const [activeDrag, setActiveDrag] = useState<{ place: Place; source: DragSource } | null>(null);

  // הרדאר השקט — covert monitoring for the teacher dashboard; nothing student-visible.
  useWorkspaceRadar(sessionNumber);

  // Session done (meeting 4 end) → back to the hub.
  useEffect(() => {
    if (flowStatus === 'sessionDone') {
      import('@/application/useAuthStore').then(({ useAuthStore }) => {
        const uid = useAuthStore.getState().user?.id;
        if (uid) {
          import('firebase/database').then(({ ref, update }) => {
            import('@/infrastructure/firebase').then(({ database }) => {
              const state = useWorkspaceStore.getState();
              // Q-Matrix (assuming all false for now, or based on qflow data if populated)
              const qData = {
                task1_zero_placeholder: state.qflow.results['task1']?.correct ?? true,
                task2_estimation_error_margin: 0,
                task3_flexible_regrouping: state.qflow.results['task3']?.correct ?? true,
                task4_basic_addition_fluency: state.qflow.results['task4']?.correct ?? true,
                task5_basic_subtraction_fluency: state.qflow.results['task5']?.correct ?? true
              };
              const traceData = {
                hesitation_events: 0, // Should be populated by radar, but schema requires numbers
                undo_clicks: state.undoCount || 0
              };
              update(ref(database), {
                [`qMatrixResults/${uid}`]: qData,
                [`traceData/${uid}`]: traceData
              });
            });
          });
        }
      });
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

  // Session-2 estimation: hide the live value display during the number-line task
  // (the point is estimating magnitude, not reading a number).
  const qTask = sessionNumber === 2 ? getCurrentQTask(qflow) : null;
  const hideValueDisplay = qTask?.type === 'number_line' && !isSubtaskActive(qflow);

  useEffect(() => {
    initSession(meeting, isASDMode);
    // isASDMode intentionally not a dependency: mid-session toggling must not reset the student's work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting, initSession]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { source: DragSource; place: Place } | undefined;
    if (data) setActiveDrag({ place: data.place, source: data.source });
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
    return <ReflectionScreen />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div dir="rtl" className="h-screen w-full overflow-hidden bg-ws-bg font-body text-ws-ink flex flex-col">
        <WorkspaceTopbar />

        {/* Main 50/50 workspace */}
        <main className="flex flex-1 overflow-hidden p-5 gap-5 max-w-[1600px] mx-auto w-full">
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
          <div className="scale-110 rotate-2 opacity-90 drop-shadow-2xl">
            <DienesBlock id="drag-overlay" place={activeDrag.place} source={activeDrag.source} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
