import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { PLACE_VALUES, PLACE_NAMES_HE, type Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { DienesBlock } from './DienesBlock';
import { TrashZone } from './TrashZone';

interface PaletteItem {
  place: Place;
  labelHe: string;
  subHe: string;
  scale: number;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { place: 'units', labelHe: 'יחידה', subHe: '1', scale: 1 },
  { place: 'tens', labelHe: 'עשרת', subHe: '10', scale: 1 },
  { place: 'hundreds', labelHe: 'מאה', subHe: '100', scale: 0.95 },
  { place: 'thousands', labelHe: 'אלף', subHe: '1,000', scale: 0.75 },
];

function PaletteItemCard({
  place,
  labelHe,
  subHe,
  scale,
}: {
  place: Place;
  labelHe: string;
  subHe: string;
  scale: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${place}`,
    data: { source: 'palette', place, renderPlace: place },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      tabIndex={0}
      style={{ touchAction: 'none' }}
      className={`relative flex flex-col items-center justify-between rounded-xl px-3 py-1.5 min-w-[84px] h-[80px] bg-slate-50/70 hover:bg-slate-100/90 border border-slate-200/80 hover:border-indigo-300 shadow-2xs hover:shadow-xs transition-all select-none cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
      title={`גררו ${labelHe} לטבלה`}
    >
      <div
        className="h-11 w-full flex items-center justify-center pointer-events-none"
        style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
      >
        <DienesBlock
          id={`palette-preview-${place}`}
          place={place}
          source="palette"
          isOverlay={true}
        />
      </div>

      <div className="flex items-center gap-1 pointer-events-none">
        <span className="text-[12px] font-black text-slate-700 leading-none" aria-hidden="true">
          {labelHe}
        </span>
        <span className="text-[10px] font-bold text-slate-400 leading-none">
          ({subHe})
        </span>
      </div>
      <span className="sr-only">{`גרור ${PLACE_NAMES_HE[place]} לטבלה — ערך ${PLACE_VALUES[place]}`}</span>
    </div>
  );
}

/**
 * מחסן הכלים (Block Palette) — מגש לבני דינס אותנטי, נקי ומינימליסטי.
 * תואם PRD: גרירה ייעודית וחלקה לבית המספרים (ללא תלות בלחיצות מקומיות).
 * מוסתר לחלוטין ברמת פיגום 3 (scaffoldLevel >= 3).
 */
export function BlockPalette({ scaffoldLevel }: { scaffoldLevel: number }) {
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);

  if (scaffoldLevel >= 3) return null;

  // Hide thousands in sessions 1 and 2 (pedagogical progression)
  const itemsToRender = sessionNumber <= 2
    ? PALETTE_ITEMS.filter((item) => item.place !== 'thousands')
    : PALETTE_ITEMS;

  return (
    <div
      id="tour-block-palette"
      role="toolbar"
      aria-label="מחסן הכלים — גררו לבנים לטבלה"
      className="shrink-0 ws-card !rounded-2xl px-5 py-2.5 flex items-center justify-between gap-4 max-w-full overflow-x-auto no-scrollbar select-none bg-white/95 border border-slate-200/90 shadow-sm"
    >
      {/* Title & Legend (RTL Right side) */}
      <div className="flex items-center gap-2.5 shrink-0 select-none">
        <span aria-hidden="true" className="text-xl drop-shadow-xs">🧰</span>
        <div className="flex flex-col">
          <span className="text-xs font-black text-slate-800 tracking-wide leading-tight">
            ארגז כלים
          </span>
          <span className="text-[10px] font-bold text-slate-400 leading-none">
            לבני דינס
          </span>
        </div>
      </div>

      <div className="w-px h-10 bg-slate-200/80 shrink-0" />

      {/* Manipulatives on Tray (Center) */}
      <div className="flex items-center gap-2.5 flex-1 justify-center">
        {itemsToRender.map(({ place, labelHe, subHe, scale }) => (
          <PaletteItemCard
            key={place}
            place={place}
            labelHe={labelHe}
            subHe={subHe}
            scale={scale}
          />
        ))}
      </div>

      <div className="w-px h-10 bg-slate-200/80 shrink-0" />

      {/* Dedicated Drop Disposal Zone (RTL Left side) */}
      <TrashZone />
    </div>
  );
}
