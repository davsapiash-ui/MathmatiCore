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
 * The owner approved this on 28.9.2026 (register, gap כ): every block the digit
 * counts is shown, shrinking only as much as needed, with click and drag working
 * at every size — even below the 44×44 touch target of DESIGN_SYSTEM_RULES §1.2.
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

/** Below this the cell padding stops shrinking with the block; the click area keeps a margin. */
const MIN_PAD = 1;

function cellAt(spec: CellSpec, scale: number): { block: Size; pad: number; cell: Size } {
  const block = { w: Math.floor(spec.block.w * scale), h: Math.floor(spec.block.h * scale) };
  const pad = Math.max(MIN_PAD, Math.floor(spec.pad * scale));
  return { block, pad, cell: { w: block.w + 2 * pad, h: block.h + 2 * pad } };
}

function fits(spec: CellSpec, scale: number, perRow: number, count: number, box: Size): boolean {
  const { cell } = cellAt(spec, scale);
  const rows = Math.ceil(count / perRow);
  return perRow * cell.w <= box.w && rows * cell.h <= box.h;
}

/**
 * The largest scale (never above 1) at which `count` cells fit in `box`, and how
 * many go in a row. Cells sit edge to edge; rows wrap.
 */
export function fitBlockGrid(count: number, spec: CellSpec, box: Size): BlockGridFit {
  const n = Math.max(0, Math.floor(count));
  const done = (scale: number, perRow: number): BlockGridFit => {
    const c = cellAt(spec, scale);
    return { scale, perRow, rows: n === 0 ? 0 : Math.ceil(n / perRow), ...c };
  };
  if (n === 0 || box.w <= 0 || box.h <= 0) return done(1, Math.max(1, n));

  let best = { scale: 0, perRow: 1 };
  for (let perRow = 1; perRow <= n; perRow++) {
    const rows = Math.ceil(n / perRow);
    // Continuous upper bound, then step down until the rounded cells really fit.
    const sw = box.w / (perRow * (spec.block.w + 2 * spec.pad));
    const sh = box.h / (rows * (spec.block.h + 2 * spec.pad));
    let scale = Math.min(1, sw, sh);
    while (scale > 0.01 && !fits(spec, scale, perRow, n, box)) scale -= 0.01;
    if (scale > best.scale + 1e-9) best = { scale, perRow };
    if (scale >= 1) {
      // At full size, the fewest rows that fit is the widest row that fits.
      let widest = perRow;
      while (widest < n && fits(spec, 1, widest + 1, n, box)) widest++;
      return done(1, widest);
    }
  }
  // Returned exactly as checked: rounding it up could tip a block onto the next
  // pixel and make the grid one pixel too big for the column.
  return done(Math.max(0.01, best.scale), best.perRow);
}
