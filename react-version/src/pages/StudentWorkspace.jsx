import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useSession } from '../contexts/SessionContext';
import usePlaceValueModel from '../hooks/usePlaceValueModel';
import DroppableColumn from '../components/DroppableColumn';
import DraggableBlock from '../components/DraggableBlock';

// We need a custom draggable for the Palette that spawns NEW blocks
function PaletteBlock({ place }) {
  // Not implemented fully yet in this snippet, but acts as source
  return (
    <div className={`palette-item block-${place}`}>
      <span>+</span>
    </div>
  );
}

export default function StudentWorkspace() {
  const { studentUser, logout } = useSession();
  const navigate = useNavigate();
  const { counts, PLACE_ORDER, PLACE_NAMES_HE, addBlock, ungroupBlock, setValues } = usePlaceValueModel();

  const [activeId, setActiveId] = useState(null);
  const [activePlace, setActivePlace] = useState(null);
  const [isASDMode, setIsASDMode] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Require auth and init task
  useEffect(() => {
    if (!studentUser) {
      navigate('/', { replace: true });
    } else {
      // Mock loading first task
      setValues({ units: 4, tens: 2, hundreds: 1, thousands: 0 });
    }
  }, [studentUser, navigate, setValues]);

  const handleDragStart = (event) => {
    const { active } = event;
    setActiveId(active.id);
    setActivePlace(active.data.current?.place);
    setHasInteracted(true);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    setActivePlace(null);

    if (!over) return;

    const fromPlace = active.data.current?.place;
    const toPlace = over.data.current?.place;

    if (!fromPlace || !toPlace) return;

    // Regrouping logic (moving block between columns)
    if (fromPlace !== toPlace) {
      const fromIdx = PLACE_ORDER.indexOf(fromPlace);
      const toIdx = PLACE_ORDER.indexOf(toPlace);

      if (toIdx === fromIdx - 1) {
        // Dragging right (e.g. 1 ten to units). Ungroup it!
        ungroupBlock(fromPlace);
      }
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActivePlace(null);
  };

  if (!studentUser) return null;

  return (
    <div className={`workspace-container ${isASDMode ? 'asd-active' : ''}`} dir="rtl">
      {/* Background Orbs */}
      <div className="bg-orb bg-orb-1" aria-hidden="true"></div>
      <div className="bg-orb bg-orb-2" aria-hidden="true"></div>

      <header className="workspace-header">
        <div className="student-info">
          <h2>שלום, {studentUser.name}</h2>
          <span className="task-badge">משימה {studentUser.taskIndex + 1 || 1}</span>
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

      <main className="workspace-main">
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
      </main>

      <footer className="workspace-footer">
        <div className="math-controls">
          <button className="btn-action btn-group" onClick={() => addBlock('units', true)}>
            קבץ 10 יחידות
          </button>
        </div>
        <button 
          className="btn-proceed" 
          disabled={!hasInteracted}
          onClick={() => alert("התקדמות למשימה הבאה...")}
        >
          התקדם למשימה הבאה
        </button>
      </footer>
    </div>
  );
}
