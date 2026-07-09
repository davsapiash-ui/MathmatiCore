import { PLACE_VALUES, PLACE_NAMES_HE, type Place } from '@/core/placeValue';
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
  if (scaffoldLevel >= 3) return null;

  const paletteItemsToRender = PALETTE_ITEMS;

  return (
    <div
      id="tour-block-palette"
      role="toolbar"
      aria-label="מחסן הכלים — גרור לטבלה"
      className="shrink-0 ws-card !rounded-2xl px-4 py-2.5 flex items-center justify-start sm:justify-center gap-3 max-w-full overflow-x-auto no-scrollbar"
    >
      <span className="text-xs font-display font-extrabold text-ws-soft leading-tight text-center shrink-0">
        <span aria-hidden="true" className="text-xl">🧰</span>
        <br />
        ארגז כלים
      </span>
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
