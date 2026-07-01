import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import DraggableBlock from './DraggableBlock';

export default function DroppableColumn({ place, count, label, isASDMode, isActive }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `column-${place}`,
    data: { place }
  });

  const columnClass = `pv-column ${place}-col ${isOver ? 'drag-over' : ''} ${isASDMode && !isActive ? 'asd-dimmed' : ''}`;

  return (
    <div className={columnClass} data-place={place} aria-label={`טור ${label}`}>
      <div className="pv-col-header">
        <span className="pv-col-title">{label}</span>
      </div>
      <div ref={setNodeRef} className="pv-drop-zone">
        {Array.from({ length: count }).map((_, i) => (
          <DraggableBlock 
            key={`${place}-${i}`} 
            id={`${place}-block-${i}`} 
            place={place} 
            isOverlay={false} 
          />
        ))}
      </div>
      <div className="pv-count-badge">{count}</div>
    </div>
  );
}
