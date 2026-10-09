/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

import { useWorkspaceStore, judgeStandardTask, buildsAnyWay as storeBuildsAnyWay } from '@/application/useWorkspaceStore';
import { SESSION1_TASKS, getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { buildsAnyWay, builtAnyWay } from '@/data/representationLocks';
import { EMPTY_COUNTS, type PlaceCounts } from '@/core/placeValue';
import { SocraticEngine, socraticTaskContextFor, TASK_HINTS } from '@/infrastructure/services/SocraticEngine';
import { researchErrorCategory } from '@/infrastructure/services/socraticResearchCategory';
import { contradictsRequiredRepresentation, whichNumberIsBuiltCard } from '@/infrastructure/services/staticSocraticCards';
import { PlaceColumn } from '@/features/workspace/board/PlaceColumn';

/**
 * Owner decision 7 (4.10.2026: "לא הייתה לו הנחיה איך לבנות את 340 … טעות
 * זה לא"): in an exercise that only says "build the number X", a board worth
 * X is right however it is built — and nothing after the check may call that
 * board wrong: not the "10 or more" card, not the pulsing "קבצו 10" button,
 * not the AI layer, not the static cards.
 */

const station3 = [...getSessionTasks(3, 'remediation_path'), ...getSessionTasks(3, 'green_path')];
const s3 = (id: string): SessionTask => station3.find((t) => t.id === id)!;
const s1 = (id: string): SessionTask => SESSION1_TASKS.find((t) => t.id === id)!;
const board = (c: Partial<PlaceCounts>): PlaceCounts => ({ ...EMPTY_COUNTS, ...c });

const CROWDED = '10 לבנים או יותר. מה עושים?';
const READ_WITH_TEN = 'באחד הטורים יש 10 לבנים או יותר. איך יודעים איזה מספר הלבנים מראות?';
const nodeOf = (t: SessionTask) => (t as any).targetNode ?? 'basic_addition_fluency';

afterEach(() => cleanup());

describe('the helper lives in data/representationLocks and the store re-exports it', () => {
  it('one function, two import paths', () => {
    expect(storeBuildsAnyWay).toBe(buildsAnyWay);
  });

  it('a board worth the number is an accepted build; another value, an empty board or an exact-board exercise is not', () => {
    expect(builtAnyWay(s3('s3_r_t1'), board({ tens: 34 }))).toBe(true);
    expect(builtAnyWay(s3('s3_r_t1'), board({ hundreds: 3, tens: 4 }))).toBe(true);
    expect(builtAnyWay(s3('s3_r_t1'), board({ tens: 33 }))).toBe(false);
    expect(builtAnyWay(s3('s3_r_t1'), board({}))).toBe(false);
    expect(builtAnyWay(s1('s1_r_words703'), board({ hundreds: 6, tens: 10, units: 3 }))).toBe(true);
    // 26 and 347 name a conversion; a break exercise names its blocks.
    expect(builtAnyWay(s1('s1_r_group26'), board({ units: 26 }))).toBe(false);
    expect(builtAnyWay(s1('s1_target_347'), board({ hundreds: 3, tens: 4, units: 7 }))).toBe(false);
    expect(builtAnyWay(s3('s3_r_t2'), board({ hundreds: 3, tens: 4 }))).toBe(false);
  });
});

describe('a station-3 task published without `representationKind` (an older catalog bank)', () => {
  const bare = (id: string) => {
    const { representationKind: _dropped, ...rest } = s3(id) as SessionTask & { representationKind?: string };
    return rest as SessionTask;
  };

  it('340 (s3_r_t1) is still "build it any way": accepted as 34 tens, no crowded card, own board sent to the AI', () => {
    const t = bare('s3_r_t1');
    expect((t as any).representationKind).toBeUndefined();
    expect(buildsAnyWay(t)).toBe(true);
    expect(builtAnyWay(t, board({ tens: 34 }))).toBe(true);
    expect(SocraticEngine.analyzeLiveBoardState(t, nodeOf(t), board({ tens: 34 }))).toBeNull();
    expect(socraticTaskContextFor(t, undefined, board({ tens: 34 }))?.required_counts).toEqual({ tens: 34 });
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.setState({ sessionNumber: 3, dynamicTasks: [t, { ...t, id: `${t.id}_next` }], standardTaskIdx: 0, flowStatus: 'task', counts: board({ tens: 34 }), answerDigits: { hundreds: '3', tens: '4', units: '0' } } as never);
    expect(judgeStandardTask(useWorkspaceStore.getState(), t).kind).toBe('success');
  });

  it('a break or a one-block exercise without the field keeps its exact board', () => {
    expect(buildsAnyWay(bare('s3_r_t2'))).toBe(false);
    expect(buildsAnyWay(bare('s3_r_t3'))).toBe(false);
    expect(builtAnyWay(bare('s3_r_t2'), board({ hundreds: 3, tens: 4 }))).toBe(false);
  });
});

describe('1. the live "10 or more" card', () => {
  it('340 as 34 tens: no crowded card; 33 tens (another number) still gets it', () => {
    const t = s3('s3_r_t1');
    expect(SocraticEngine.analyzeLiveBoardState(t, nodeOf(t), board({ tens: 34 }))).toBeNull();
    expect(SocraticEngine.analyzeLiveBoardState(t, nodeOf(t), board({ tens: 33 }))?.questionHe).toContain(CROWDED);
    expect(SocraticEngine.getSynchronousTaskHint(t, board({ tens: 34 })).questionHe).not.toContain(CROWDED);
  });

  it('meeting 1: 703 as 6 hundreds, 10 tens, 3 units and 482 as 3 hundreds, 18 tens, 2 units: no crowded card', () => {
    for (const [id, c] of [
      ['s1_r_words703', board({ hundreds: 6, tens: 10, units: 3 })],
      ['s1_r_words482', board({ hundreds: 3, tens: 18, units: 2 })],
      ['s1_r_value368', board({ hundreds: 2, tens: 16, units: 8 })],
    ] as const) {
      const t = s1(id);
      expect(SocraticEngine.analyzeLiveBoardState(t, nodeOf(t), c), id).toBeNull();
      expect(SocraticEngine.getSynchronousTaskHint(t, c).questionHe, id).not.toContain(CROWDED);
    }
  });

  it('meeting 1: 703 worth another number with 10 tens still gets the crowded card; so does an addition', () => {
    const t = s1('s1_r_words703');
    expect(SocraticEngine.analyzeLiveBoardState(t, nodeOf(t), board({ hundreds: 5, tens: 10, units: 3 }))?.questionHe).toContain(CROWDED);
    const add = s1('s1_t8');
    expect(SocraticEngine.analyzeLiveBoardState(add, nodeOf(add), board({ hundreds: 7, tens: 10, units: 7 }))?.questionHe).toContain(CROWDED);
  });
});

describe('2. the research category follows the same rule', () => {
  it('340 as 34 tens records what the usual board records; 33 tens records the live card (no category)', () => {
    const t = s3('s3_r_t1');
    expect(researchErrorCategory(t, board({ tens: 33 }))).toBeNull();
    expect(researchErrorCategory(t, board({ tens: 34 }))).toBe(researchErrorCategory(t, board({ hundreds: 3, tens: 4 })));
    expect(researchErrorCategory(t, board({ tens: 34 }))).not.toBeNull();
  });
});

describe('3. the "קבצו 10" button does not pulse on an accepted board', () => {
  const show = (t: SessionTask, counts: PlaceCounts) => {
    useWorkspaceStore.setState({ sessionNumber: 3, dynamicTasks: [t, { ...t, id: `${t.id}_next` }], standardTaskIdx: 0, flowStatus: 'task', counts } as never);
    const { container } = render(
      <DndContext>
        <PlaceColumn place="tens" canGroup />
      </DndContext>
    );
    const button = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('קבצו 10'));
    expect(button).toBeTruthy();
    return button!;
  };
  beforeEach(() => useWorkspaceStore.getState().resetWorkspace());

  it('340 as 34 tens: the button is there and still', () => {
    const b = show(s3('s3_r_t1'), board({ tens: 34 }));
    expect(b.getAttribute('data-pulse')).toBeNull();
    expect(b.className).not.toContain('animate-pulse');
  });

  it('33 tens (another number): the button pulses', () => {
    const b = show(s3('s3_r_t1'), board({ tens: 33 }));
    expect(b.getAttribute('data-pulse')).toBe('true');
  });
});

