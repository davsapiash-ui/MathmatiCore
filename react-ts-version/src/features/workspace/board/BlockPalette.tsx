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
  compact = false,
}: {
  place: Place;
  labelHe: string;
  subHe: string;
  scale: number;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${place}`,
    data: { source: 'palette', place, renderPlace: place },
  });

  const applyDrop = useWorkspaceStore((s) => s.applyDrop);

  const handleTapToAdd = () => {
    if (isDragging) return;
    applyDrop({
      source: 'palette',
      sourcePlace: place,
      target: { kind: 'column', place },
    });
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`הוספת ${labelHe} לבית המספרים`}
      onClick={handleTapToAdd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleTapToAdd();
        }
      }}
      style={{ touchAction: 'none' }}
      className={`relative flex flex-col items-center justify-between rounded-xl py-1.5 h-[80px] ${compact ? 'px-1.5 min-w-[72px]' : 'px-3 min-w-[84px]'} bg-slate-50/70 dark:bg-slate-800/70 hover:bg-slate-100/90 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 hover:border-indigo-300 shadow-2xs hover:shadow-xs transition-all select-none cursor-pointer active:scale-95 touch-manipulation ${
        isDragging ? 'opacity-30 pointer-events-none' : ''
      }`}
      title={`לחצו או גררו ${labelHe} לבית המספרים`}
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
        <span className="text-[12px] font-black text-slate-700 dark:text-slate-200 leading-none" aria-hidden="true">
          {labelHe}
        </span>
        <span className="text-xs font-bold text-slate-400 leading-none">
          ({subHe})
        </span>
      </div>
      <span className="sr-only">{`לחצו או גררו ${PLACE_NAMES_HE[place]} לבית המספרים — ערך ${PLACE_VALUES[place]}`}</span>
    </div>
  );
}

/**
 * מחסן הכלים (Block Palette) — מגש לבני דינס אותנטי, נקי ומינימליסטי.
 * תואם PRD: גרירה ייעודית וחלקה לבית המספרים (ללא תלות בלחיצות מקומיות).
 * מוסתר לחלוטין ברמת פיגום 3 (scaffoldLevel >= 3).
 */
export function BlockPalette({ scaffoldLevel, compact = false }: { scaffoldLevel: number; compact?: boolean }) {
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);

  if (scaffoldLevel >= 3) return null;

  // Hide thousands in sessions 1 and 2 (pedagogical progression)
  const itemsToRender = sessionNumber <= 2
    ? PALETTE_ITEMS.filter((item) => item.place !== 'thousands')
    : PALETTE_ITEMS;

  // compact: the side panel is open, or the board is too narrow for the full
  // tray. The tray tightens and may wrap — an RTL flex row that overflows cuts
  // off its far (left) end, which is where the trash sits, and the trash is a
  // permanent tool (PRD Module 8 §א). Its name stays on the screen: the cards
  // say "גוררים לבנים מארגז הכלים", so the child must see a box called that
  // (audit 4.10.2026, A4-F04 / A5-F08). In compact form the name sits on the
  // tray's top edge, like a label on a box, so it adds no row and the board
  // keeps every pixel of its height.
  return (
    <div
      id="tour-block-palette"
      role="toolbar"
      aria-label="ארגז כלים — גררו לבנים לבית המספרים"
      data-compact={compact ? 'true' : undefined}
      className={`relative shrink-0 ws-card !rounded-2xl flex items-center max-w-full select-none bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 shadow-sm ${
        compact ? 'px-3 py-2 gap-2 flex-wrap justify-center' : 'px-5 py-2.5 gap-4 justify-between overflow-x-auto no-scrollbar'
      }`}
    >
      {compact && (
        <span
          aria-hidden="true"
          data-testid="toolbox-name"
          className="absolute -top-2.5 right-5 inline-flex items-center gap-1 rounded-full px-2 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 text-xs font-black text-slate-800 dark:text-slate-100 leading-4 whitespace-nowrap pointer-events-none"
        >
          <span>🧰</span>
          ארגז כלים
        </span>
      )}
      {/* Title & Legend (RTL Right side) */}
      <div className={`${compact ? 'hidden' : 'flex'} items-center gap-2.5 shrink-0 select-none`}>
        <span aria-hidden="true" className="text-xl drop-shadow-xs">🧰</span>
        <div className="flex flex-col">
          <span className="text-xs font-black text-slate-800 tracking-wide leading-tight">
            ארגז כלים
          </span>
          <span className="text-xs font-bold text-slate-400 leading-none">
            לבנים
          </span>
        </div>
      </div>

      <div className={`w-px h-10 bg-slate-200/80 shrink-0 ${compact ? 'hidden' : ''}`} />

      {/* Manipulatives on Tray (Center) */}
      {/* Compact: room for two blocks a row before the group wraps (the trash may then take a
          row of its own), so a narrow board — 1024px with the grid open beside it — gets a
          2 × 2 tray, not a column of four that leaves the columns no height. */}
      <div className={`flex items-center justify-center ${compact ? 'flex-[1_1_190px] gap-1.5 flex-wrap' : 'flex-1 gap-2.5'}`}>
        {itemsToRender.map(({ place, labelHe, subHe, scale }) => (
          <PaletteItemCard
            key={place}
            place={place}
            labelHe={labelHe}
            subHe={subHe}
            scale={scale}
            compact={compact}
          />
        ))}
      </div>

      <div className={`w-px h-10 bg-slate-200/80 shrink-0 ${compact ? 'hidden' : ''}`} />

      {/* Dedicated Drop Disposal Zone (RTL Left side) */}
      <TrashZone />
    </div>
  );
}
