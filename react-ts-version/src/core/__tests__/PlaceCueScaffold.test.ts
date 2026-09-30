import { describe, it, expect, beforeEach } from 'vitest';
import { resultRowCues, isPlaceError, resultBoxCount, PLACE_CUE_LINE_HE } from '@/core/placeCues';
import { verticalBoxes, lowestEmptyPlace } from '@/core/columnFocus';
import { useWorkspaceStore, getActiveTasks, resultRowValue, effectiveArithmetic } from '@/application/useWorkspaceStore';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { digitAt, type Place } from '@/core/placeValue';
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

describe('how many boxes the result row has', () => {
  it('stations 3–7: as many as the longest number of the exercise', () => {
    for (const n of [3, 4, 5, 6, 7]) {
      expect(resultBoxCount(n, 2045, 1128, 917)).toBe(4);
      expect(resultBoxCount(n, 204, 112, 92)).toBe(3);
      expect(resultBoxCount(n, 856, 275, 1131)).toBe(4);
    }
  });
  it('every other station: the answer’s own length (register 28: stations 1, 2 and 8 unchanged)', () => {
    for (const n of [1, 2, 8]) expect(resultBoxCount(n, 2045, 1128, 917)).toBe(3);
  });
  it('the board’s column focus counts the same boxes: the lit column stays on the empty thousands box', () => {
    const boxes = verticalBoxes(2045, 1128, 917, {}, [], resultBoxCount(6, 2045, 1128, 917));
    expect(boxes.result).toEqual(['units', 'tens', 'hundreds', 'thousands']);
    expect(lowestEmptyPlace(boxes, { units: '7', tens: '1', hundreds: '9' })).toBe('thousands');
    expect(lowestEmptyPlace(boxes, { units: '7', tens: '1', hundreds: '9', thousands: '0' })).toBeNull();
  });
});

describe('the result row is read by place', () => {
  it('empty boxes on the left are leading zeros', () => {
    expect(resultRowValue({ hundreds: '9', tens: '1', units: '7' })).toBe(917);
    expect(resultRowValue({ thousands: '0', hundreds: '9', tens: '1', units: '7' })).toBe(917);
    expect(resultRowValue({})).toBeNull();
  });
  it('a box left empty to the right of a digit is no number', () => {
    expect(resultRowValue({ thousands: '9', hundreds: '1', tens: '7' })).toBeNaN();
    expect(resultRowValue({ thousands: '9', hundreds: '1', units: '7' })).toBeNaN();
    expect(resultRowValue({ hundreds: '9', units: '2' })).toBeNaN();
  });
});

describe('a digit in the wrong place', () => {
  // 1,245 + 328 = 1,573
  it('the digits of the answer in another order', () => {
    expect(isPlaceError({ thousands: '3', hundreds: '7', tens: '5', units: '1' }, 1573)).toBe(true);
    // two neighbouring digits swapped, even when they are one apart
    expect(isPlaceError({ hundreds: '2', tens: '1', units: '3' }, 312)).toBe(true);
  });
  it('the answer written one box to the left of the row', () => {
    expect(isPlaceError({ thousands: '9', hundreds: '1', tens: '7' }, 917)).toBe(true);
  });
  it('the tens digit typed into the units box', () => {
    expect(isPlaceError({ thousands: '1', hundreds: '5', tens: '7', units: '7' }, 1573)).toBe(true);
  });
  it('a counting error or a forgotten regrouping is not a place error', () => {
    expect(isPlaceError({ thousands: '1', hundreds: '5', tens: '6', units: '3' }, 1573)).toBe(false); // 1,563
    expect(isPlaceError({ thousands: '1', hundreds: '5', tens: '8', units: '3' }, 1573)).toBe(false); // 1,583
    // the regrouping errors the review found firing the scaffold
    expect(isPlaceError({ thousands: '3', hundreds: '7', tens: '7', units: '3' }, 3783)).toBe(false); // carry forgotten
    expect(isPlaceError({ hundreds: '4', tens: '4', units: '5' }, 435)).toBe(false); // borrow not taken from the tens
    expect(isPlaceError({ hundreds: '5', tens: '6', units: '7' }, 457)).toBe(false);
    const ex = { a: 2045, b: 1128, isSubtraction: true };
    expect(isPlaceError({ thousands: '1', hundreds: '9', tens: '2', units: '7' }, 917, ex)).toBe(false); // 1,927
    expect(isPlaceError({ thousands: '1', hundreds: '1', tens: '2', units: '3' }, 917, ex)).toBe(false); // 1,123: smaller from larger
  });
  it('the right answer is not an error, an empty box is not a digit, and a 0 left of the answer is right', () => {
    expect(isPlaceError({ thousands: '1', hundreds: '5', tens: '7', units: '3' }, 1573)).toBe(false);
    expect(isPlaceError({ hundreds: '9', tens: '1', units: '7' }, 917)).toBe(false);
    expect(isPlaceError({ thousands: '0', hundreds: '9', tens: '0', units: '8' }, 907)).toBe(false);
  });
});