describe('4. the AI request names the child\'s own board as the required one', () => {
  it('340 as 34 tens → required_counts { tens: 34 }', () => {
    expect(socraticTaskContextFor(s3('s3_r_t1'), undefined, board({ tens: 34 }))?.required_counts).toEqual({ tens: 34 });
  });

  it('703 as 6 hundreds, 10 tens, 3 units → that board', () => {
    expect(socraticTaskContextFor(s1('s1_r_words703'), undefined, board({ hundreds: 6, tens: 10, units: 3 }))?.required_counts)
      .toEqual({ hundreds: 6, tens: 10, units: 3 });
  });

  it('a board worth another number, no board, and an exact-board exercise keep the exercise\'s own counts', () => {
    const t = s3('s3_r_t1');
    expect(socraticTaskContextFor(t, undefined, board({ tens: 33 }))?.required_counts).toEqual(t.requiredCounts);
    expect(socraticTaskContextFor(t)?.required_counts).toEqual(t.requiredCounts);
    const brk = s3('s3_r_t2');
    expect(socraticTaskContextFor(brk, undefined, board({ hundreds: 3, tens: 4 }))?.required_counts).toEqual(brk.requiredCounts);
  });
});

describe('5. an AI option may not mark another build of the number wrong', () => {
  const t = () => s3('s3_r_t1');
  it('340: "34 עשרות" as a wrong option is refused', () => {
    expect(contradictsRequiredRepresentation(t(), [{ textHe: 'משתמשים ב-34 עשרות', isCorrect: false }])).toBe(true);
    expect(contradictsRequiredRepresentation(t(), [{ textHe: 'משתמשים ב-3 מאות ו-4 עשרות', isCorrect: false }])).toBe(true);
  });

  it('340: the right option stays the exercise\'s own board; a build of another number may be a wrong option', () => {
    expect(contradictsRequiredRepresentation(t(), [{ textHe: 'משתמשים ב-34 עשרות', isCorrect: true }])).toBe(true);
    expect(contradictsRequiredRepresentation(t(), [{ textHe: 'משתמשים ב-3 מאות ו-4 עשרות', isCorrect: true }])).toBe(false);
    expect(contradictsRequiredRepresentation(t(), [{ textHe: 'משתמשים ב-33 עשרות', isCorrect: true }])).toBe(true);
    expect(contradictsRequiredRepresentation(t(), [{ textHe: 'משתמשים ב-33 עשרות', isCorrect: false }])).toBe(false);
  });

  it('a break exercise keeps its exact board: the usual build of the number may be a wrong option', () => {
    const brk = s3('s3_r_t2');
    expect(contradictsRequiredRepresentation(brk, [{ textHe: 'משתמשים ב-3 מאות ו-4 עשרות', isCorrect: false }])).toBe(false);
    expect(contradictsRequiredRepresentation(brk, [{ textHe: 'משתמשים ב-2 מאות ו-14 עשרות', isCorrect: false }])).toBe(true);
  });
});

