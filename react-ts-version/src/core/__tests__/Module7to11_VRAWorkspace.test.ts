import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '../../application/useWorkspaceStore';
import { resolveDrop, EMPTY_COUNTS } from '../../core/placeValue';
import { stateReducer } from '../../machines/vraMachine';
import { SocraticEngine } from '../../infrastructure/services/SocraticEngine';

describe('Work Package 3 (WP3): Student Learning Space & VRA Engine Comprehensive Suite', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
  });

  describe('1. Module 6: Student Lobby & Single Document Active Session Tracking', () => {
    it('initializes workspace with proper session bounds (1-8) and defaults to Problem Active', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(1, false);

      expect(useWorkspaceStore.getState().sessionNumber).toBe(1);
      expect(useWorkspaceStore.getState().currentState).toBe('PROBLEM_ACTIVE');
      expect(useWorkspaceStore.getState().flowStatus).toBe('task');
    });

    it('sanitizes illegal session numbers back into 1..8 range', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(99 as any, false);
      expect(useWorkspaceStore.getState().sessionNumber).toBe(1);
    });

    it('resets all interaction state when moving to a new session', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(1, false);
      useWorkspaceStore.setState({
        counts: { units: 5, tens: 2, hundreds: 0, thousands: 0 },
        undoCount: 4,
        hesitationCount: 2,
        hasInteracted: true,
      });

      store.initSession(2, false);
      const state = useWorkspaceStore.getState();
      expect(state.counts.units).toBe(0);
      expect(state.undoCount).toBe(0);
      expect(state.hesitationCount).toBe(0);
      expect(state.hasInteracted).toBe(false);
    });
  });

  describe('2. Module 7: PlaceValueBoard Column Dimming & Pointer Lock', () => {
    it('accurately tracks activeColumnIndex across state machine transitions', () => {
      const store = useWorkspaceStore.getState();
      store.setActiveColumnIndex(1); // Tens column active
      expect(useWorkspaceStore.getState().activeColumnIndex).toBe(1);

      store.setActiveColumnIndex(0); // Units column active
      expect(useWorkspaceStore.getState().activeColumnIndex).toBe(0);
    });

    it('manages focus place overrides for targeted column interaction', () => {
      const store = useWorkspaceStore.getState();
      store.setFocusedPlace('tens');
      expect(useWorkspaceStore.getState().focusedPlace).toBe('tens');

      store.setFocusedPlace(null);
      expect(useWorkspaceStore.getState().focusedPlace).toBeNull();
    });

    it('determines column dimming when focused place is specific', () => {
      const store = useWorkspaceStore.getState();
      store.setFocusedPlace('units');
      const focusedPlace = useWorkspaceStore.getState().focusedPlace;

      const isUnitsDimmed = focusedPlace !== null && focusedPlace !== 'units';
      const isTensDimmed = focusedPlace !== null && focusedPlace !== 'tens';
      const isHundredsDimmed = focusedPlace !== null && focusedPlace !== 'hundreds';

      expect(isUnitsDimmed).toBe(false); // Active column is NOT dimmed
      expect(isTensDimmed).toBe(true);  // Inactive column is dimmed (opacity 0.7, brightness 0.6)
      expect(isHundredsDimmed).toBe(true);
    });
  });

  describe('3. Module 8 & 11: VirtualBlocksDock & Canvas2D Dienes Snap', () => {
    it('resolves valid drops from dock palette to column', () => {
      const initialCounts = { ...EMPTY_COUNTS };
      const res = resolveDrop(initialCounts, {
        source: 'palette',
        sourcePlace: 'units',
        target: { kind: 'column', place: 'units' },
      }, 1);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.counts.units).toBe(1);
      }
    });

    it('supports automatic ungrouping of tens to units on cross-column drag', () => {
      const initialCounts = { ...EMPTY_COUNTS, tens: 1 };
      const res = resolveDrop(initialCounts, {
        source: 'column',
        sourcePlace: 'tens',
        target: { kind: 'column', place: 'units' },
      }, 1);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.counts.tens).toBe(0);
        expect(res.counts.units).toBe(10);
        expect(res.ungroupEvent).toBeDefined();
      }
    });

    it('enforces Module 11 contract: block deletion does NOT count as an Undo action', () => {
      const store = useWorkspaceStore.getState();
      store.applyDrop({
        source: 'palette',
        sourcePlace: 'units',
        target: { kind: 'column', place: 'units' },
      });
      expect(useWorkspaceStore.getState().counts.units).toBe(1);

      // Drag to trash
      store.applyDrop({
        source: 'column',
        sourcePlace: 'units',
        target: { kind: 'trash' },
      });
      expect(useWorkspaceStore.getState().counts.units).toBe(0);
      expect(useWorkspaceStore.getState().hasDeletedBlock).toBe(true);
      expect(useWorkspaceStore.getState().undoCount).toBe(0); // Module 11 contract
    });
  });

  describe('4. Module 9: DynamicKeyboard & Conditional Regrouping Lock', () => {
    it('locks keyboard when dynamic exchange is required but not yet performed', () => {
      const store = useWorkspaceStore.getState();
      useWorkspaceStore.setState({ support_profile_id: 'enhanced_cognitive_support' } as any);
      // In addition 17 + 8: units need exchange (7+8=15 >= 10). Without grouping, column is locked.
      const isLocked = store.isColumnInputLocked('units', 17, 8, false);
      expect(isLocked).toBe(true);
    });

    it('unlocks keyboard after regrouping/grouping operation completes', () => {
      const store = useWorkspaceStore.getState();
      useWorkspaceStore.setState({ support_profile_id: 'enhanced_cognitive_support', hasGrouped: true } as any);

      const isLocked = store.isColumnInputLocked('units', 17, 8, false);
      expect(isLocked).toBe(false);
    });

    it('locks keyboard in subtraction when ungrouping/exchange is required and not performed', () => {
      const store = useWorkspaceStore.getState();
      useWorkspaceStore.setState({ support_profile_id: 'enhanced_cognitive_support' } as any);
      // In subtraction 52 - 17: units need ungrouping (2 < 7).
      const isLocked = store.isColumnInputLocked('units', 52, 17, true);
      expect(isLocked).toBe(true);

      // After ungrouping
      useWorkspaceStore.setState({ hasUngrouped: true });
      const isUnlocked = store.isColumnInputLocked('units', 52, 17, true);
      expect(isUnlocked).toBe(false);
    });

    it('transitions keyboardState via stateReducer and guarantees Undo never locks keyboard', () => {
      let state = stateReducer('LOCKED', { type: 'BLOCK_GROUP_SUCCESS' });
      expect(state).toBe('UNLOCKED');

      state = stateReducer('LOCKED', { type: 'HESITATION_TIMER_EXPIRE' });
      expect(state).toBe('SOCRATIC_ONLY');

      state = stateReducer('SOCRATIC_ONLY', { type: 'SOCRATIC_SUCCESS' });
      expect(state).toBe('UNLOCKED');

      // Module 11 contract: Undo never locks keyboard
      state = stateReducer('UNLOCKED', { type: 'UNDO_CLICK' });
      expect(state).toBe('UNLOCKED');
    });
  });

  describe('5. Module 10: AdaptiveAdditionGrid & 30-Second Hesitation Trigger', () => {
    it('manages addition helper visibility via workspace store', () => {
      const store = useWorkspaceStore.getState();
      expect(store.isAdditionHelperOpen).toBe(false);

      store.openAdditionHelper();
      expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(true);

      store.closeAdditionHelper();
      expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(false);
    });

    it('triggers adaptive addition grid appearance at exactly 30s hesitation strictly for enhanced_cognitive_support profile', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(3, false);
      useWorkspaceStore.setState({ support_profile_id: 'enhanced_cognitive_support' } as any);

      expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(false);
      expect(useWorkspaceStore.getState().hesitationTimerSeconds).toBe(0);

      // Tick hesitation to 29s
      for (let i = 0; i < 29; i++) {
        useWorkspaceStore.getState().tickHesitationTimer();
      }
      expect(useWorkspaceStore.getState().hesitationTimerSeconds).toBe(29);
      expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(false);

      // Tick 30th second -> triggers addition helper for enhanced profile
      useWorkspaceStore.getState().tickHesitationTimer();
      expect(useWorkspaceStore.getState().hesitationTimerSeconds).toBe(30);
      expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(true);
    });

    it('does NOT trigger adaptive addition grid at 30s for standard learners without enhanced support', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(1, false);
      useWorkspaceStore.setState({ support_profile_id: null } as any);

      for (let i = 0; i < 35; i++) {
        useWorkspaceStore.getState().tickHesitationTimer();
      }
      expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(false);
    });
  });

  describe('6. Modules 12 & 13: Socratic Mentoring & 60s Penalty Lockout Scope', () => {
    it('triggers Socratic coach after 45s of hesitation across sessions', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(1, false);

      // Fast forward hesitation timer
      for (let i = 0; i < 45; i++) {
        useWorkspaceStore.getState().tickHesitationTimer();
      }

      expect(useWorkspaceStore.getState().hesitationTimerSeconds).toBe(45);
      expect(useWorkspaceStore.getState().hesitationCount).toBeGreaterThanOrEqual(1);
    });

    it('triggers Socratic coach after 4 consecutive errors', () => {
      const store = useWorkspaceStore.getState();
      store.initSession(1, false);

      store.incrementConsecutiveErrors();
      store.incrementConsecutiveErrors();
      store.incrementConsecutiveErrors();
      store.incrementConsecutiveErrors();

      expect(useWorkspaceStore.getState().consecutiveErrorCount).toBe(4);
      // Module 16 §ב: the persistence index's E term is derived exclusively
      // from DIGIT_ENTERED events with is_correct: false (setAnswerDigit /
      // setCarryDigit). Consecutive-error tracking is Module 12's Socratic
      // trigger and must not bump typedErrorCount — doing so counted block
      // manipulation failures as typed digit errors and understated the score
      // shown on the Session 8 reflection board.
      expect(useWorkspaceStore.getState().typedErrorCount).toBe(0);
    });

    it('enforces 60-second penalty lockout strictly on Socratic card buttons while Canvas & Undo remain active', () => {
      const store = useWorkspaceStore.getState();
      expect(store.isSocraticCardLocked).toBe(false);

      // Trigger lockout
      store.triggerSocraticPenaltyLockout('Incorrect choice');
      const state = useWorkspaceStore.getState();

      // 1. Socratic card is locked
      expect(state.isSocraticCardLocked).toBe(true);
      expect(state.socraticLockDeadline).toBeGreaterThan(Date.now());
      expect(state.socraticPenaltyLockoutUntil).toBeGreaterThan(Date.now());
      expect(state.socraticDistractorErrors).toBe(1);

      // 2. Canvas manipulation remains fully ACTIVE and unlocked during Socratic lockout
      expect(state.isBoardLocked).toBe(false);
      store.applyDrop({
        source: 'palette',
        sourcePlace: 'units',
        target: { kind: 'column', place: 'units' },
      });
      expect(useWorkspaceStore.getState().counts.units).toBe(1);

      // 3. Undo remains fully ACTIVE during Socratic lockout
      store.undo();
      expect(useWorkspaceStore.getState().counts.units).toBe(0);
      expect(useWorkspaceStore.getState().undoCount).toBe(1);

      // Clear lockout
      store.clearSocraticPenaltyLockout();
      expect(useWorkspaceStore.getState().isSocraticCardLocked).toBe(false);
      expect(useWorkspaceStore.getState().socraticLockDeadline).toBeNull();
      expect(useWorkspaceStore.getState().getSocraticPenaltyRemaining()).toBe(0);
    });

    it('falls back seamlessly to static pedagogical hint when LLM is unavailable', async () => {
      // Mock fetch failure
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

      const mockTask = {
        id: 's3_addition_01',
        titleHe: 'חיבור במאונך',
        instructionHe: 'פתרו את התרגיל',
        targetNode: 'q_matrix_q4_addition',
        type: 'vertical_addition' as const,
        numberA: 28,
        numberB: 15,
      };

      const hint = await SocraticEngine.getSocraticHint(
        mockTask,
        'q_matrix_q4_addition',
        { units: 13, tens: 3, hundreds: 0, thousands: 0 },
        { undo_clicks: 1, hesitation_events: 1 }
      );

      expect(hint).not.toBeNull();
      if (hint) {
        expect(hint.questionHe).toBeTruthy();
        expect(hint.choices.length).toBe(3);
        expect(hint.correctChoiceId).toBeTruthy();
      }

      globalThis.fetch = originalFetch;
    });
  });
});
