import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

export default function DraggableBlock({ id, place, isOverlay }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id,
    data: { place }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    // Add specific block styling here based on CSS
  };

  const blockClass = `pv-block block-${place} ${isDragging ? 'dragging' : ''} ${isOverlay ? 'overlay' : ''}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={blockClass}
      aria-label={`בלוק של ${place}`}
    >
    </div>
  );
}
