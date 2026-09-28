/**
 * How the blocks of one column of בית המספרים are laid out.
 *
 * PRD Module 7 §א: dragging, decomposing or grouping a block "מעדכנת מיידית את
 * הספרה בטור המתאים", and מסמך 04 (Feedback) makes that digit "אישור חזותי קבוע
 * לפעולות הלומדים". The digit only confirms what the child did if every block it
 * counts is on the screen. Until 28.9.2026 the blocks had one fixed size, the
 * column clipped whatever did not fit and showed no scroll bar. Measured on the
 * screen at 1366×768: 5 of 8 hundreds fully visible in meeting 1 (806), and 4 of
 * 45 in meeting 3 exercise 3 ("45 מאות").
 *
 * So a column never hides a block. Its blocks keep their drawn size while they
 * fit; when they do not, the whole column's blocks shrink together, just enough
 * for all of them to fit in the space the column has. A column holds at most
 * MAX_VISIBLE_BLOCKS (50) blocks, and the layout is computed for that count too.
 * The owner approved this on 28.9.2026 (register, gap כא): every block the digit
 * counts is shown, shrinking only as much as needed, with click and drag working
 * at every size — even below the 44×44 touch target of DESIGN_SYSTEM_RULES §1.2.
 *
 * "Only as much as needed" is about the block the child sees. The padding around
 * a block is its click-and-drag area, not part of the picture, and it gives way
 * first: the block keeps its drawn size while the padding shrinks, down to
 * MIN_PAD, and only then does the block shrink, into the space left after MIN_PAD.
 * The cells fill the column's space either way, so the click area is the same.
 * Until the review of 28.9.2026 the padding shrank at the block's rate, and a unit
 * cube (20px, with 12px around it) shrank about twice as much as it had to: 50
 * units in the measured 1024×768 column (88×270) were drawn 9px where 18px fit.
 *
 * Pure: no React, no DOM. PlaceColumn measures the space and renders the result.
 */

export interface Size {
  w: number;
  h: number;
}

/** One block's cell: the drawn block plus the padding around it. The whole cell
 *  is the block's click-and-drag area, so there is no dead gap between blocks. */
export interface CellSpec {
  block: Size;
  pad: number;
}

export interface BlockGridFit {
  /** 1 = drawn size; below 1 the blocks were shrunk to fit. */
  scale: number;
  perRow: number;
  rows: number;
  /** Rendered block size, px. */
  block: Size;
  /** Rendered padding around each block, px. */
  pad: number;
  /** Rendered cell size (block + 2·pad), px. */
  cell: Size;
}

/** The padding never goes below this: two neighbouring blocks stay 2px apart. */
export const MIN_PAD = 1;

type Cell = Omit<BlockGridFit, 'perRow' | 'rows'>;

/**
 * The biggest block for one cell of `room` px, and the padding around it. The
 * block keeps its drawn size if that leaves MIN_PAD around it; if not, both of
 * its sides shrink by one scale, into the room left after MIN_PAD. The padding
 * takes what is left, up to its drawn size. null: not even a 1px block fits.
 */
function cellIn(spec: CellSpec, room: Size): Cell | null {
  const { w: W, h: H } = spec.block;
  const rw = room.w - 2 * MIN_PAD;
  const rh = room.h - 2 * MIN_PAD;
  let block: Size;
  if (W <= rw && H <= rh) {
    block = { w: W, h: H };
  } else if ((rw + 1) * H <= (rh + 1) * W) {
    // The width binds. A side drawn d px, scaled and rounded down, fits r px
    // while the scale stays below (r + 1) / d: the height is the largest whole
    // number below H·(rw + 1)/W. Integers, so no rounding tips a block over.
    block = { w: rw, h: Math.floor((H * (rw + 1) - 1) / W) };
  } else {
    // The height binds; the same for the width.
    block = { w: Math.floor((W * (rh + 1) - 1) / H), h: rh };
  }
  if (block.w < 1 || block.h < 1) return null;
  const pad = Math.min(spec.pad, Math.floor((room.w - block.w) / 2), Math.floor((room.h - block.h) / 2));
  return {
    scale: Math.min(block.w / W, block.h / H),
    block,
    pad,
    cell: { w: block.w + 2 * pad, h: block.h + 2 * pad },
  };
}

/**
 * The biggest blocks (never above their drawn size) at which `count` cells fit
 * in `box`, and how many go in a row. Cells sit edge to edge; rows wrap.
 */
export function fitBlockGrid(count: number, spec: CellSpec, box: Size): BlockGridFit {
  const n = Math.max(0, Math.floor(count));
  const drawn: Cell = {
    scale: 1,
    block: { ...spec.block },
    pad: spec.pad,
    cell: { w: spec.block.w + 2 * spec.pad, h: spec.block.h + 2 * spec.pad },
  };
  const at = (c: Cell, perRow: number): BlockGridFit => ({ ...c, perRow, rows: n === 0 ? 0 : Math.ceil(n / perRow) });
  if (n === 0 || box.w <= 0 || box.h <= 0) return at(drawn, Math.max(1, n));

  // At the drawn size, padding included, the fewest rows that fit is the widest
  // row that fits: if that row does not fit, no row does.
  const widest = Math.min(n, Math.floor(box.w / drawn.cell.w));
  if (widest >= 1 && Math.ceil(n / widest) * drawn.cell.h <= box.h) return at(drawn, widest);

  // They do not fit: every row length, each cell an equal share of the box in
  // whole pixels. The biggest block wins, then the most padding around it.
  let best: BlockGridFit | null = null;
  for (let perRow = 1; perRow <= n; perRow++) {
    const c = cellIn(spec, { w: Math.floor(box.w / perRow), h: Math.floor(box.h / Math.ceil(n / perRow)) });
    if (!c) continue;
    const area = c.block.w * c.block.h;
    const bestArea = best ? best.block.w * best.block.h : -1;
    if (area > bestArea || (best && area === bestArea && c.pad > best.pad)) best = at(c, perRow);
  }
  if (best) return best;

  // A box too small for even 1px blocks (never a real column): the smallest blocks.
  const tiny = 1 + 2 * MIN_PAD;
  return at(
    { scale: Math.min(1 / spec.block.w, 1 / spec.block.h), block: { w: 1, h: 1 }, pad: MIN_PAD, cell: { w: tiny, h: tiny } },
    Math.max(1, Math.min(n, Math.floor(box.w / tiny))),
  );
}
