import { describe, it, expect, beforeEach } from 'vitest';
import { resultRowCues, isPlaceError, PLACE_CUE_LINE_HE } from '@/core/placeCues';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { approvePath } from '@/test/approvedPath';

/**
 * Owner, 30.9.2026 (stations 3–7): the result row's colours and place labels
 * are a scaffold that appears after a digit written in the wrong place.
 */
describe('which place cues the result row shows', () => {
  it('stations 3–7, regular profile: none until the scaffold, then colours and labels', () => {
    for (const n of [3, 4, 5, 6, 7]) {
      expect(resultRowCues(n, false, false)).toEqual({ colours: false, labels: false });
      expect(resultRowCues(n, false, true)).toEqual({ colours: true, labels: true });
    }
  });

  it('stations 3–7, enhanced profile: colours always; the labels are the scaffold', () => {
    for (const n of [3, 4, 5, 6, 7]) {
      expect(resultRowCues(n, true, false)).toEqual({ colours: true, labels: false });
      expect(resultRowCues(n, true, true)).toEqual({ colours: true, labels: true });
    }
  });

  it('station 2 keeps its rule (owner 27.9.2026); stations 1 and 8 are unchanged', () => {
    expect(resultRowCues(2, false, true)).toEqual({ colours: false, labels: false });
    expect(resultRowCues(2, true, false)).toEqual({ colours: true, labels: true });
    expect(resultRowCues(1, false, false)).toEqual({ colours: true, labels: true });
    expect(resultRowCues(8, false, false)).toEqual({ colours: true, labels: true });
  });

  it('the two lines are the owner-approved wording', () => {
    expect(PLACE_CUE_LINE_HE.regular).toBe('שימו לב לצבעים בשורת התוצאה. כל תיבה צבועה בצבע של הטור שלה בבית המספרים.');
    expect(PLACE_CUE_LINE_HE.enhanced).toBe('שימו לב לכותרות שמתחת לתיבות.');
  });
});

describe('a digit in the wrong place', () => {
  // 1,245 + 328 = 1,573
  it('the digits of the answer in another order', () => {
    expect(isPlaceError({ thousands: '3', hundreds: '7', tens: '5', units: '1' }, 1573)).toBe(true);
  });
  it('the tens digit typed into the units box', () => {
    expect(isPlaceError({ thousands: '1', hundreds: '5', tens: '7', units: '7' }, 1573)).toBe(true);
  });
  it('a counting error or a forgotten regrouping is not a place error', () => {
    expect(isPlaceError({ thousands: '1', hundreds: '5', tens: '6', units: '3' }, 1573)).toBe(false); // 1,563
    expect(isPlaceError({ thousands: '1', hundreds: '5', tens: '8', units: '3' }, 1573)).toBe(false); // 1,583
  });
  it('the right answer is not an error, and an empty box is not a digit', () => {
    expect(isPlaceError({ thousands: '1', hundreds: '5', tens: '7', units: '3' }, 1573)).toBe(false);
    expect(isPlaceError({ hundreds: '9', tens: '1', units: '7' }, 917)).toBe(false);
  });
});

describe('the scaffold in a station-4 exercise', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    approvePath(); // Module 26: meetings 3–8 run on the learner's approved path
    useWorkspaceStore.getState().initSession(4, false, 0);
  });

  const typeAnswer = (d: Record<string, string>) => useWorkspaceStore.setState({ answerDigits: d } as any);
  const task = () => getActiveTasks(useWorkspaceStore.getState())[useWorkspaceStore.getState().standardTaskIdx];

  it('turns on after a digit in the wrong place, not after another wrong answer', () => {
    const t = task();
    const target = (t.numberA ?? 0) + (t.numberB ?? 0); // the first exercise of either path is an addition
    const places = ['thousands', 'hundreds', 'tens', 'units'] as const;
    const pv = { thousands: 1000, hundreds: 100, tens: 10, units: 1 };
    const digits = Object.fromEntries(places.map((p) => [p, target >= pv[p] || p === 'units' ? String(Math.floor(target / pv[p]) % 10) : ''])) as Record<string, string>;
    // the board is right (the answer check comes after the board check)
    useWorkspaceStore.setState({ counts: Object.fromEntries(places.map((p) => [p, Number(digits[p] || 0)])) } as any);
    // a counting slip in the units: not a place error
    const slip = { ...digits, units: String((Number(digits.units) + 1) % 10) };
    if (Object.values(digits).includes(slip.units)) slip.units = String((Number(digits.units) + 2) % 10);
    typeAnswer(slip);
    useWorkspaceStore.getState().proceed();
    expect(isPlaceError(slip, target)).toBe(false);
    expect(useWorkspaceStore.getState().placeCuesShown).toBe(false);
    // the two lowest digits swapped (they differ in every first exercise): a place error
    expect(digits.units).not.toBe(digits.tens);
    typeAnswer({ ...digits, tens: digits.units, units: digits.tens });
    useWorkspaceStore.getState().proceed();
    expect(useWorkspaceStore.getState().placeCuesShown).toBe(true);
  });

  it('the next exercise starts without it', () => {
    useWorkspaceStore.setState({ placeCuesShown: true } as any);
    useWorkspaceStore.getState().initSession(4, false, 1);
    expect(useWorkspaceStore.getState().placeCuesShown).toBe(false);
  });
});
