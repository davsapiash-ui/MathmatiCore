import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import {
  GRID_STAGE_SECONDS,
  DEFAULT_SOCRATIC_STAGE_SECONDS,
  shouldOpenAdaptiveGrid,
} from '@/core/hesitationStages';

/**
 * These tests used to drive a `tickHesitationTimer` store action that no
 * component ever called, so they proved nothing about the shipped behaviour.
 * They now pin the rule the live radar actually consults.
 */
describe('Module 10: מודול לוח חיבור אדפטיבי מבוקר (Canonical PRD v7.0)', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useAuthStore.setState({ user: null });
  });

  it('opens the adaptive grid at the 30s stage strictly for enhanced_cognitive_support', () => {
    expect(GRID_STAGE_SECONDS).toBe(30);
    expect(
      shouldOpenAdaptiveGrid({
        supportProfileId: 'enhanced_cognitive_support',
        sessionNumber: 3,
        isAdditionHelperOpen: false,
      })
    ).toBe(true);
  });

  it('does NOT open the adaptive grid for standard learners without enhanced support', () => {
    expect(
      shouldOpenAdaptiveGrid({
        supportProfileId: null,
        sessionNumber: 3,
        isAdditionHelperOpen: false,
      })
    ).toBe(false);
    expect(
      shouldOpenAdaptiveGrid({
        supportProfileId: undefined,
        sessionNumber: 5,
        isAdditionHelperOpen: false,
      })
    ).toBe(false);
  });

  it('never opens the adaptive grid during the diagnostic (2) or reflection (8) sessions', () => {
    for (const sessionNumber of [2, 8]) {
      expect(
        shouldOpenAdaptiveGrid({
          supportProfileId: 'enhanced_cognitive_support',
          sessionNumber,
          isAdditionHelperOpen: false,
        })
      ).toBe(false);
    }
  });

  it('does not re-open the grid while it is already on screen', () => {
    expect(
      shouldOpenAdaptiveGrid({
        supportProfileId: 'enhanced_cognitive_support',
        sessionNumber: 4,
        isAdditionHelperOpen: true,
      })
    ).toBe(false);
  });

  it('places the grid stage strictly before the Socratic stage', () => {
    expect(GRID_STAGE_SECONDS).toBeLessThan(DEFAULT_SOCRATIC_STAGE_SECONDS);
  });

  it('resets the hesitation measurement upon cognitive user interaction', () => {
    const store = useWorkspaceStore.getState();
    store.initSession(3, false);

    // The radar writes the measured duration when a stage fires.
    useWorkspaceStore.setState({ hesitationTimerSeconds: 47 } as any);
    expect(useWorkspaceStore.getState().hesitationTimerSeconds).toBe(47);

    // Cognitive interaction recorded (e.g. disk movement, keyboard press)
    store.recordUserInteraction();
    expect(useWorkspaceStore.getState().hesitationTimerSeconds).toBe(0);
  });
});
