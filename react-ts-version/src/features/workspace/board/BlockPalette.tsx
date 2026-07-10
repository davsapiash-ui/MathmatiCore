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
      className="shrink-0 ws-card !rounded-2xl px-4 py-2.5 flex items-center justify-start sm:justify-center gap-3 max-w-full overflow-x-auto no-scrollbar"
    >
      <div className="flex flex-col items-center gap-1 rounded-2xl px-4 pt-2 pb-1.5 bg-ws-accentSoft/35 border border-ws-accent/25 shrink-0 select-none">
        <span aria-hidden="true" className="text-3xl leading-none h-12 flex items-center justify-center">🧰</span>
        <span className="text-[11px] font-black text-ws-accent">
          ארגז כלים
        </span>
      </div>
      <div className="w-px h-14 bg-ws-surface2" />

      {paletteItemsToRender.map(({ place, labelHe, scale }) => (
        <div
          key={place}
          className="flex flex-col items-center gap-1 rounded-2xl px-3 pt-2 pb-1.5 bg-ws-bg/70 border border-ws-surface2 hover:border-ws-accent/40 hover:bg-ws-accentSoft/40 hover:-translate-y-0.5 transition-all"
        >
          <div className="h-12 flex items-end justify-center" style={{ transform: `scale(${scale})`, transformOrigin: 'bottom center' }}>
            <DienesBlock
              id={`palette-${place}`}
              place={place}
              source="palette"
              noEnter
            />
          </div>
          <span className="text-[11px] font-black text-ws-soft" aria-hidden="true">
            {labelHe}
          </span>
          <span className="sr-only">{`גרור ${PLACE_NAMES_HE[place]} לטבלה — ערך ${PLACE_VALUES[place]}`}</span>
        </div>
      ))}

      <div className="w-px h-14 bg-ws-surface2" />
      <TrashZone />
    </div>
  );
}
