import { Boxes } from 'lucide-react';
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

/** The toolbox's name tag: the station chip's look (TaskCard). */
const TOOLBOX_TAG =
  'inline-flex items-center gap-1.5 rounded-full pr-2.5 pl-3 py-0.5 bg-ws-accentSoft text-ws-accent border border-white dark:border-slate-900 shadow-[0_2px_6px_-2px_hsl(var(--ws-accent)/0.35)] text-[13px] font-display font-extrabold leading-5 whitespace-nowrap pointer-events-none';

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
      {/* The box's name, as a label on the box (owner, 7.10.2026: the name
          should look better). The same tag as the station chip over the
          exercise — the workspace's one way of naming a thing — with an icon
          of stacked blocks instead of an emoji that every system draws
          differently. Compact: on the tray's top edge, adding no row. */}
      {compact ? (
        <span aria-hidden="true" data-testid="toolbox-name" className={`absolute -top-3 right-5 ${TOOLBOX_TAG}`}>
          <Boxes className="w-3.5 h-3.5 shrink-0" strokeWidth={2.4} />
          <span>ארגז כלים</span>
        </span>
      ) : (
        <div className="flex flex-col items-start gap-1 shrink-0 select-none">
          <span className={TOOLBOX_TAG}>
            <Boxes aria-hidden="true" className="w-4 h-4 shrink-0" strokeWidth={2.4} />
            <span>ארגז כלים</span>
          </span>
          <span className="text-xs font-bold text-ws-soft leading-tight pr-1">גוררים מכאן לבית המספרים</span>
        </div>
      )}

      <div className={`w-px h-10 bg-slate-200/80 shrink-0 ${compact ? 'hidden' : ''}`} />

      {/* Manipulatives on Tray (Center) */}
      <div className={`flex items-center flex-1 justify-center ${compact ? 'gap-1.5 flex-wrap' : 'gap-2.5'}`}>
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
