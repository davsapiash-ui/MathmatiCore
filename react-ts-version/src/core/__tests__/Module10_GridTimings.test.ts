import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { GRID_AUTO_HIDE_SECONDS, GRID_FADE_IN_SECONDS, shouldAutoHideAdaptiveGrid } from '@/core/hesitationStages';

/**
 * The pedagogical matrix (מסמך 05), owner decision 6.9.2026 (register item 13):
 * "המערכת תטען את הלוח באנימציית עמעום רכה של בדיוק שתי שניות וחצי … תעלים
 * את הלוח באופן אוטומטי בדיוק שלוש שניות לאחר זיהוי אירוע קלט מוצלח של
 * בחירת ספרה או תשובה". Only for enhanced_cognitive_support (PRD Module 10).
 */
const grid = readFileSync(resolve(__dirname, '../../features/workspace/board/AdaptiveAdditionGrid.tsx'), 'utf-8');
const page = readFileSync(resolve(__dirname, '../../features/workspace/StudentWorkspacePage.tsx'), 'utf-8');

describe('Module 10 — matrix timings of the adaptive addition grid', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useAuthStore.setState({ user: null });
  });

  it('fades in over exactly 2.5 seconds and hides 3 seconds after a correct digit', () => {
    expect(GRID_FADE_IN_SECONDS).toBe(2.5);
    expect(GRID_AUTO_HIDE_SECONDS).toBe(3);
    expect(grid).toMatch(/transition=\{\{ duration: GRID_FADE_IN_SECONDS/);
    expect(grid).toMatch(/GRID_AUTO_HIDE_SECONDS \* 1000 - \(Date\.now\(\) - lastCorrectDigitAt\)/);
    expect(grid).toMatch(/const timer = setTimeout\(\(\) => closeAdditionHelper\(\), remaining\);/);
  });

  it('only a correct digit starts the auto-hide; a wrong or unverifiable one leaves the board', () => {
    expect(shouldAutoHideAdaptiveGrid({ isAdditionHelperOpen: true, isCorrect: true })).toBe(true);
    expect(shouldAutoHideAdaptiveGrid({ isAdditionHelperOpen: true, isCorrect: false })).toBe(false);
    expect(shouldAutoHideAdaptiveGrid({ isAdditionHelperOpen: true, isCorrect: null })).toBe(false);
    expect(shouldAutoHideAdaptiveGrid({ isAdditionHelperOpen: false, isCorrect: true })).toBe(false);
  });

  it('the store stamps the learner\'s clock on a correct result digit and not on a wrong one', () => {
    const store = useWorkspaceStore.getState();
    store.initSession(3, false);
    expect(useWorkspaceStore.getState().lastCorrectDigitAt).toBeNull();

    // A wrong digit: the stamp stays null.
    const before = Date.now();
    const s = useWorkspaceStore.getState();
    const task = getActiveTasks(s)[s.standardTaskIdx] as { correctAnswer?: number | string } | undefined;
    const target = typeof task?.correctAnswer === 'number' ? task.correctAnswer : null;
    if (target === null) return; // no arithmetic task in this bank; nothing to assert
    const unitsDigit = target % 10;
    const wrong = (unitsDigit + 1) % 10;
    useWorkspaceStore.getState().setAnswerDigit('units', String(wrong));
    expect(useWorkspaceStore.getState().lastCorrectDigitAt).toBeNull();

    useWorkspaceStore.getState().setAnswerDigit('units', String(unitsDigit));
    const at = useWorkspaceStore.getState().lastCorrectDigitAt;
    expect(at).not.toBeNull();
    expect(at as number).toBeGreaterThanOrEqual(before);
  });

  it('the exit animation is owned by the page so the board fades out after the store closes it', () => {
    expect(page).toMatch(/<AnimatePresence>\s*\{isAdditionHelperOpen && \(/);
    expect(grid).not.toContain('<AnimatePresence>');
    expect(page).toMatch(/isAdditionBoardEnabled && \(\s*<AnimatePresence>/);
  });
});