describe('6. station 3, 506 and 6,030 built with a column of 10 or more', () => {
  const cases = [
    ['s3_r_t5', board({ hundreds: 4, tens: 10, units: 6 }), board({ hundreds: 5, units: 6 })],
    ['s3_g_t5', board({ thousands: 5, hundreds: 10, tens: 3 }), board({ thousands: 6, tens: 3 })],
  ] as const;

  it('the first card is "which number is built", not "יש טור שאין בו לבנים"', () => {
    for (const [id, other] of cases) {
      const c = SocraticEngine.getSynchronousTaskHint(s3(id), other);
      expect(c.questionHe, id).not.toContain('יש טור שאין בו לבנים');
      expect(c.questionHe, id).toBe(whichNumberIsBuiltCard().questionHe);
    }
  });

  it('the second card reads a column of 10 or more', () => {
    for (const [id, other] of cases) {
      const c = SocraticEngine.getSynchronousTaskHint(s3(id), other, { shownKinds: ['which_number'] });
      expect(c.questionHe, id).toContain(READ_WITH_TEN);
    }
  });

  it('the usual board keeps the empty-column card', () => {
    for (const [id, , usual] of cases) {
      expect(SocraticEngine.getSynchronousTaskHint(s3(id), usual).questionHe, id).toContain('יש טור שאין בו לבנים');
    }
  });
});

