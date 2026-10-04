/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { useWorkspaceStore, getActiveTasks, selectCanProceed, judgeStandardTask } from '@/application/useWorkspaceStore';
import { SESSION1_TASKS, type SessionTask } from '@/data/sessionTasks';
import { REPRESENTATION_LOCKS } from '@/data/representationLocks';
import { session1Checklist } from '@/core/session1Checklist';
import { EMPTY_COUNTS, type Place } from '@/core/placeValue';
import { SocraticEngine, TASK_HINTS } from '@/infrastructure/services/SocraticEngine';
import { Session1ChecklistCard } from '@/features/workspace/tasks/Session1ChecklistCard';

/**
 * Meeting 1, student-journey audit of 4.10.2026 (A2): the verified fixes
 * A2-F04, F06, F09, F13, F15, F17.
 */

/** The praise title as every exercise of the store writes it (dagesh before qamats). */
const PRAISE = 'כָּל הַכָּבוֹד! 🌟';

const at = (id: string) => SESSION1_TASKS.findIndex((t) => t.id === id);
const ws = () => useWorkspaceStore.getState();
const task = (): SessionTask => getActiveTasks(ws())[ws().standardTaskIdx];
const tap = (place: Place, n = 1) => {
  for (let i = 0; i < n; i++) ws().applyDrop({ source: 'palette', sourcePlace: place, target: { kind: 'column', place } });
};
const typeNumber = (n: number) => {
  const s = String(n);
  const places: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
  for (let i = 0; i < s.length; i++) ws().setAnswerDigit(places[i], s[s.length - 1 - i]);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(SocraticEngine, 'getSocraticHint').mockResolvedValue(null as any);
  ws().resetWorkspace();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('A2-F06: the conversion is checked per column', () => {
  it('26 lists the units column twice (two groupings)', () => {
    expect(REPRESENTATION_LOCKS.s1_r_group26.columns).toEqual(['units', 'units']);
  });

  it('26: one grouping plus a ten from the tray is not accepted; the second grouping is', () => {
    ws().initSession(1, false, at('s1_r_group26'));
    ws().groupColumnClick('units'); // 1 ten, 16 units
    for (let i = 0; i < 10; i++) ws().applyDrop({ source: 'column', sourcePlace: 'units', target: { kind: 'trash' } });
    tap('tens');
    expect(ws().counts).toEqual({ ...EMPTY_COUNTS, tens: 2, units: 6 });
    typeNumber(26);
    const v = judgeStandardTask(ws(), task());
    expect(v.kind).toBe('failure');
    expect(v.kind === 'failure' && v.detail).toBe('conversion_skipped');
  });

  it('26: two groupings of the units are accepted', () => {
    ws().initSession(1, false, at('s1_r_group26'));
    ws().groupColumnClick('units');
    ws().groupColumnClick('units');
    typeNumber(26);
    expect(judgeStandardTask(ws(), task()).kind).toBe('success');
  });

  it('26: an older save (no conversion count) with the final board still passes', () => {
    ws().initSession(1, false, at('s1_r_group26'));
    useWorkspaceStore.setState({
      counts: { ...EMPTY_COUNTS, tens: 2, units: 6 },
      conversionsByColumn: { composed: { units: true }, decomposed: {} },
      hasGrouped: true,
    });
    typeNumber(26);
    expect(judgeStandardTask(ws(), task()).kind).toBe('success');
  });

  it('347: breaking a HUNDRED and fixing the board by hand neither ticks "פרטו עשרת אחת" nor is accepted', () => {
    ws().initSession(1, false, at('s1_target_347'));
    tap('hundreds', 3); tap('tens', 4); tap('units', 7);
    ws().splitBlockClick('hundreds'); // 2 hundreds, 14 tens, 7 units
    for (let i = 0; i < 11; i++) ws().applyDrop({ source: 'column', sourcePlace: 'tens', target: { kind: 'trash' } });
    tap('hundreds'); tap('units', 10);
    expect(ws().counts).toEqual({ ...EMPTY_COUNTS, hundreds: 3, tens: 3, units: 17 });
    typeNumber(347);
    expect(session1Checklist('s1_target_347', ws())!.map((i) => i.done)).toEqual([true, false, false]);
    expect(selectCanProceed(ws())).toBe(false);
    expect(judgeStandardTask(ws(), task()).kind).toBe('failure');
  });

  it('347: breaking a ten ticks every line and is accepted', () => {
    ws().initSession(1, false, at('s1_target_347'));
    tap('hundreds', 3); tap('tens', 4); tap('units', 7);
    ws().splitBlockClick('tens');
    typeNumber(347);
    expect(session1Checklist('s1_target_347', ws())!.map((i) => i.done)).toEqual([true, true, true]);
    expect(selectCanProceed(ws())).toBe(true);
    expect(judgeStandardTask(ws(), task()).kind).toBe('success');
  });
});

describe('A2-F13: 347 gets one praise, the tool steps\' one', () => {
  it('the success of 347 is "ממשיכים לשלב הבא."', () => {
    ws().initSession(1, false, at('s1_target_347'));
    tap('hundreds', 3); tap('tens', 4); tap('units', 7);
    ws().splitBlockClick('tens');
    typeNumber(347);
    const v = judgeStandardTask(ws(), task());
    expect(v).toMatchObject({ kind: 'success', title: PRAISE, sub: 'ממשיכים לשלב הבא.', ms: 2000 });
  });
});

describe('A2-F17: the tool steps\' titles carry the niqqud of every other praise', () => {
  it('a finished tool step says "כָּל הַכָּבוֹד! 🌟"', () => {
    ws().initSession(1, false, at('s1_decompose_hundred'));
    ws().splitBlockClick('hundreds');
    const v = judgeStandardTask(ws(), task());
    expect(v).toMatchObject({ kind: 'success', title: PRAISE, sub: 'ממשיכים לשלב הבא.' });
  });
});

describe('A2-F09: the success line of a solved exercise', () => {
  it('713 + 94 solved: "פְּתַרְתֶּם נָכוֹן, וּבְנִיתֶם נָכוֹן גַּם בַּלְּבֵנִים."', () => {
    ws().initSession(1, false, at('s1_t8'));
    const t = task();
    const result = (t.numberA ?? 0) + (t.numberB ?? 0);
    const v = judgeStandardTask(
      { ...ws(), counts: { ...EMPTY_COUNTS, hundreds: 8, tens: 0, units: 7 }, hasGrouped: true, conversionsByColumn: { composed: { tens: true }, decomposed: {} }, answerDigits: { hundreds: '8', tens: '0', units: '7' }, carryDigits: { hundreds: '1' } } as any,
      t
    );
    expect(result).toBe(807);
    if (v.kind === 'success') expect(v.sub).toBe('פְּתַרְתֶּם נָכוֹן, וּבְנִיתֶם נָכוֹן גַּם בַּלְּבֵנִים.');
    else throw new Error(`not solved: ${JSON.stringify(v)}`);
  });
});

describe('A2-F15: every meeting-1 coaching card opens with "נסו לחשוב:"', () => {
  it('the cards of 703, 368, 482, 26, 713, 61 and 806', () => {
    for (const id of ['s1_r_words703', 's1_r_value368', 's1_r_words482', 's1_r_group26', 's1_t8', 's1_r_sub61', 's1_r_sub806']) {
      const card = TASK_HINTS[id];
      expect(card, id).toBeTruthy();
      expect(card.questionHe, id).toMatch(/^נסו לחשוב: /);
      expect(card.tts_text, id).toMatch(/^נסו לחשוב: /);
      expect(card.questionHe.split(':').length - 1, id).toBe(1);
    }
  });
});

describe('A2-F04: the done checklist is compact', () => {
  it('every item done: no "בוצע!" pills, the done box shows', () => {
    const items = [
      { label: 'בנו את המספר 347 בלבנים', done: true },
      { label: 'פרטו עשרת אחת לעשר יחידות', done: true },
      { label: 'כתבו בשורת התוצאה איזה מספר מייצגות הלבנים לאחר הפריטה', done: true },
    ];
    render(<Session1ChecklistCard items={items} doneNote="נכון! הלבנים מסודרות אחרת, אבל המספר נשאר 347." />);
    expect(screen.queryByText('בוצע!')).toBeNull();
    expect(screen.getByTestId('session1-done')).toBeTruthy();
  });

  it('an item still open keeps its pill', () => {
    render(<Session1ChecklistCard items={[{ label: 'א', done: true }, { label: 'ב', done: false }]} />);
    expect(screen.getByText('בוצע!')).toBeTruthy();
    expect(screen.getByText('עוד לא')).toBeTruthy();
  });
});
