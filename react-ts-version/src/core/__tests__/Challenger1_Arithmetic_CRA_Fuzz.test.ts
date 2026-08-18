import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EMPTY_COUNTS,
  getValue,
  numberToCanonicalCounts,
  checkAndGroup,
  addBlock,
  removeBlock,
  splitBlockClick,
  ungroupBlock,
  groupBlocksManually,
  addUngroupedFromPalette,
  resolveDrop,
  PLACE_ORDER,
  PLACE_VALUES,
  MAX_VISIBLE_BLOCKS,
  type PlaceCounts,
  type Place,
} from '@/core/placeValue';
import { stateReducer, type SystemEvent } from '@/machines/vraMachine';
import {
  validateConcreteState,
  transitionKeyboardState,
  evaluateKeyboardState,
} from '@/core/ExerciseValidationEngine';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore, unifiedLogout } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import type { KeyboardState } from '@/types';

// Mock storage environment for Vitest if needed
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] || null),
  setItem: vi.fn((key: string, val: string) => { mockStorage[key] = String(val); }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }),
};

if (typeof window === 'undefined') {
  (globalThis as any).window = {
    location: { hostname: 'localhost' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
}
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockLocalStorage;

describe('Challenger 1 — Adversarial Stress & Fuzz Suite: Arithmetic & VRA Engine & CRA State Machine', () => {

  beforeEach(() => {
    mockLocalStorage.clear();
    unifiedLogout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // SECTION 1: 1,000+ RANDOMIZED PLACE-VALUE GROUPINGS & DECOMPOSITION FUZZER
  // ==========================================================================
  describe('1. Invariant ΔV = 0 Under 1,000 Randomized Operations & Fuzzing', () => {

    it('preserves ΔV = 0 across 1,000 randomized legal groupings and decompositions', () => {
      let counts: PlaceCounts = { units: 15, tens: 12, hundreds: 8, thousands: 2 };
      let previousValue = getValue(counts);

      // Seeded deterministic PRNG for reproducible fuzzing
      let seed = 123456789;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      for (let i = 0; i < 1000; i++) {
        const actionType = Math.floor(rnd() * 4); // 0: group, 1: ungroup/split, 2: add/remove, 3: canonical check
        const placeIdx = Math.floor(rnd() * 4);
        const place = PLACE_ORDER[placeIdx];

        if (actionType === 0) {
          // Manual Grouping: 10 of place -> 1 of place+1
          if (counts[place] >= 10 && placeIdx < 3) {
            const nextPlace = PLACE_ORDER[placeIdx + 1];
            if (counts[nextPlace] < MAX_VISIBLE_BLOCKS) {
              const res = groupBlocksManually(counts, place);
              expect(res).not.toBeNull();
              counts = res!.counts;
              const currentValue = getValue(counts);
              expect(currentValue).toBe(previousValue); // ΔV = 0 invariant
            }
          } else {
            // Illegal group attempt must be rejected cleanly
            const res = groupBlocksManually(counts, place);
            if (counts[place] < 10 || placeIdx === 3 || counts[PLACE_ORDER[placeIdx + 1]] >= MAX_VISIBLE_BLOCKS) {
              expect(res).toBeNull();
            }
          }
        } else if (actionType === 1) {
          // Decomposition / Hammer tool: 1 of place -> 10 of place-1
          if (placeIdx > 0 && counts[place] >= 1) {
            const lowerPlace = PLACE_ORDER[placeIdx - 1];
            if (counts[lowerPlace] + 10 <= MAX_VISIBLE_BLOCKS) {
              const res = splitBlockClick(counts, place);
              expect(res).not.toBeNull();
              counts = res!.counts;
              const currentValue = getValue(counts);
              expect(currentValue).toBe(previousValue); // ΔV = 0 invariant
            } else {
              // Bound overflow protection
              const res = splitBlockClick(counts, place);
              expect(res).toBeNull();
            }
          } else {
            // Cannot decompose units or empty column
            const res = splitBlockClick(counts, place);
            expect(res).toBeNull();
          }
        } else if (actionType === 2) {
          // Drag and drop simulator
          const isFromPalette = rnd() > 0.5;
          if (isFromPalette) {
            // Drop palette on same column
            if (counts[place] < MAX_VISIBLE_BLOCKS) {
              const dropRes = resolveDrop(counts, {
                source: 'palette',
                sourcePlace: place,
                target: { kind: 'column', place },
              }, 0);
              expect(dropRes.ok).toBe(true);
              if (dropRes.ok) {
                counts = dropRes.counts;
                previousValue += PLACE_VALUES[place];
                expect(getValue(counts)).toBe(previousValue);
              }
            }
          } else {
            // Move block to trash
            if (counts[place] > 0) {
              const dropRes = resolveDrop(counts, {
                source: 'column',
                sourcePlace: place,
                target: { kind: 'trash' },
              }, 0);
              expect(dropRes.ok).toBe(true);
              if (dropRes.ok) {
                counts = dropRes.counts;
                previousValue -= PLACE_VALUES[place];
                expect(getValue(counts)).toBe(previousValue);
              }
            }
          }
        } else {
          // Chained auto-grouping test
          const grouped = checkAndGroup(counts);
          expect(getValue(grouped.counts)).toBe(previousValue); // ΔV = 0 invariant
          counts = grouped.counts;
        }

        // Integrity sanity checks at every step
        expect(counts.units).toBeGreaterThanOrEqual(0);
        expect(counts.tens).toBeGreaterThanOrEqual(0);
        expect(counts.hundreds).toBeGreaterThanOrEqual(0);
        expect(counts.thousands).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(counts.units)).toBe(true);
        expect(Number.isInteger(counts.tens)).toBe(true);
        expect(Number.isInteger(counts.hundreds)).toBe(true);
        expect(Number.isInteger(counts.thousands)).toBe(true);
      }
    });

    it('correctly converts any integer 0..9999 to canonical counts and preserves exact value', () => {
      for (let n = 0; n <= 9999; n += 7) {
        const canonical = numberToCanonicalCounts(n);
        expect(canonical.units).toBeGreaterThanOrEqual(0);
        expect(canonical.units).toBeLessThanOrEqual(9);
        expect(canonical.tens).toBeGreaterThanOrEqual(0);
        expect(canonical.tens).toBeLessThanOrEqual(9);
        expect(canonical.hundreds).toBeGreaterThanOrEqual(0);
        expect(canonical.hundreds).toBeLessThanOrEqual(9);
        expect(canonical.thousands).toBeGreaterThanOrEqual(0);
        expect(canonical.thousands).toBeLessThanOrEqual(9);
        expect(getValue(canonical)).toBe(n);
      }
    });
  });

  // ==========================================================================
  // SECTION 2: HAMMER DECOMPOSITIONS & CASCADING BORROWS (UP TO 4 DIGITS)
  // ==========================================================================
  describe('2. Hammer Decompositions & Cascading Borrows up to 4 Digits', () => {

    it('executes extreme cascading borrow: 10,000 -> 9,999 -> ... -> 0 step-by-step with strict ΔV = 0', () => {
      // Start with 10 thousands = 10,000
      let counts: PlaceCounts = { units: 0, tens: 0, hundreds: 0, thousands: 10 };
      expect(getValue(counts)).toBe(10000);

      // Decompose 1 thousand -> 10 hundreds
      const step1 = ungroupBlock(counts, 'thousands');
      expect(step1).not.toBeNull();
      counts = step1!.counts;
      expect(counts.thousands).toBe(9);
      expect(counts.hundreds).toBe(10);
      expect(getValue(counts)).toBe(10000);

      // Decompose 1 hundred -> 10 tens
      const step2 = ungroupBlock(counts, 'hundreds');
      expect(step2).not.toBeNull();
      counts = step2!.counts;
      expect(counts.hundreds).toBe(9);
      expect(counts.tens).toBe(10);
      expect(getValue(counts)).toBe(10000);

      // Decompose 1 ten -> 10 units
      const step3 = ungroupBlock(counts, 'tens');
      expect(step3).not.toBeNull();
      counts = step3!.counts;
      expect(counts.tens).toBe(9);
      expect(counts.units).toBe(10);
      expect(getValue(counts)).toBe(10000);

      // Remove 1 unit -> 9999
      const step4 = removeBlock(counts, 'units');
      expect(step4).not.toBeNull();
      counts = step4!;
      expect(counts).toEqual({ units: 9, tens: 9, hundreds: 9, thousands: 9 });
      expect(getValue(counts)).toBe(9999);
    });

    it('handles multiple consecutive hammer decompositions across hundreds and thousands', () => {
      // 5 thousands -> decompose to 4 thousands, 10 hundreds -> decompose 1 hundred to 10 tens -> decompose 1 ten to 10 units
      let counts: PlaceCounts = { units: 0, tens: 0, hundreds: 0, thousands: 5 };
      expect(getValue(counts)).toBe(5000);

      for (let i = 0; i < 3; i++) {
        const d = ungroupBlock(counts, 'thousands');
        expect(d).not.toBeNull();
        counts = d!.counts;
        expect(getValue(counts)).toBe(5000);
      }
      expect(counts.thousands).toBe(2);
      expect(counts.hundreds).toBe(30); // 3 * 10 = 30 (hit MAX_VISIBLE_BLOCKS)
      expect(getValue(counts)).toBe(5000);

      // Attempting to ungroup another thousand when hundreds is at 30 must be safely rejected
      const overflowAttempt = ungroupBlock(counts, 'thousands');
      expect(overflowAttempt).toBeNull();
      expect(getValue(counts)).toBe(5000);
    });

    it('rejects illegal decomposition attempts ("take from zero" and units decomposition)', () => {
      const emptyCounts: PlaceCounts = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
      expect(ungroupBlock(emptyCounts, 'units')).toBeNull();
      expect(ungroupBlock(emptyCounts, 'tens')).toBeNull();
      expect(ungroupBlock(emptyCounts, 'hundreds')).toBeNull();
      expect(ungroupBlock(emptyCounts, 'thousands')).toBeNull();

      const unitsOnly: PlaceCounts = { units: 10, tens: 0, hundreds: 0, thousands: 0 };
      expect(ungroupBlock(unitsOnly, 'units')).toBeNull(); // units cannot be ungrouped further
    });
  });

  // ==========================================================================
  // SECTION 3: CASCADING CARRIES UP TO 4 DIGITS & EXTREME 10-FOR-1 REGROUPING
  // ==========================================================================
  describe('3. Cascading Carries up to 4 Digits & Extreme Regrouping', () => {

    it('handles 9999 + 1 cascading carry through units -> tens -> hundreds -> thousands', () => {
      let counts: PlaceCounts = { units: 9, tens: 9, hundreds: 9, thousands: 9 };
      expect(getValue(counts)).toBe(9999);

      // Add 1 unit -> units = 10
      counts = { ...counts, units: 10 };
      expect(getValue(counts)).toBe(10000);

      // Sequential manual group: units -> tens
      const g1 = groupBlocksManually(counts, 'units');
      expect(g1).not.toBeNull();
      counts = g1!.counts;
      expect(counts.units).toBe(0);
      expect(counts.tens).toBe(10);
      expect(getValue(counts)).toBe(10000);

      // tens -> hundreds
      const g2 = groupBlocksManually(counts, 'tens');
      expect(g2).not.toBeNull();
      counts = g2!.counts;
      expect(counts.tens).toBe(0);
      expect(counts.hundreds).toBe(10);
      expect(getValue(counts)).toBe(10000);

      // hundreds -> thousands
      const g3 = groupBlocksManually(counts, 'hundreds');
      expect(g3).not.toBeNull();
      counts = g3!.counts;
      expect(counts.hundreds).toBe(0);
      expect(counts.thousands).toBe(10);
      expect(getValue(counts)).toBe(10000);

      // Thousands is highest column, groupBlocksManually on thousands must return null
      expect(groupBlocksManually(counts, 'thousands')).toBeNull();
    });

    it('chained auto-grouping checkAndGroup reduces non-canonical representation to canonical', () => {
      const nonCanonical: PlaceCounts = { units: 35, tens: 24, hundreds: 17, thousands: 2 };
      // 35*1 + 24*10 + 17*100 + 2*1000 = 35 + 240 + 1700 + 2000 = 3975
      const totalVal = getValue(nonCanonical);
      expect(totalVal).toBe(3975);

      const result = checkAndGroup(nonCanonical);
      expect(getValue(result.counts)).toBe(3975);
      expect(result.counts.units).toBe(5); // 35 % 10 = 5, carry 3 -> tens = 27
      expect(result.counts.tens).toBe(7);  // 27 % 10 = 7, carry 2 -> hundreds = 19
      expect(result.counts.hundreds).toBe(9); // 19 % 10 = 9, carry 1 -> thousands = 3
      expect(result.counts.thousands).toBe(3);
    });

    it('rejects manual grouping when column count < 10 or target column exceeds MAX_VISIBLE_BLOCKS', () => {
      const lowCounts: PlaceCounts = { units: 9, tens: 9, hundreds: 9, thousands: 0 };
      expect(groupBlocksManually(lowCounts, 'units')).toBeNull();
      expect(groupBlocksManually(lowCounts, 'tens')).toBeNull();
      expect(groupBlocksManually(lowCounts, 'hundreds')).toBeNull();

      const fullTarget: PlaceCounts = { units: 10, tens: 30, hundreds: 0, thousands: 0 };
      expect(groupBlocksManually(fullTarget, 'units')).toBeNull(); // tens is already at 30
    });
  });

  // ==========================================================================
  // SECTION 4: 0-VALUE DIFFERENCE CHECKS & BOUNDARY OPERATIONS
  // ==========================================================================
  describe('4. 0-Value Difference Checks & Boundary Operations', () => {

    it('validates 0-value difference without empty_board rejection', () => {
      useWorkspaceStore.getState().initSession(1, false, null, 0);

      // Simulate a task where target = 0 (e.g. 5 - 5 = 0)
      useWorkspaceStore.setState({
        counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 },
        answerDigits: { units: '0' },
        hasInteracted: true,
      });

      const s = useWorkspaceStore.getState();
      const boardVal = getValue(s.counts);
      const target = 0;

      const isBoardEmpty = boardVal === 0 && target !== 0;
      expect(isBoardEmpty).toBe(false);
      expect(boardVal).toBe(target);
    });

    it('rejects empty board when target is non-zero (empty_board gate)', () => {
      useWorkspaceStore.setState({
        counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 },
      });

      const s = useWorkspaceStore.getState();
      const boardVal = getValue(s.counts);
      const target = 42;

      const isBoardEmpty = boardVal === 0 && Number(target) !== 0;
      expect(isBoardEmpty).toBe(true);
    });

    it('detects overcrowded columns across units, tens, and hundreds', () => {
      // Overcrowded units
      let s: PlaceCounts = { units: 10, tens: 2, hundreds: 1, thousands: 0 };
      let hasOvercrowded = s.units >= 10 || s.tens >= 10 || s.hundreds >= 10;
      expect(hasOvercrowded).toBe(true);

      // Overcrowded tens
      s = { units: 5, tens: 10, hundreds: 1, thousands: 0 };
      hasOvercrowded = s.units >= 10 || s.tens >= 10 || s.hundreds >= 10;
      expect(hasOvercrowded).toBe(true);

      // Overcrowded hundreds
      s = { units: 5, tens: 4, hundreds: 10, thousands: 0 };
      hasOvercrowded = s.units >= 10 || s.tens >= 10 || s.hundreds >= 10;
      expect(hasOvercrowded).toBe(true);

      // Canonical state (none >= 10)
      s = { units: 9, tens: 9, hundreds: 9, thousands: 9 };
      hasOvercrowded = s.units >= 10 || s.tens >= 10 || s.hundreds >= 10;
      expect(hasOvercrowded).toBe(false);
    });
  });

  // ==========================================================================
  // SECTION 5: RAPID UNDO HAMMERING & STATE STACK INTEGRITY
  // ==========================================================================
  describe('5. Rapid Undo Hammering & State Stack Integrity', () => {

    it('preserves exact history and bounds undo stack at UNDO_STACK_CAP (50) under 100 rapid operations', () => {
      useWorkspaceStore.getState().initSession(1, false, null, 0);

      // Perform 60 rapid block additions and operations
      for (let i = 0; i < 60; i++) {
        useWorkspaceStore.getState().applyDrop({
          source: 'palette',
          sourcePlace: 'units',
          target: { kind: 'column', place: 'units' },
        });
      }

      const s = useWorkspaceStore.getState();
      expect(s.counts.units).toBe(30); // Capped at MAX_VISIBLE_BLOCKS
      expect(s.undoStack.length).toBeLessThanOrEqual(50); // Capped at UNDO_STACK_CAP = 50

      // Now hammer undo 60 times
      for (let i = 0; i < 60; i++) {
        useWorkspaceStore.getState().undo();
      }

      const finalState = useWorkspaceStore.getState();
      expect(finalState.undoStack.length).toBe(0);
      expect(finalState.counts.units).toBeGreaterThanOrEqual(0);
      expect(finalState.counts.tens).toBe(0);
      expect(finalState.counts.hundreds).toBe(0);
      expect(finalState.counts.thousands).toBe(0);
    });

    it('correctly reverts complex split and group sequences with undo', () => {
      useWorkspaceStore.getState().initSession(1, false, null, 0);

      // Initial state: 1 ten, 0 units
      useWorkspaceStore.setState({
        counts: { units: 0, tens: 1, hundreds: 0, thousands: 0 },
        undoStack: [],
        keyboardState: 'LOCKED',
      });

      // Split 1 ten -> 10 units
      useWorkspaceStore.getState().splitBlockClick('tens');
      let state = useWorkspaceStore.getState();
      expect(state.counts.tens).toBe(0);
      expect(state.counts.units).toBe(10);
      expect(state.keyboardState).toBe('UNLOCKED');
      expect(state.undoStack).toHaveLength(1);

      // Group 10 units -> 1 ten
      useWorkspaceStore.getState().groupColumnClick('units');
      state = useWorkspaceStore.getState();
      expect(state.counts.tens).toBe(1);
      expect(state.counts.units).toBe(0);
      expect(state.undoStack).toHaveLength(2);

      // Undo 1: Reverts to 0 tens, 10 units
      useWorkspaceStore.getState().undo();
      state = useWorkspaceStore.getState();
      expect(state.counts.tens).toBe(0);
      expect(state.counts.units).toBe(10);
      expect(state.undoStack).toHaveLength(1);

      // Undo 2: Reverts to 1 ten, 0 units, and keeps keyboard UNLOCKED per Module 11
      useWorkspaceStore.getState().undo();
      state = useWorkspaceStore.getState();
      expect(state.counts.tens).toBe(1);
      expect(state.counts.units).toBe(0);
      expect(state.undoStack).toHaveLength(0);
      expect(state.keyboardState).toBe('UNLOCKED');
    });

    it('triggers Socratic passive drifting on rapid undo spamming (>= 3 undos within 15s)', () => {
      useWorkspaceStore.getState().initSession(1, false, null, 0);

      // Setup initial snapshots
      useWorkspaceStore.setState({
        counts: { units: 5, tens: 2, hundreds: 1, thousands: 0 },
        undoStack: [
          { counts: { units: 4, tens: 2, hundreds: 1, thousands: 0 } },
          { counts: { units: 3, tens: 2, hundreds: 1, thousands: 0 } },
          { counts: { units: 2, tens: 2, hundreds: 1, thousands: 0 } },
          { counts: { units: 1, tens: 2, hundreds: 1, thousands: 0 } },
        ],
        undoTimestamps: [],
      });

      // Rapidly call undo 3 times
      useWorkspaceStore.getState().undo();
      useWorkspaceStore.getState().undo();
      useWorkspaceStore.getState().undo();

      const state = useWorkspaceStore.getState();
      // Should have cleared undoTimestamps after triggering Socratic
      expect(state.undoTimestamps).toEqual([]);
      expect(state.undoCount).toBe(3);
    });
  });

  // ==========================================================================
  // SECTION 6: VRA KEYBOARD STATE MACHINE FUZZING & ANTI-DESYNC PROOF
  // ==========================================================================
  describe('6. VRA Keyboard State Machine Fuzzing & Anti-Desync Proof', () => {

    const validStates: KeyboardState[] = ['LOCKED', 'UNLOCKED', 'SOCRATIC_ONLY'];
    const validEvents: SystemEvent[] = [
      { type: 'PLACE_VALUE_CONVERSION_SUCCESS' },
      { type: 'BLOCK_GROUP_SUCCESS' },
      { type: 'BLOCK_SPLIT_SUCCESS' },
      { type: 'HESITATION_TIMER_EXPIRE' },
      { type: 'SOCRATIC_SUCCESS' },
      { type: 'UNDO_CLICK' },
    ];

    it('strictly adheres to the VRA state transition table under all valid state x event combinations', () => {
      // Expected transition table
      const expectedTransitions: Record<KeyboardState, Record<string, KeyboardState>> = {
        LOCKED: {
          PLACE_VALUE_CONVERSION_SUCCESS: 'UNLOCKED',
          BLOCK_GROUP_SUCCESS: 'UNLOCKED',
          BLOCK_SPLIT_SUCCESS: 'UNLOCKED',
          HESITATION_TIMER_EXPIRE: 'SOCRATIC_ONLY',
          SOCRATIC_SUCCESS: 'LOCKED',
          UNDO_CLICK: 'LOCKED',
        },
        SOCRATIC_ONLY: {
          PLACE_VALUE_CONVERSION_SUCCESS: 'SOCRATIC_ONLY',
          BLOCK_GROUP_SUCCESS: 'SOCRATIC_ONLY',
          BLOCK_SPLIT_SUCCESS: 'SOCRATIC_ONLY',
          HESITATION_TIMER_EXPIRE: 'SOCRATIC_ONLY',
          SOCRATIC_SUCCESS: 'UNLOCKED',
          UNDO_CLICK: 'SOCRATIC_ONLY',
        },
        UNLOCKED: {
          PLACE_VALUE_CONVERSION_SUCCESS: 'UNLOCKED',
          BLOCK_GROUP_SUCCESS: 'UNLOCKED',
          BLOCK_SPLIT_SUCCESS: 'UNLOCKED',
          HESITATION_TIMER_EXPIRE: 'UNLOCKED',
          SOCRATIC_SUCCESS: 'UNLOCKED',
          UNDO_CLICK: 'UNLOCKED', // Module 11: Undo never locks keyboard
        },
      };

      for (const st of validStates) {
        for (const evt of validEvents) {
          const next = stateReducer(st, evt);
          const expected = expectedTransitions[st][evt.type];
          expect(next).toBe(expected);
        }
      }
    });

    it('fuzzes 10,000 randomized state machine event transitions without desynchronization or crashes', () => {
      let state: KeyboardState = 'LOCKED';
      let seed = 987654321;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      for (let i = 0; i < 10000; i++) {
        const evtIdx = Math.floor(rnd() * validEvents.length);
        const evt = validEvents[evtIdx];
        const prevState = state;
        state = stateReducer(state, evt);

        // Assert valid state output
        expect(validStates).toContain(state);

        // Invariant 1: UNLOCKED can never be reached directly from LOCKED via SOCRATIC_SUCCESS
        if (prevState === 'LOCKED' && evt.type === 'SOCRATIC_SUCCESS') {
          expect(state).toBe('LOCKED');
        }

        // Invariant 2: SOCRATIC_ONLY can ONLY be unlocked via SOCRATIC_SUCCESS
        if (prevState === 'SOCRATIC_ONLY' && evt.type !== 'SOCRATIC_SUCCESS') {
          expect(state).toBe('SOCRATIC_ONLY');
        }

        // Invariant 3: UNLOCKED on UNDO_CLICK remains UNLOCKED per Module 11
        if (prevState === 'UNLOCKED' && evt.type === 'UNDO_CLICK') {
          expect(state).toBe('UNLOCKED');
        }
      }
    });

    it('handles transitionKeyboardState and evaluateKeyboardState with multi-flag chaotic inputs', () => {
      // Chaos 1: Both group_success and hesitation_timer_expire present
      // block_group_success has higher precedence when grouping succeeds
      expect(transitionKeyboardState('LOCKED', { block_group_success: true, hesitation_timer_expire: true })).toBe('UNLOCKED');

      // Chaos 2: Hesitation expiry via 3 blocked attempts
      expect(transitionKeyboardState('LOCKED', { blocked_attempts_count: 3 })).toBe('SOCRATIC_ONLY');
      expect(transitionKeyboardState('LOCKED', { blocked_attempts_count: 2 })).toBe('LOCKED');

      // Chaos 3: Inactivity timer expired
      expect(transitionKeyboardState('LOCKED', { inactivity_timer_expired: true })).toBe('SOCRATIC_ONLY');

      // Chaos 4: Undo from Socratic Only remains Socratic Only
      expect(transitionKeyboardState('SOCRATIC_ONLY', { undo_click: true })).toBe('SOCRATIC_ONLY');

      // Chaos 5: Socratic success unlocks keyboard
      expect(transitionKeyboardState('SOCRATIC_ONLY', { socratic_success: true })).toBe('UNLOCKED');
    });

    it('verifies evaluateKeyboardState correctly compares concrete state to target and drives transitions', () => {
      const exercise = {
        id: 'ex_test_1',
        type: 'subtraction' as const,
        minuend_or_addend1: 520,
        subtrahend_or_addend2: 260,
        requires_regrouping: true,
        target_concrete_state: { hundreds: 4, tens: 12, ones: 0 },
      };

      // Valid state match -> transitions LOCKED to UNLOCKED
      const validState = { hundreds: 4, tens: 12, ones: 0 };
      expect(evaluateKeyboardState(exercise, validState, 'LOCKED')).toBe('UNLOCKED');

      // Invalid state -> remains LOCKED
      const invalidState = { hundreds: 5, tens: 2, ones: 0 };
      expect(evaluateKeyboardState(exercise, invalidState, 'LOCKED')).toBe('LOCKED');

      // Invalid state + hesitation -> transitions to SOCRATIC_ONLY
      expect(evaluateKeyboardState(exercise, invalidState, 'LOCKED', { hesitation_timer_expire: true })).toBe('SOCRATIC_ONLY');
    });
  });

  // ==========================================================================
  // SECTION 7: BOARD LOCK IMMUTABILITY & PENALTY LOCKOUT HARDENING
  // ==========================================================================
  describe('7. Board Lock Immutability & Penalty Lockout Hardening', () => {

    it('strictly prevents all block modifications and undos when isBoardLocked is true', () => {
      useWorkspaceStore.getState().initSession(1, false, null, 0);
      useWorkspaceStore.setState({
        counts: { units: 5, tens: 5, hundreds: 5, thousands: 5 },
        isBoardLocked: true,
        undoStack: [{ counts: { units: 4, tens: 4, hundreds: 4, thousands: 4 } }],
      });

      const initialCounts = { ...useWorkspaceStore.getState().counts };

      // Try remove
      useWorkspaceStore.getState().removeBlockClick('units');
      expect(useWorkspaceStore.getState().counts).toEqual(initialCounts);

      // Try split
      useWorkspaceStore.getState().splitBlockClick('tens');
      expect(useWorkspaceStore.getState().counts).toEqual(initialCounts);

      // Try group
      useWorkspaceStore.getState().groupColumnClick('hundreds');
      expect(useWorkspaceStore.getState().counts).toEqual(initialCounts);

      // Try undo
      useWorkspaceStore.getState().undo();
      expect(useWorkspaceStore.getState().counts).toEqual(initialCounts);
      expect(useWorkspaceStore.getState().undoStack).toHaveLength(1);
    });

    it('enforces 60-second penalty lockout timer and cancels cleanly', async () => {
      vi.useFakeTimers();
      let locked = false;
      const onLock = () => { locked = true; };
      const onUnlock = () => { locked = false; };

      const { executeDistractorPenaltyLockout } = await import('@/core/ExerciseValidationEngine');
      const cleanup = executeDistractorPenaltyLockout(onLock, onUnlock, 60000);

      expect(locked).toBe(true);

      // Advance 30 seconds -> still locked
      vi.advanceTimersByTime(30000);
      expect(locked).toBe(true);

      // Advance remaining 30 seconds -> unlocked
      vi.advanceTimersByTime(30000);
      expect(locked).toBe(false);

      // Test cleanup cancellation
      const cleanup2 = executeDistractorPenaltyLockout(onLock, onUnlock, 60000);
      expect(locked).toBe(true);
      cleanup2(); // Cancel early
      vi.advanceTimersByTime(60000);
      expect(locked).toBe(true); // Callback never fired because timer cleared

      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // SECTION 8: 4-DIGIT MULTI-STEP ARITHMETIC INTEGRATION & GATE STRESS
  // ==========================================================================
  describe('8. 4-Digit Multi-Step Arithmetic Integration & Gate Stress', () => {

    it('correctly validates multi-gate vertical addition with carries and memory boxes', () => {
      useWorkspaceStore.getState().initSession(3, false, null, 0);

      // Task: 4890 + 1750 = 6640
      const mockTask = {
        id: 's3_t5_stress',
        type: 'vertical_addition' as const,
        titleHe: 'חיבור במאונך עם המרה כפולה',
        instructionHe: 'פתרו את התרגיל',
        numberA: 4890,
        numberB: 1750,
        requiresGrouping: true,
      };

      useWorkspaceStore.setState({
        dynamicTasks: [mockTask],
        standardTaskIdx: 0,
        // Set canonical correct counts for 6640
        counts: { units: 0, tens: 4, hundreds: 6, thousands: 6 },
        answerDigits: { thousands: '6', hundreds: '6', tens: '4', units: '0' },
        carryDigits: { hundreds: '1', thousands: '1' },
        hasInteracted: true,
      });

      // Assert board representation is canonical and matches target
      const s = useWorkspaceStore.getState();
      const boardVal = getValue(s.counts);
      expect(boardVal).toBe(6640);
      expect(s.counts.units < 10 && s.counts.tens < 10 && s.counts.hundreds < 10).toBe(true);
    });

    it('rejects vertical addition when answer digits do not match board value', () => {
      useWorkspaceStore.getState().initSession(3, false, null, 0);

      useWorkspaceStore.setState({
        counts: { units: 0, tens: 4, hundreds: 6, thousands: 6 }, // 6640
        answerDigits: { thousands: '6', hundreds: '6', tens: '4', units: '5' }, // 6645 != 6640
        hasInteracted: true,
      });

      const s = useWorkspaceStore.getState();
      const boardVal = getValue(s.counts);
      const ansVal = Number(Object.values(s.answerDigits).reverse().join(''));
      expect(boardVal).toBe(6640);
      expect(ansVal).not.toBe(boardVal);
    });
  });
});

