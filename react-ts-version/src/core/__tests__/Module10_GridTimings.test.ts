import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GRID_FADE_IN_SECONDS } from '@/core/hesitationStages';

/**
 * Owner decision 7.9.2026 (register item 13): the adaptive addition grid
 * fades in over 2 seconds and stays until the learner closes it with the X.
 * The matrix's automatic hide 3 seconds after a correct digit was built,
 * then rejected by the owner ("עדיף להשאיר את הלוח עם כפתור סגירה").
 * Profile gate and 30s stage: unchanged (Module10_AdaptiveGrid.test.ts).
 */
const grid = readFileSync(resolve(__dirname, '../../features/workspace/board/AdaptiveAdditionGrid.tsx'), 'utf-8');
const page = readFileSync(resolve(__dirname, '../../features/workspace/StudentWorkspacePage.tsx'), 'utf-8');
const store = readFileSync(resolve(__dirname, '../../application/useWorkspaceStore.ts'), 'utf-8');

describe('Module 10 — adaptive addition grid: slow fade-in, closed by the learner only', () => {
  it('fades in over 2 seconds', () => {
    expect(GRID_FADE_IN_SECONDS).toBe(2);
    expect(grid).toMatch(/transition=\{\{ duration: GRID_FADE_IN_SECONDS/);
  });

  it('has the X and nothing else closes it', () => {
    expect(grid).toContain('aria-label="סגור לוח עזר"');
    expect(grid).not.toMatch(/setTimeout\([^)]*closeAdditionHelper/);
    expect(grid).not.toMatch(/AUTO_HIDE|lastCorrectDigitAt/);
    expect(store).not.toContain('lastCorrectDigitAt');
  });

  it('the exit animation is owned by the page so the board fades out after the store closes it', () => {
    expect(page).toMatch(/<AnimatePresence>\s*\{isAdditionHelperOpen && \(/);
    expect(grid).not.toContain('<AnimatePresence>');
    expect(page).toMatch(/isAdditionBoardEnabled && \(\s*<AnimatePresence>/);
  });
});
