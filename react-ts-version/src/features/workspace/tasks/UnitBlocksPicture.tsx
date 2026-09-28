import { BLOCK_SIZES, UnitSVG } from '../board/DienesBlock';
import { PLACE_COLORS } from '../placeColors';

/**
 * Meeting 2, task 5 (מסמך 03 §3.2: "עשרים וחמש לבני יחידה בטור היחידות"; owner,
 * 27.9.2026): a still picture of the unit blocks in a units column, for every
 * learner and in the correction round too. It is the question itself, not a
 * scaffold: nothing here can be dragged, clicked or grouped, and there is no
 * "קבץ 10" button. The blocks are the board's own unit block (UnitSVG) at the
 * board's size, in the board's units-column frame — the virtual Dienes blocks
 * of PRD Module 14 §ב are not loaded (no dnd-kit, no store, no board).
 */
/** `label` is the caption, "25 לבני יחידה", shown beside the picture and read as its name. */
export function UnitBlocksPicture({ count, label }: { count: number; label: string }) {
  const { w, h } = BLOCK_SIZES.units;
  const colors = PLACE_COLORS.units;
  // Four across: a column, taller than it is wide. A 5 × 5 square would show
  // the blocks already arranged in fives, in a task about grouping by ten.
  const perRow = 4;
  const gap = 6;
  return (
    // The caption sits beside the column, not above it, so the result row stays
    // in view on a 1366 × 768 or 1024 × 768 laptop.
    <div className="flex items-center justify-center gap-6">
      <div className="bg-ws-accentSoft/60 border border-ws-accent/30 rounded-3xl px-8 py-5 text-center shadow-sm" aria-hidden="true">
        <span className="font-display font-black text-3xl md:text-4xl text-ws-ink">{label}</span>
      </div>
      <div
        role="img"
        aria-label={label}
        data-testid="unit-blocks-picture"
        className="rounded-2xl border-2 border-solid px-3 py-3 select-none"
        // The board writes this border as `${border}55`, which is not a valid colour
        // for a var(); color-mix gives the soft units-column border it means.
        style={{ borderColor: `color-mix(in srgb, ${colors.border} 33%, transparent)`, backgroundColor: 'hsl(var(--ws-surface))', boxShadow: '0 4px 14px -6px rgba(0,0,0,0.06)' }}
      >
        <div
          aria-hidden="true"
          className="flex flex-row flex-wrap content-end justify-center items-end pointer-events-none"
          style={{ gap, width: perRow * w + (perRow - 1) * gap }}
        >
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="shrink-0" style={{ width: w, height: h }} data-testid="unit-block-still">
              <UnitSVG />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
