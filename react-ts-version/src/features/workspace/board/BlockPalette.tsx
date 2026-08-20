import { PLACE_VALUES, PLACE_NAMES_HE, type Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { DienesBlock } from './DienesBlock';
import { TrashZone } from './TrashZone';

const PALETTE_THEMES: Record<Place, { labelHe: string; subHe: string; cardBg: string; border: string; activeBorder: string; badgeBg: string; textCol: string }> = {
  units: {
    labelHe: 'יחידה',
    subHe: '1',
    cardBg: 'bg-amber-50/80 hover:bg-amber-100/80',
    border: 'border-amber-200',
    activeBorder: 'hover:border-amber-400 hover:shadow-amber-100',
    badgeBg: 'bg-amber-500',
    textCol: 'text-amber-900',
  },
  tens: {
    labelHe: 'עשרת',
    subHe: '10',
    cardBg: 'bg-emerald-50/80 hover:bg-emerald-100/80',
    border: 'border-emerald-200',
    activeBorder: 'hover:border-emerald-400 hover:shadow-emerald-100',
    badgeBg: 'bg-emerald-500',
    textCol: 'text-emerald-900',
  },
  hundreds: {
    labelHe: 'מאה',
    subHe: '100',
    cardBg: 'bg-blue-50/80 hover:bg-blue-100/80',
    border: 'border-blue-200',
    activeBorder: 'hover:border-blue-400 hover:shadow-blue-100',
    badgeBg: 'bg-blue-500',
    textCol: 'text-blue-900',
  },
  thousands: {
    labelHe: 'אלף',
    subHe: '1,000',
    cardBg: 'bg-orange-50/80 hover:bg-orange-100/80',
    border: 'border-orange-200',
    activeBorder: 'hover:border-orange-400 hover:shadow-orange-100',
    badgeBg: 'bg-orange-500',
    textCol: 'text-orange-900',
  },
};

const PALETTE_PLACES: Place[] = ['units', 'tens', 'hundreds', 'thousands'];

/**
 * מחסן הכלים — draggable source blocks + trash.
 * Hidden entirely at scaffoldLevel >= 3 (vanilla setScaffoldLevel).
 */
export function BlockPalette({ scaffoldLevel }: { scaffoldLevel: number }) {
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);

  if (scaffoldLevel >= 3) return null;
  
  // Hide thousands in sessions 1 and 2 (pedagogical progression)
  const placesToRender = sessionNumber <= 2
    ? PALETTE_PLACES.filter(p => p !== 'thousands')
    : PALETTE_PLACES;

  return (
    <div
      id="tour-block-palette"
      role="toolbar"
      aria-label="מחסן הכלים — גררו לבנים לטבלה"
      className="shrink-0 ws-card !rounded-2xl px-5 py-3 flex items-center justify-between gap-4 max-w-full overflow-x-auto no-scrollbar select-none bg-white border-2 border-slate-200/90 shadow-md"
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

      <div className="w-px h-14 bg-slate-200/80 shrink-0" />

      {/* Manipulatives on Tray (Center) */}
      <div className="flex items-center gap-3 flex-1 justify-center">
        {placesToRender.map((place) => {
          const theme = PALETTE_THEMES[place];
          return (
            <div
              key={place}
              onClick={() => {
                useWorkspaceStore.getState().applyDrop({
                  source: 'palette',
                  sourcePlace: place,
                  target: { kind: 'column', place },
                });
              }}
              className={`relative group flex flex-col items-center justify-between rounded-2xl px-3 pt-2 pb-1.5 min-w-[94px] h-[92px] ${theme.cardBg} border-2 ${theme.border} ${theme.activeBorder} shadow-sm hover:shadow-md hover:scale-[1.03] active:scale-95 transition-all cursor-grab active:cursor-grabbing select-none`}
            >
              {/* Add + badge on card */}
              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white/90 border border-slate-200/80 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover:text-ws-accent transition-colors shadow-xs">
                +
              </div>

              <div className="h-12 w-full flex items-center justify-center pointer-events-auto">
                <DienesBlock
                  id={`palette-${place}`}
                  place={place}
                  source="palette"
                  noEnter
                />
              </div>

              <div className="flex items-center gap-1 mt-0.5">
                <span className={`text-[12px] font-black ${theme.textCol}`} aria-hidden="true">
                  {theme.labelHe}
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  ({theme.subHe})
                </span>
              </div>
              <span className="sr-only">{`גרור ${PLACE_NAMES_HE[place]} לטבלה — ערך ${PLACE_VALUES[place]}`}</span>
            </div>
          );
        })}
      </div>

      <div className="w-px h-14 bg-slate-200/80 shrink-0" />

      {/* Dedicated Drop Disposal Zone (RTL Left side) */}
      <TrashZone />
    </div>
  );
}
