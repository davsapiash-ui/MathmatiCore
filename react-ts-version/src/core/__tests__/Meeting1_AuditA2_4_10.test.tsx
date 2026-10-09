/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { useWorkspaceStore, getActiveTasks, selectCanProceed, judgeStandardTask, buildsAnyWay } from '@/application/useWorkspaceStore';
import { SESSION1_TASKS, getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
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
const PRAISE = 'כָּל הַכָּבוֹד!';

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

describe('owner 4.10.2026 (A2-F02 / A4-F06): "build the number X" accepts any board worth X', () => {
  const station3 = [
    ...getSessionTasks(3, 'remediation_path'), ...getSessionTasks(3, 'green_path'),
    ...getSessionBranchTasks(3, 'reinforcement', 'remediation_path'), ...getSessionBranchTasks(3, 'reinforcement', 'green_path'),
  ];
  const load = (meeting: number, id: string) => {
    const t = station3.find((x) => x.id === id)!;
    useWorkspaceStore.setState({ sessionNumber: meeting, dynamicTasks: [t, { ...t, id: `${t.id}_next` }], standardTaskIdx: 0, flowStatus: 'task' } as any);
    expect(task().id).toBe(id);
  };

  it('340 (s3_r_t1) built as 34 tens, 340 written: accepted', () => {
    load(3, 's3_r_t1');
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, tens: 34 }, answerDigits: { hundreds: '3', tens: '4', units: '0' } });
    expect(judgeStandardTask(ws(), task()).kind).toBe('success');
  });

  it('703 (s1_r_words703) built as 6 hundreds, 10 tens, 3 units: accepted', () => {
    ws().initSession(1, false, at('s1_r_words703'));
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, hundreds: 6, tens: 10, units: 3 } });
    typeNumber(703);
    expect(judgeStandardTask(ws(), task()).kind).toBe('success');
  });

  it('368 built as 2 hundreds, 16 tens, 8 units: accepted with 60; the question about the 6 is unchanged', () => {
    ws().initSession(1, false, at('s1_r_value368'));
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, hundreds: 2, tens: 16, units: 8 } });
    typeNumber(368);
    expect(judgeStandardTask(ws(), task())).toMatchObject({ kind: 'failure', detail: 'wrong_numeric' });
    useWorkspaceStore.setState({ answerDigits: {} });
    typeNumber(60);
    expect(judgeStandardTask(ws(), task()).kind).toBe('success');
  });

  it('a board worth another number is still rejected; so is an empty board', () => {
    load(3, 's3_r_t1');
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, tens: 33 }, answerDigits: { hundreds: '3', tens: '4', units: '0' } });
    expect(judgeStandardTask(ws(), task())).toMatchObject({ kind: 'failure', detail: 'wrong_representation' });
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS } });
    expect(judgeStandardTask(ws(), task())).toMatchObject({ kind: 'failure', detail: 'wrong_representation' });
    ws().initSession(1, false, at('s1_r_words703'));
    typeNumber(703);
    expect(judgeStandardTask(ws(), task())).toMatchObject({ kind: 'failure', detail: 'wrong_representation' });
  });

  it('exercises that name blocks or a conversion keep their exact board', () => {
    expect(buildsAnyWay(SESSION1_TASKS.find((t) => t.id === 's1_r_group26')!)).toBe(false);
    expect(buildsAnyWay(SESSION1_TASKS.find((t) => t.id === 's1_target_347')!)).toBe(false);
    for (const t of station3) {
      if (t.type === 'representation') expect(buildsAnyWay(t), t.id).toBe(t.representationKind === 'read_write');
    }
    expect([...new Set(station3.filter((t) => buildsAnyWay(t)).map((t) => t.numberA))].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([270, 340, 506, 3400, 3600, 6030]);
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
  it('a finished tool step says "כָּל הַכָּבוֹד!", with no emoji (chief review S8, 9.10.2026)', () => {
    ws().initSession(1, false, at('s1_decompose_hundred'));
    ws().splitBlockClick('hundreds');
    const v = judgeStandardTask(ws(), task());
    expect(v).toMatchObject({ kind: 'success', title: PRAISE, sub: 'ממשיכים לשלב הבא.' });
  });
});

describe('A2-F09: the success line of a solved exercise', () => {
  // PRD 7.15, Module 14 §ב task 10: after a successful check, the exercise's own "נכון! …".
  it('713 + 94 solved: "נכון! קיבצתם 10 לבני עשרת ללבנת מאה אחת, ולכן בטור העשרות 0: 713 + 94 = 807."', () => {
    ws().initSession(1, false, at('s1_t8'));
    const t = task();
    const result = (t.numberA ?? 0) + (t.numberB ?? 0);
    const v = judgeStandardTask(
      { ...ws(), counts: { ...EMPTY_COUNTS, hundreds: 8, tens: 0, units: 7 }, hasGrouped: true, conversionsByColumn: { composed: { tens: true }, decomposed: {} }, answerDigits: { hundreds: '8', tens: '0', units: '7' }, carryDigits: { hundreds: '1' } } as any,
      t
    );
    expect(result).toBe(807);
    if (v.kind === 'success') expect(`${v.title} ${v.sub}`).toBe('נכון! קיבצתם 10 לבני עשרת ללבנת מאה אחת, ולכן בטור העשרות 0: \u200f713 + 94 = 807.');
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

  // Design-task-zone (owner, 8.10.2026): a done step says "בוצע" beside its green
  // check; a step still to do shows its number — no "עוד לא" pill, no 12px text.
  it('a done item says "בוצע", an open one shows its number and no pill', () => {
    render(<Session1ChecklistCard items={[{ label: 'א', done: true }, { label: 'ב', done: false }]} />);
    expect(screen.getByText('בוצע')).toBeTruthy();
    expect(screen.queryByText('עוד לא')).toBeNull();
    const rows = screen.getByTestId('session1-checklist-items').querySelectorAll('li');
    expect(rows[0].getAttribute('data-state')).toBe('done');
    expect(rows[1].getAttribute('data-state')).toBe('current');
    expect(rows[1].textContent).toContain('2');
  });
});
