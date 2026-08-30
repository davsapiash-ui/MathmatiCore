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

/**
 * מחסן הכלים (Block Palette) — מגש לבני דינס אותנטי, נקי ומינימליסטי.
 * תואם PRD v6.4 מודול 5: גרירה ולחיצה מיידית (0ms), ללא הסחות דעת, באדג'ים או טולטיפים מעמיסים.
 * מוסתר לחלוטין ברמת פיגום 3 (scaffoldLevel >= 3).
 */
export function BlockPalette({ scaffoldLevel }: { scaffoldLevel: number }) {
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);

  if (scaffoldLevel >= 3) return null;
  
  // Hide thousands in sessions 1 and 2 (pedagogical progression)
  const itemsToRender = sessionNumber <= 2
    ? PALETTE_ITEMS.filter(item => item.place !== 'thousands')
    : PALETTE_ITEMS;

  const applyDrop = useWorkspaceStore((s) => s.applyDrop);

  const handleItemClick = (place: Place) => {
    applyDrop({
      source: 'palette',
      sourcePlace: place,
      target: { kind: 'column', place },
    });
  };

  return (
    <div
      id="tour-block-palette"
      role="toolbar"
      aria-label="מחסן הכלים — גררו או לחצו להוספת לבנים לטבלה"
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
        {itemsToRender.map(({ place, labelHe, subHe, scale }) => {
          return (
            <div
              key={place}
              className="relative flex flex-col items-center justify-between rounded-xl px-3 py-1.5 min-w-[84px] h-[80px] bg-slate-50/70 hover:bg-slate-100/90 border border-slate-200/80 hover:border-indigo-300 shadow-2xs hover:shadow-xs transition-all select-none cursor-pointer active:scale-95"
              title={`לחצו או גררו להוספת ${labelHe} לטבלה`}
            >
              <div 
                className="h-11 w-full flex items-center justify-center pointer-events-auto"
                style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
              >
                <DienesBlock
                  id={`palette-${place}`}
                  place={place}
                  source="palette"
                  noEnter
                  onClick={() => handleItemClick(place)}
                />
              </div>

              <div 
                className="flex items-center gap-1 cursor-pointer"
                onClick={() => handleItemClick(place)}
              >
                <span className="text-[12px] font-black text-slate-700 leading-none" aria-hidden="true">
                  {labelHe}
                </span>
                <span className="text-[10px] font-bold text-slate-400 leading-none">
                  ({subHe})
                </span>
              </div>
              <span className="sr-only">{`גרור או לחץ להוספת ${PLACE_NAMES_HE[place]} לטבלה — ערך ${PLACE_VALUES[place]}`}</span>
            </div>
          );
        })}
      </div>

      <div className="w-px h-10 bg-slate-200/80 shrink-0" />

      {/* Dedicated Drop Disposal Zone (RTL Left side) */}
      <TrashZone />
    </div>
  );
}
