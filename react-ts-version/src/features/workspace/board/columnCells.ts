import type { Place } from '@/core/placeValue';
import type { CellSpec } from '@/core/blockLayout';
import { BLOCK_SIZES } from './DienesBlock';

/**
 * Each block's cell at its drawn size: the block plus the padding that makes up
 * its click-and-drag area. A unit cube is 20px, so it gets 12px around it — a
 * 44×44px target (DESIGN_SYSTEM_RULES §1.2), as it had before cells existed.
 */
export const COLUMN_CELLS: Record<Place, CellSpec> = {
  units: { block: BLOCK_SIZES.units, pad: 12 },
  tens: { block: BLOCK_SIZES.tens, pad: 4 },
  hundreds: { block: BLOCK_SIZES.hundreds, pad: 4 },
  thousands: { block: BLOCK_SIZES.thousands, pad: 4 },
};
