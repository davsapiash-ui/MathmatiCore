/**
 * Pure place-value model — faithful port of the vanilla source of truth
 * (vanilla_audit/js/manipulatives.js: PlaceValueModel + DragController.handleDrop).
 * No React, no DOM. Every rule here is pedagogy, not styling:
 *  - הקפצה (regrouping): 10 low → 1 high; auto only when scaffoldLevel < 2, chained carries.
 *  - פריטה (decomposition): 1 high → 10 low; always student-initiated.
 *  - Adjacent-step-only for manual moves; "cannot take from zero"; ≥10 to regroup manually.
 */

export type Place = 'units' | 'tens' | 'hundreds' | 'thousands';
export type PlaceCounts = Record<Place, number>;

export const PLACE_ORDER: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
export const PLACE_VALUES: Record<Place, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };
export const PLACE_NAMES_HE: Record<Place, string> = {
  units: 'יחידות',
  tens: 'עשרות',
  hundreds: 'מאות',
  thousands: 'אלפים',
};

export const EMPTY_COUNTS: PlaceCounts = { units: 0, tens: 0, hundreds: 0, thousands: 0 };

/** Max blocks rendered per column (model may exceed; badges show true count). */
export const MAX_VISIBLE_BLOCKS = 30;

export interface RegroupEvent { from: Place; to: Place; groups: number }
export interface UngroupEvent { from: Place; to: Place }

export function getValue(counts: PlaceCounts): number {
  if (!counts) return 0;
  return PLACE_ORDER.reduce((sum, p) => sum + (counts[p] || 0) * PLACE_VALUES[p], 0);
}

export function numberToCanonicalCounts(value: number): PlaceCounts {
  return {
    thousands: Math.floor(value / 1000),
    hundreds: Math.floor((value % 1000) / 100),
    tens: Math.floor((value % 100) / 10),
    units: value % 10,
  };
}

/**
 * Chained auto-grouping (vanilla checkAndGroup, manipulatives.js 108–121):
 * single low→high pass; a carry that fills the next place carries again.
 */
export function checkAndGroup(counts: PlaceCounts): { counts: PlaceCounts; events: RegroupEvent[] } {
  const next = { ...counts };
  const events: RegroupEvent[] = [];
  for (let i = 0; i < PLACE_ORDER.length - 1; i++) {
    const from = PLACE_ORDER[i];
    const to = PLACE_ORDER[i + 1];
    if (next[from] >= 10) {
      const groups = Math.floor(next[from] / 10);
      next[from] -= groups * 10;
      next[to] += groups;
      events.push({ from, to, groups });
    }
  }
  return { counts: next, events };
}

/** Add one block; auto-group only when the caller allows it (scaffold-gated). */
export function addBlock(counts: PlaceCounts, place: Place, autoGroup: boolean): { counts: PlaceCounts; events: RegroupEvent[] } {
  if (counts[place] >= MAX_VISIBLE_BLOCKS) return { counts, events: [] };
  const added = { ...counts, [place]: counts[place] + 1 };
  return autoGroup ? checkAndGroup(added) : { counts: added, events: [] };
}

/** Remove one block; null when the column is empty ("cannot take from zero"). */
export function removeBlock(counts: PlaceCounts, place: Place): PlaceCounts | null {
  if (counts[place] <= 0) return null;
  return { ...counts, [place]: counts[place] - 1 };
}

/** פריטה בלחיצה: 1 high → 10 adjacent-low (Tens→Units, Hundreds→Tens, Thousands→Hundreds). */
export function splitBlockClick(counts: PlaceCounts, place: Place): { counts: PlaceCounts; event: UngroupEvent } | null {
  return ungroupBlock(counts, place);
}

/** הקבצה מפורשת בלחיצה על כפתור "הקבץ": 10 adjacent-low → 1 high (Units→Tens, Tens→Hundreds, Hundreds→Thousands). */
export function groupBlocksManually(counts: PlaceCounts, fromPlace: Place): { counts: PlaceCounts; event: RegroupEvent } | null {
  const fromIdx = PLACE_ORDER.indexOf(fromPlace);
  if (fromIdx < 0 || fromIdx >= PLACE_ORDER.length - 1) return null;
  if (counts[fromPlace] < 10) return null;
  const toPlace = PLACE_ORDER[fromIdx + 1];
  if (counts[toPlace] >= MAX_VISIBLE_BLOCKS) return null;
  return {
    counts: {
      ...counts,
      [fromPlace]: counts[fromPlace] - 10,
      [toPlace]: counts[toPlace] + 1,
    },
    event: { from: fromPlace, to: toPlace, groups: 1 },
  };
}

