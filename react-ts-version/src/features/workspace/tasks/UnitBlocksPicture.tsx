import { BLOCK_SIZES, UnitSVG } from '../board/DienesBlock';
import { NEUTRAL_BOX_BORDER, PLACE_COLORS } from '../placeColors';
import { useEnhancedSupport } from './useEnhancedSupport';

/**
 * Meeting 2, task 5 (מסמך 03 §3.2: "עשרים וחמש לבני יחידה בטור היחידות"; owner,
 * 27.9.2026): a still picture of the unit blocks in a units column, for every
 * learner and in the correction round too. It is the question itself, not a
 * scaffold: nothing here can be dragged, clicked or grouped, and there is no
 * "קבצו 10" button. The blocks are the board's own unit block (UnitSVG), in the
 * board's units-column frame — the virtual Dienes blocks of PRD Module 14 §ב
 * are not loaded (no dnd-kit, no store, no board).
 *
 * No number with it (owner, 29.9.2026): the caption "25 לבני יחידה" beside the
 * picture, and read as its name, handed the child both digits of the answer (2
 * and 5) — מסמך 03 asks for the picture, and for the learner to find how many.
 * The picture follows the window's height: the board's size in a window 950px tall, smaller
 * in a shorter one, with no step, so the card fits without scrolling.
 */
export function UnitBlocksPicture({ count }: { count: number }) {
  const { w } = BLOCK_SIZES.units;
  // Meeting 2 without the enhanced support profile: no place colour (owner,
  // 27.9.2026) — the frame was the units column's. With the profile it stays.
  const border = useEnhancedSupport() ? PLACE_COLORS.units.border : NEUTRAL_BOX_BORDER;
  // Four across: a column, taller than it is wide. A 5 × 5 square would show
  // the blocks already arranged in fives, in a task about grouping by ten.
  const perRow = 4;
  // One block: 14px in a window 600px tall → the board's 20px at 950px.
  const block = `clamp(14px, calc(1.7143vh + 3.71px), ${w}px)`;
  const gap = `calc(${block} * 0.3)`;
  return (
    <div className="flex items-center justify-center">
      <div
        role="img"
        aria-label="תמונה של לבני יחידה"
        data-testid="unit-blocks-picture"
        className="rounded-2xl border-2 border-solid p-[clamp(6px,calc(1.7143vh-4.29px),12px)] select-none"
        // The board writes this border as `${border}55`, which is not a valid colour
        // for a var(); color-mix gives the soft units-column border it means.
        style={{ borderColor: `color-mix(in srgb, ${border} 33%, transparent)`, backgroundColor: 'hsl(var(--ws-surface))', boxShadow: '0 4px 14px -6px rgba(0,0,0,0.06)' }}
      >
        <div
          aria-hidden="true"
          data-per-row={perRow}
          className="flex flex-row flex-wrap content-end justify-center items-end pointer-events-none"
          style={{ gap, width: `calc(${block} * ${perRow} + ${gap} * ${perRow - 1})` }}
        >
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="shrink-0" style={{ width: block, height: block }} data-testid="unit-block-still">
              <UnitSVG />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