describe('regrouping errors never turn on the scaffold, in any vertical exercise of stations 3–7', () => {
  const PLACES: Place[] = ['thousands', 'hundreds', 'tens', 'units'];
  const PV: Record<Place, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };
  const byColumn = (f: (p: Place) => number) => PLACES.reduce((s, p) => s + (((f(p) % 10) + 10) % 10) * PV[p], 0);
  const tasks: SessionTask[] = [];
  for (const m of [3, 4, 5, 6, 7] as const) {
    for (const p of ['green_path', 'remediation_path'] as const) {
      tasks.push(...(getSessionTasks(m as any, p) ?? []), ...getSessionBranchTasks(m, 'reinforcement', p), ...getSessionBranchTasks(m, 'challenge', p));
    }
  }
  const vertical = tasks.filter((t) => (t.type === 'vertical_addition' || t.type === 'addition_simple') && !t.hiddenDigits);

  it('the carry forgotten; the smaller digit taken from the larger; a borrow not taken from the next column', () => {
    expect(vertical.length).toBeGreaterThan(40);
    const offenders: string[] = [];
    for (const t of vertical) {
      for (const isASD of [false, true]) {
        const { a, b, target } = effectiveArithmetic(t, isASD);
        const worked = Math.max(String(a).length, String(b).length);
        const wrongs = t.isSubtraction
          ? [byColumn((p) => Math.abs(digitAt(a, p) - digitAt(b, p))), byColumn((p) => digitAt(a, p) - digitAt(b, p) + 10)]
          : [byColumn((p) => digitAt(a, p) + digitAt(b, p))];
        for (const wrong of wrongs) {
          if (wrong === target) continue; // no regrouping in this exercise
          // written column by column, in every column the child worked
          const typed: Partial<Record<Place, string>> = {};
          for (const p of PLACES.slice(4 - worked)) typed[p] = String(digitAt(wrong, p));
          for (const p of t.revealedResultDigits ?? []) typed[p] = String(digitAt(target, p));
          if (isPlaceError(typed, target, { a, b, isSubtraction: t.isSubtraction })) offenders.push(`${t.id}: ${a}${t.isSubtraction ? '−' : '+'}${b} answered ${wrong}`);
        }
      }
    }
    expect(offenders).toEqual([]);
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

  it('a reload keeps it, and a restore to another exercise brings that exercise’s own value', () => {
    const snapshot = { sessionNumber: 4, standardTaskIdx: 0, flowStatus: 'task', activeBankPath: 'green_path', answerDigits: {}, counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 } };
    useWorkspaceStore.getState().restoreSession({ ...snapshot, placeCuesShown: true } as any);
    expect(useWorkspaceStore.getState().placeCuesShown).toBe(true);
    useWorkspaceStore.getState().restoreSession({ ...snapshot, standardTaskIdx: 3 } as any);
    expect(useWorkspaceStore.getState().placeCuesShown).toBe(false);
  });
});

describe('2,045 − 1,128 = 917 in a four-box row (station 6)', () => {
  function goTo(meeting: number, id: string, path: 'green_path' | 'remediation_path') {
    useWorkspaceStore.getState().resetWorkspace();
    approvePath(path);
    useWorkspaceStore.getState().initSession(meeting as any, false, 0);
    const idx = getActiveTasks(useWorkspaceStore.getState()).findIndex((t) => t.id === id);
    expect(idx).toBeGreaterThanOrEqual(0);
    useWorkspaceStore.getState().initSession(meeting as any, false, idx);
  }
  function proceedWith(digits: Record<string, string>) {
    useWorkspaceStore.setState({ counts: { units: 7, tens: 1, hundreds: 9, thousands: 0 }, answerDigits: digits, carryDigits: { hundreds: '9' }, feedback: null, awaitingNext: false } as any);
    const before = useWorkspaceStore.getState().standardTaskIdx;
    useWorkspaceStore.getState().proceed();
    const s = useWorkspaceStore.getState();
    return s.standardTaskIdx !== before || s.awaitingNext || s.flowStatus !== 'task';
  }

  it('917 written one box to the left is not accepted, and turns on the scaffold', () => {
    goTo(6, 's6_g_t1', 'green_path');
    const shifted: Record<string, string>[] = [{ thousands: '9', hundreds: '1', tens: '7' }, { thousands: '9', hundreds: '1', units: '7' }, { thousands: '9', tens: '1', units: '7' }];
    for (const digits of shifted) {
      expect(proceedWith(digits)).toBe(false);
    }
    expect(useWorkspaceStore.getState().placeCuesShown).toBe(true);
  });

  it('917 in its own boxes is accepted, with the thousands box empty or 0', () => {
    goTo(6, 's6_g_t1', 'green_path');
    expect(proceedWith({ hundreds: '9', tens: '1', units: '7' })).toBe(true);
    goTo(6, 's6_g_t1', 'green_path');
    expect(proceedWith({ thousands: '0', hundreds: '9', tens: '1', units: '7' })).toBe(true);
  });
});
