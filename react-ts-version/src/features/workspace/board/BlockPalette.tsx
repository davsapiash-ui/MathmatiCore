import { PLACE_VALUES, PLACE_NAMES_HE, type Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { DienesBlock } from './DienesBlock';
import { TrashZone } from './TrashZone';

const PALETTE_ITEMS: { place: Place; labelHe: string; scale: number }[] = [
  { place: 'units', labelHe: 'יחידה (1)', scale: 1 },
  { place: 'tens', labelHe: 'עשרת (10)', scale: 0.85 },
  { place: 'hundreds', labelHe: 'מאה (100)', scale: 0.5 },
  { place: 'thousands', labelHe: 'אלף (1000)', scale: 0.45 },
];

/**
 * מחסן הכלים — draggable source blocks + trash.
 * Hidden entirely at scaffoldLevel >= 3 (vanilla setScaffoldLevel).
 */
export function BlockPalette({ scaffoldLevel }: { scaffoldLevel: number }) {
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);

  if (scaffoldLevel >= 3) return null;
  
  // Hide thousands in sessions 1 and 2 (pedagogical progression)
  const paletteItemsToRender = sessionNumber <= 2
    ? PALETTE_ITEMS.filter(item => item.place !== 'thousands')
    : PALETTE_ITEMS;

  return (
    <div
      id="tour-block-palette"
      role="toolbar"
      aria-label="מחסן הכלים — גרור לטבלה"
      className="shrink-0 ws-card !rounded-2xl px-4 py-2 flex items-center justify-start sm:justify-center gap-3 max-w-full overflow-x-auto no-scrollbar select-none"
    >
      <div className="flex items-center gap-2.5 px-2 py-1 shrink-0 select-none">
        <span aria-hidden="true" className="text-2xl drop-shadow-sm">🧰</span>
        <div className="flex flex-col">
          <span className="text-xs font-black text-ws-ink/80 tracking-wide leading-tight">
            ארגז כלים
          </span>
          <span className="text-[10px] font-semibold text-ws-soft leading-none">
            לבנים לפעילות
          </span>
        </div>
      </div>
      <div className="w-px h-10 bg-ws-surface2 shrink-0 mx-1" />

      {paletteItemsToRender.map(({ place, labelHe, scale }) => (
        <div
          key={place}
          onClick={() => {
            useWorkspaceStore.getState().applyDrop({
              source: 'palette',
              sourcePlace: place,
              target: { kind: 'column', place },
            });
          }}
          className="relative group flex flex-col items-center justify-between rounded-2xl px-3 pt-2 pb-1.5 min-w-[80px] bg-ws-bg/80 border border-ws-surface2 hover:border-ws-accent/50 hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing select-none"
        >
          <div className="h-12 flex items-end justify-center" style={{ transform: `scale(${scale})`, transformOrigin: 'bottom center' }}>
            <DienesBlock
              id={`palette-${place}`}
              place={place}
              source="palette"
              noEnter
            />
          </div>
          <span className="text-[11px] font-black text-ws-soft group-hover:text-ws-ink transition-colors" aria-hidden="true">
            {labelHe}
          </span>
          <span className="sr-only">{`גרור ${PLACE_NAMES_HE[place]} לטבלה — ערך ${PLACE_VALUES[place]}`}</span>
          
          {/* Norman Principle: Explanatory Hover Tooltip */}
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-36 p-1.5 bg-slate-900/95 text-white text-[10px] text-center font-bold rounded-xl shadow-lg backdrop-blur-md border border-white/10 whitespace-nowrap">
            <span>➕ לחץ או גרור לטבלה</span>
          </div>
        </div>
      ))}

      <div className="w-px h-10 bg-ws-surface2 shrink-0 mx-1" />
      <TrashZone />
    </div>
  );
}