describe('7. meeting 1, 703 and 482 worth the number with a column of 10 or more', () => {
  const REBUILD = 'איך יודעים כמה לבנים לשים בכל טור?';
  it('the first card already reads the board as it is — not "write in each box how many blocks its column holds"', () => {
    for (const [id, c] of [
      ['s1_r_words703', board({ hundreds: 6, tens: 10, units: 3 })],
      ['s1_r_words482', board({ hundreds: 3, tens: 18, units: 2 })],
    ] as const) {
      const card = SocraticEngine.getSynchronousTaskHint(s1(id), c, {});
      expect(card.questionHe, id).toContain(READ_WITH_TEN);
      expect(card.questionHe, id).not.toBe(TASK_HINTS[id].questionHe);
      const texts = card.choices.flatMap((o) => [o.textHe, o.feedbackHe]).join(' | ');
      expect(texts, id).not.toContain('כתבו בכל תיבה כמה לבנים יש בטור שלה');
      const wrong = card.choices.find((o) => o.textHe === 'כותבים את מספר הלבנים של כל טור, זה אחרי זה');
      expect(wrong, id).toBeTruthy();
      expect(wrong!.isCorrect, id).toBe(false);
      expect(card.choices.find((o) => o.isCorrect)!.textHe, id).toBe('סופרים כל 10 לבנים כמו לבנה אחת של הטור שמשמאל');
    }
  });

  it('703 as 6 hundreds, 10 tens, 3 units with 703 written is judged right; 6-1-0-3 cannot be written in three boxes and 613 is wrong', () => {
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(1, false, SESSION1_TASKS.findIndex((t) => t.id === 's1_r_words703'));
    useWorkspaceStore.setState({ counts: board({ hundreds: 6, tens: 10, units: 3 }), answerDigits: { hundreds: '7', tens: '0', units: '3' } });
    expect(judgeStandardTask(useWorkspaceStore.getState(), s1('s1_r_words703')).kind).toBe('success');
    useWorkspaceStore.setState({ answerDigits: { hundreds: '6', tens: '1', units: '3' } });
    expect(judgeStandardTask(useWorkspaceStore.getState(), s1('s1_r_words703')).kind).toBe('failure');
  });

  it('the usual board of 703 keeps the exercise\'s own first card', () => {
    const card = SocraticEngine.getSynchronousTaskHint(s1('s1_r_words703'), board({ hundreds: 7, units: 3 }), {});
    expect(card.questionHe).toBe(TASK_HINTS.s1_r_words703.questionHe);
  });

  it('the second card: the same reading card; it does not ask how many blocks go in each column', () => {
    for (const [id, c] of [
      ['s1_r_words703', board({ hundreds: 6, tens: 10, units: 3 })],
      ['s1_r_words482', board({ hundreds: 3, tens: 18, units: 2 })],
      ['s1_r_words482', board({ hundreds: 4, tens: 7, units: 12 })],
    ] as const) {
      const card = SocraticEngine.getSynchronousTaskHint(s1(id), c, { shownKinds: ['s1_card'] });
      expect(card.questionHe, id).toContain(READ_WITH_TEN);
      expect(card.questionHe, id).not.toContain(REBUILD);
      expect(card.cardKind, id).toBe('s1_card');
    }
  });

  it('a board worth another number keeps the "how many blocks in each column" card', () => {
    const card = SocraticEngine.getSynchronousTaskHint(s1('s1_r_words703'), board({ hundreds: 3, tens: 7 }), {});
    expect(card.questionHe).toContain(REBUILD);
  });
});

describe('A2-F15: the opener appears once in the card the child gets', () => {
  it('every meeting-1 exercise card, as served', () => {
    for (const id of ['s1_r_words703', 's1_r_value368', 's1_r_words482', 's1_r_group26', 's1_target_347', 's1_t8', 's1_r_sub61', 's1_r_sub806']) {
      const t = s1(id);
      expect(TASK_HINTS[id], id).toBeTruthy();
      const start = id === 's1_r_group26' ? board({ units: 26 }) : board({ hundreds: 1 });
      for (const c of [start, board({ hundreds: 9, tens: 11, units: 12 })]) {
        const card = SocraticEngine.getSynchronousTaskHint(t, c);
        for (const text of [card.questionHe, card.tts_text ?? '']) {
          expect(text.split('נסו לחשוב').length - 1, `${id}: ${text}`).toBe(1);
          expect(text.startsWith('נסו לחשוב: '), `${id}: ${text}`).toBe(true);
        }
      }
    }
  });
});
