import type { PlaceCounts } from './placeValue';

/**
 * The digit beside each column's name on the board (how many blocks it holds).
 *
 * Owner, 29.9.2026: the digit changes by itself with the blocks, so wherever the
 * child has to build, calculate or write an answer, it hands them the answer —
 * "3, 0, 5" to match while building 305, "3" and "7" to copy after 61 − 24. The
 * move from blocks to digits is the child's own step in the VRA model, so the
 * digit shows only where watching it IS the step:
 *   - station 1, steps 1–3 (free exploration, decomposing a hundred): "צפו
 *     בספרות המשתנות" — meeting the link between blocks and digits;
 *   - station 1, building 305: hidden while building, shown once the board is
 *     305, so the child sees the 0 appear over the empty tens column;
 *   - everywhere else in station 1: hidden.
 * Stations 3–7 (owner, 29.9.2026; carried out 30.9.2026 after a station-by-station
 * analysis): hidden for the whole exercise — the child counts the blocks and
 * writes the digit themselves. The teacher's demonstration screen keeps them
 * in station 1 (`projectorBoard` in the workspace store); in stations 3–7 it
 * shows the board as the learners see it (Module 15 §ג, 9.10.2026).
 */
const STATION1_SHOWN = new Set(['s1_sandbox_controlled', 's1_decompose_hundred']);

const boardValue = (c: PlaceCounts) => c.units + c.tens * 10 + c.hundreds * 100 + c.thousands * 1000;

export function columnDigitsShown(sessionNumber: number, taskId: string | null | undefined, counts: PlaceCounts): boolean {
  if (sessionNumber >= 3 && sessionNumber <= 7) return false;
  if (sessionNumber !== 1) return true;
  if (!taskId) return true;
  if (STATION1_SHOWN.has(taskId)) return true;
  if (taskId === 's1_build_305') return boardValue(counts) === 305;
  return false;
}
