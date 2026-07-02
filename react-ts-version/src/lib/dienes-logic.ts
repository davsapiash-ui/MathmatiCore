/**
 * Pure functions for Dienes blocks regrouping logic (Base 10 arithmetic).
 * These functions have no dependencies on React or UI, making them easy to unit test.
 */

export interface BlockCounts {
  thousands?: number;
  hundreds?: number;
  tens?: number;
  units?: number;
}

/**
 * Normalizes undefined counts to zero.
 */
export function normalizeBlocks(blocks: BlockCounts): Required<BlockCounts> {
  return {
    thousands: blocks.thousands || 0,
    hundreds: blocks.hundreds || 0,
    tens: blocks.tens || 0,
    units: blocks.units || 0,
  };
}

/**
 * Calculates the total numeric value of a block representation.
 */
export function getNumericValue(blocks: BlockCounts): number {
  const n = normalizeBlocks(blocks);
  return n.thousands * 1000 + n.hundreds * 100 + n.tens * 10 + n.units;
}

/**
 * Converts a pure number into its standard (canonical) block representation.
 * E.g. 245 => 2 hundreds, 4 tens, 5 units
 */
export function numberToCanonicalBlocks(value: number): Required<BlockCounts> {
  return {
    thousands: Math.floor(value / 1000),
    hundreds: Math.floor((value % 1000) / 100),
    tens: Math.floor((value % 100) / 10),
    units: value % 10,
  };
}

/**
 * Groups up (composes): 10 smaller units become 1 larger unit.
 * E.g., composing 10 units -> +1 ten.
 */
export function groupUp(blocks: BlockCounts, fromPlace: "units" | "tens" | "hundreds"): Required<BlockCounts> {
  const res = normalizeBlocks(blocks);
  if (fromPlace === "units" && res.units >= 10) {
    res.units -= 10;
    res.tens += 1;
  } else if (fromPlace === "tens" && res.tens >= 10) {
    res.tens -= 10;
    res.hundreds += 1;
  } else if (fromPlace === "hundreds" && res.hundreds >= 10) {
    res.hundreds -= 10;
    res.thousands += 1;
  }
  return res;
}

/**
 * Breaks down (decomposes): 1 larger unit becomes 10 smaller units.
 * E.g., decomposing 1 ten -> +10 units.
 */
export function groupDown(blocks: BlockCounts, fromPlace: "thousands" | "hundreds" | "tens"): Required<BlockCounts> {
  const res = normalizeBlocks(blocks);
  if (fromPlace === "thousands" && res.thousands >= 1) {
    res.thousands -= 1;
    res.hundreds += 10;
  } else if (fromPlace === "hundreds" && res.hundreds >= 1) {
    res.hundreds -= 1;
    res.tens += 10;
  } else if (fromPlace === "tens" && res.tens >= 1) {
    res.tens -= 1;
    res.units += 10;
  }
  return res;
}
