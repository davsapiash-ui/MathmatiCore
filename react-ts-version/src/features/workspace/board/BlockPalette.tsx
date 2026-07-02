import { PLACE_VALUES, type Place } from '@/core/placeValue';
import { PLACE_NAMES_HE } from '@/core/placeValue';
import { DienesBlock } from './DienesBlock';
import { TrashZone } from './TrashZone';

const PALETTE_ITEMS: { place: Place; labelHe: string; scale: number }[] = [
  { place: 'units', labelHe: 'יחידה (1)', scale: 1 },
  { place: 'tens', labelHe: 'עשרת (10)', scale: 0.85 },
  { place: 'hundreds', labelHe: 'מאה (100)', scale: 0.5 },
  { place: 'thousands', labelHe: 'אלף (1000)', scale: 0.45 },
];

/**
 * מחסן אביזרים — draggable source blocks + trash.
 * Hidden entirely at scaffoldLevel >= 3 (vanilla setScaffoldLevel).
 */
export function BlockPalette({ scaffoldLevel }: { scaffoldLevel: number }) {
  if (scaffoldLevel >= 3) return null;

  return (
    <div
      role="toolbar"
      aria-label="מחסן אביזרים — גרור לטבלה"
      className="shrink-0 bg-ws-surface border border-ws-surface2 rounded-2xl shadow-md px-4 py-3 flex items-center justify-center gap-6"
    >
      <span className="text-xs font-bold text-ws-soft leading-tight text-center">
        מחסן
        <br />
        אביזרים
      </span>
      <div className="w-px h-12 bg-ws-surface2" />

      {PALETTE_ITEMS.map(({ place, labelHe, scale }) => (
        <div key={place} className="flex flex-col items-center gap-1.5">
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

      <div className="w-px h-12 bg-ws-surface2" />
      <TrashZone />
    </div>
  );
}
