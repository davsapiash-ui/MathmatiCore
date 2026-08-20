import { PLACE_VALUES, PLACE_NAMES_HE, type Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { DienesBlock } from './DienesBlock';
import { TrashZone } from './TrashZone';

const PALETTE_ITEMS: { place: Place; labelHe: string; scale: number }[] = [
  { place: 'units', labelHe: 'יחידה (1)', scale: 1 },
  { place: 'tens', labelHe: 'עשרת (10)', scale: 1 },
  { place: 'hundreds', labelHe: 'מאה (100)', scale: 0.95 },
  { place: 'thousands', labelHe: 'אלף (1000)', scale: 0.75 },
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
      aria-label="מחסן הכלים — גררו לבנים לטבלה"
      className="shrink-0 ws-card !rounded-2xl px-5 py-3 flex items-center justify-between gap-4 max-w-full overflow-x-auto no-scrollbar select-none bg-gradient-to-b from-white to-slate-50/90 border border-slate-200/90 shadow-sm"
    >
      {/* Title & Legend (RTL Right side) */}
      <div className="flex items-center gap-2.5 shrink-0 select-none">
        <span aria-hidden="true" className="text-2xl drop-shadow-sm">🧰</span>
        <div className="flex flex-col">
          <span className="text-xs font-black text-slate-800 tracking-wide leading-tight">
            ארגז כלים
          </span>
          <span className="text-[10px] font-semibold text-slate-400 leading-none">
            לבנים לפעילות
          </span>
        </div>
      </div>

      <div className="w-px h-12 bg-slate-200/80 shrink-0" />

      {/* Manipulatives on Tray (Center) */}
      <div className="flex items-center gap-3 flex-1 justify-center">
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
            className="relative group flex flex-col items-center justify-between rounded-2xl px-3 pt-2 pb-1.5 min-w-[88px] h-[86px] bg-white border border-slate-200/90 shadow-sm hover:border-ws-accent hover:shadow-md hover:scale-[1.03] active:scale-95 transition-all cursor-grab active:cursor-grabbing select-none"
          >
            <div className="h-12 w-full flex items-center justify-center pointer-events-auto" style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
              <DienesBlock
                id={`palette-${place}`}
                place={place}
                source="palette"
                noEnter
              />
            </div>
            <span className="text-[11px] font-black text-slate-700 group-hover:text-ws-accent transition-colors mt-0.5" aria-hidden="true">
              {labelHe}
            </span>
            <span className="sr-only">{`גרור ${PLACE_NAMES_HE[place]} לטבלה — ערך ${PLACE_VALUES[place]}`}</span>
            
            {/* Norman Principle: Explanatory Hover Tooltip */}
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 p-1.5 px-3 bg-slate-900/95 text-white text-[10px] text-center font-bold rounded-xl shadow-lg backdrop-blur-md border border-white/10 whitespace-nowrap">
              <span>➕ לחצו או גררו להוספת {PLACE_NAMES_HE[place]}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="w-px h-10 bg-slate-200/80 shrink-0" />

      {/* Dedicated Drop Disposal Zone (RTL Left side) */}
      <TrashZone />
    </div>
  );
}