/** Palette block dropped on the adjacent-lower column: fresh +10 low, nothing decremented, no auto-group. */
export function addUngroupedFromPalette(counts: PlaceCounts, fromPlace: Place): { counts: PlaceCounts; event: UngroupEvent } | null {
  const fromIdx = PLACE_ORDER.indexOf(fromPlace);
  if (fromIdx <= 0) return null;
  const toPlace = PLACE_ORDER[fromIdx - 1];
  if (counts[toPlace] + 10 > MAX_VISIBLE_BLOCKS) return null;
  return {
    counts: { ...counts, [toPlace]: counts[toPlace] + 10 },
    event: { from: fromPlace, to: toPlace },
  };
}

export function ungroupBlock(counts: PlaceCounts, place: Place): { counts: PlaceCounts; event: UngroupEvent } | null {
  const fromIdx = PLACE_ORDER.indexOf(place);
  if (fromIdx <= 0) return null;
  if (counts[place] <= 0) return null;
  const toPlace = PLACE_ORDER[fromIdx - 1];
  // Fix 3: Enforce strict MAX_VISIBLE_BLOCKS (30) column bounds to eliminate phantom blocks
  if (counts[toPlace] + 10 > MAX_VISIBLE_BLOCKS) return null;
  return {
    counts: {
      ...counts,
      [place]: counts[place] - 1,
      [toPlace]: counts[toPlace] + 10,
    },
    event: { from: place, to: toPlace },
  };
}

// ── Drop resolution (the whole vanilla DragController.handleDrop rule table) ──

export type DragSource = 'palette' | 'column';

export interface DropInput {
  source: DragSource;
  sourcePlace: Place;
  target: { kind: 'column'; place: Place } | { kind: 'trash' };
}

export type DropResult =
  | { ok: true; counts: PlaceCounts; regroupEvents: RegroupEvent[]; ungroupEvent?: UngroupEvent; removed?: Place }
  | { ok: false; reason: 'silent' }
  | { ok: false; reason: 'constraint'; place: Place };

export function resolveDrop(counts: PlaceCounts, input: DropInput, _scaffoldLevel: number): DropResult {
  if (!input || !input.target) {
    return { ok: false, reason: 'silent' };
  }

  // בעקבות אפיון פדגוגי מחמיר: הפיזיקה של בית המספרים לא עושה "קסמים". 
  // ביטול מוחלט של הקפצה אוטומטית (autoGroup = false) כדי לאפשר פריטה אמינה בשלבי חיסור מאוחרים.
  const autoGroup = false;

  // Trash: only blocks taken from a column may be deleted (palette drags are copies).
  if (input.target.kind === 'trash') {
    if (input.source !== 'column') return { ok: false, reason: 'silent' };
    const next = removeBlock(counts, input.sourcePlace);
    if (!next) return { ok: false, reason: 'constraint', place: input.sourcePlace };
    return { ok: true, counts: next, regroupEvents: [], removed: input.sourcePlace };
  }

  const srcIdx = PLACE_ORDER.indexOf(input.sourcePlace);
  const tgtIdx = PLACE_ORDER.indexOf(input.target.place);
  const targetPlace = input.target.place;

  if (input.source === 'palette') {
    // Same place: plain add (scaffold-conditional auto-group, chained).
    if (srcIdx === tgtIdx) {
      const { counts: next, events } = addBlock(counts, targetPlace, autoGroup);
      return { ok: true, counts: next, regroupEvents: events };
    }
    // Adjacent lower: instant decomposition of a fresh palette block (+10 low).
    if (srcIdx - tgtIdx === 1) {
      const res = addUngroupedFromPalette(counts, input.sourcePlace);
      if (!res) return { ok: false, reason: 'constraint', place: targetPlace };
      return { ok: true, counts: res.counts, regroupEvents: [], ungroupEvent: res.event };
    }
    // Any other drop of a palette block onto the board routes safely to its own column
    const { counts: next, events } = addBlock(counts, input.sourcePlace, autoGroup);
    return { ok: true, counts: next, regroupEvents: events };
  }

  // source === 'column'
  if (srcIdx === tgtIdx) return { ok: false, reason: 'silent' };

  // פריטה: adjacent lower only.
  if (srcIdx - tgtIdx === 1) {
    const res = ungroupBlock(counts, input.sourcePlace);
    if (!res) return { ok: false, reason: 'constraint', place: targetPlace };
    return { ok: true, counts: res.counts, regroupEvents: [], ungroupEvent: res.event };
  }

  // Non-adjacent or upward drag: rejected (regrouping must use the explicit "הקבץ" button per PRD).
  return { ok: false, reason: 'constraint', place: targetPlace };
}
