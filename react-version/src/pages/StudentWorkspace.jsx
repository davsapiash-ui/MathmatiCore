import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useSession } from '../contexts/SessionContext';
import usePlaceValueModel from '../hooks/usePlaceValueModel';
import useSilentRadar from '../hooks/useSilentRadar';
import useSessionRecorder from '../hooks/useSessionRecorder';
import DroppableColumn from '../components/DroppableColumn';
import DraggableBlock from '../components/DraggableBlock';
import UdlMathModule from '../components/udl/UdlMathModule';
import { syncTraceData } from '../lib/firebase';

// MOCK TASK SEQUENCE
const TASK_SEQUENCE = [
  { id: 'task1_zero_placeholder', description: 'גרור בלוקים כדי ליצור את המספר 104' },
  { id: 'task2_basic_addition', description: 'חבר עשרת אחת ללוח' },
  { id: 'task3_estimation', description: 'הערך כמה יחידות חסרות כדי להגיע ל-200?' }
];

export default function StudentWorkspace() {
  const { studentUser, logout } = useSession();
  const navigate = useNavigate();
  const { counts, PLACE_ORDER, PLACE_NAMES_HE, addBlock, ungroupBlock, setValues } = usePlaceValueModel();

  const [activeId, setActiveId] = useState(null);
  const [activePlace, setActivePlace] = useState(null);
  const [isASDMode, setIsASDMode] = useState(false);

  // Task Sequence State
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [qMatrixResults, setQMatrixResults] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Require auth
  useEffect(() => {
    if (!studentUser) {
      navigate('/', { replace: true });
    } else {
      setValues({ units: 4, tens: 0, hundreds: 1, thousands: 0 }); // Init for Task 1 (104)
    }
  }, [studentUser, navigate, setValues]);

  // Hook up Silent Radar (Tracks hesitation and undo clicks in background)
  const { traceData, hasInteracted, resetTimer, registerUndo } = useSilentRadar(studentUser?.id);
  
  // Hook up Session Recorder (Telemetry)
  const { events: recordedEvents, clearRecording, recordCustomEvent } = useSessionRecorder(true, 150);

  const handleDragStart = (event) => {
    resetTimer();
    const { active } = event;
    setActiveId(active.id);
    setActivePlace(active.data.current?.place);
    recordCustomEvent('dragstart', { id: active.id, place: active.data.current?.place });
  };

  const handleDragEnd = (event) => {
    resetTimer();
    const { active, over } = event;
    setActiveId(null);
    setActivePlace(null);

    if (!over) {
      recordCustomEvent('dragend', { id: active.id, status: 'cancelled' });
      return;
    }

    const fromPlace = active.data.current?.place;
    const toPlace = over.data.current?.place;
    recordCustomEvent('dragend', { id: active.id, from: fromPlace, to: toPlace });

    if (!fromPlace || !toPlace) return;

    // Regrouping logic (moving block between columns)
    if (fromPlace !== toPlace) {
      const fromIdx = PLACE_ORDER.indexOf(fromPlace);
      const toIdx = PLACE_ORDER.indexOf(toPlace);

      if (toIdx === fromIdx - 1) {
        // Dragging right (larger to smaller, e.g. 1 ten to units). Ungroup it!
        ungroupBlock(fromPlace);
      } else if (toIdx === fromIdx + 1) {
        // Dragging left (smaller to larger, e.g. units to tens). Group if 10!
        if (counts[fromPlace] >= 10) {
          setValues({
            ...counts,
            [fromPlace]: counts[fromPlace] - 10,
            [toPlace]: counts[toPlace] + 1
          });
        } else {
          alert(`אי אפשר להמיר. צריך 10 ${PLACE_NAMES_HE[fromPlace]} כדי ליצור 1 ${PLACE_NAMES_HE[toPlace]}.`);
        }
      }
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActivePlace(null);
  };

  const handleProceed = () => {
    // 1. Record Q-Matrix result based on current state (Mock logic)
    const currentTask = TASK_SEQUENCE[currentTaskIndex];
    const newQMatrix = {
      ...qMatrixResults,
      [currentTask.id]: true // Mocking a 'true' success result for now
    };
    setQMatrixResults(newQMatrix);

    // 2. Log full Trace Data and QMatrix payload and Sync to Firebase
    const enrichedTraceData = { ...traceData, events: recordedEvents };
    console.log("[Data Payload to Backend]:", {
      studentId: studentUser?.id,
      qMatrixResults: newQMatrix,
      traceData: enrichedTraceData
    });
    
    syncTraceData(studentUser?.id, newQMatrix, enrichedTraceData);
    
    clearRecording(); // Reset for next task

    // 3. Advance to next task
    if (currentTaskIndex < TASK_SEQUENCE.length - 1) {
      setCurrentTaskIndex(prev => prev + 1);
      // Reset blocks for next mock task
      setValues({ units: 0, tens: 0, hundreds: 0, thousands: 0 });
    } else {
      alert("סיימת את כל המשימות! כל הכבוד.");
    }
  };

  if (!studentUser) return null;

  const currentTask = TASK_SEQUENCE[currentTaskIndex];

  return (
    <div className={`workspace-container ${isASDMode ? 'asd-active' : ''}`} dir="rtl">
      {/* Background Orbs */}
      <div className="bg-orb bg-orb-1" aria-hidden="true"></div>
      <div className="bg-orb bg-orb-2" aria-hidden="true"></div>

      <header className="workspace-header">
        <div className="student-info">
          <h2>שלום, {studentUser.name}</h2>
          <span className="task-badge">משימה {currentTaskIndex + 1} מתוך {TASK_SEQUENCE.length}</span>
        </div>
        <div className="workspace-controls">
          <label className="asd-toggle">
            <input 
              type="checkbox" 
              checked={isASDMode} 
              onChange={(e) => setIsASDMode(e.target.checked)} 
              aria-label="הפעלת סינון הסחות (ASD)"
            />
            <span className="asd-toggle-label">מיקוד מסך (ASD)</span>
          </label>
          <button className="logout-btn" onClick={logout} aria-label="יציאה מהמערכת">התנתק</button>
        </div>
      </header>

      <main className="workspace-main" style={{ paddingBottom: '100px' }}>
        <div className="bg-primary/10 text-primary-foreground p-6 rounded-2xl mb-8 border border-primary/20 shadow-sm text-center">
          <h3 className="text-xl font-semibold">{currentTask?.description}</h3>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="pv-columns-row">
            {PLACE_ORDER.slice().reverse().map(place => (
              <DroppableColumn 
                key={place}
                place={place}
                label={PLACE_NAMES_HE[place]}
                count={counts[place]}
                isASDMode={isASDMode}
                isActive={activePlace === place}
              />
            ))}
          </div>

          <DragOverlay>
            {activeId ? (
              <DraggableBlock id="overlay" place={activePlace} isOverlay={true} />
            ) : null}
          </DragOverlay>
        </DndContext>

        <div style={{ marginTop: '40px', borderTop: '1px solid var(--glass-border)', paddingTop: '40px' }}>
          <UdlMathModule 
            onInteract={resetTimer} 
            onUndo={registerUndo}
          />
        </div>
      </main>

      <footer className="workspace-footer fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t border-border p-4 flex justify-between items-center z-50">
        <div className="math-controls">
          <button className="btn-action btn-group bg-muted text-foreground px-4 py-2 rounded-md hover:bg-muted/80" onClick={() => addBlock('units', true)}>
            קבץ 10 יחידות
          </button>
        </div>
        <button 
          className={`btn-proceed px-6 py-2 rounded-md font-bold transition-all ${!hasInteracted ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50' : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg'}`}
          disabled={!hasInteracted}
          onClick={handleProceed}
          title={!hasInteracted ? 'עליך לבצע אינטראקציה תחילה כדי להתקדם' : 'התקדם למשימה הבאה'}
        >
          התקדם למשימה הבאה
        </button>
      </footer>
    </div>
  );
}
