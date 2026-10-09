/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { Session1ChecklistCard } from '@/features/workspace/tasks/Session1ChecklistCard';
import { session1Checklist, session1DoneNoteHe } from '@/core/session1Checklist';
import { EMPTY_COUNTS } from '@/core/placeValue';
import { PROCEED_HE, proceedSentenceHe } from '@/core/toolbarNames';

/**
 * Register decision י (owner, 27.9.2026): once the target task is done, the
 * card says first "נכון! הלבנים מסודרות אחרת, אבל המספר נשאר 347." and then,
 * as before, the sentence that names the proceed button. The other steps
 * keep their words.
 *
 * Owner, 28.9.2026: the proceed button is "ממשיכים" (core/toolbarNames), and
 * the sentence on the screen and the one read aloud are built from the same
 * source as the button, so they cannot drift.
 */

/** What the box shows, with the button copy's arrow (drawn, not read) removed. */
const shown = (el: Element) => (el.textContent ?? '').replace(/\s*←\s*/g, ' ').replace(/\s+/g, ' ').trim();

afterEach(cleanup);

const done347 = session1Checklist('s1_target_347', {
  counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 3, units: 17 },
  hasUngrouped: true,
  answerDigits: { hundreds: '3', tens: '4', units: '7' },
  blocksAddedCount: 0,
  undoCount: 0,
  hasClearedBoard: false,
})!;

describe('the target task, done', () => {
  it('says the owner\'s sentence first, then what to press — one praise', () => {
    expect(done347.every((i) => i.done)).toBe(true);
    render(<Session1ChecklistCard items={done347} doneNote={session1DoneNoteHe('s1_target_347')} />);
    const box = screen.getByTestId('session1-done');
    const text = box.textContent ?? '';
    const note = 'נכון! הלבנים מסודרות אחרת, אבל המספר נשאר 347.';
    expect(text.indexOf(note)).toBe(0);
    expect(text.indexOf('לחצו על הכפתור')).toBeGreaterThan(note.length - 1);
    expect(text).toContain('בסרגל העליון כדי לעבור לשלב הבא!');
    expect(text).not.toContain('מצוין');
    // the sentence has its read-aloud button (PRD Module 24), in the same words
    const speech = [...box.querySelectorAll('[data-testid="speech"]')].map((e) => e.getAttribute('data-text'));
    expect(speech).toEqual([`${note} לחצו על הכפתור "ממשיכים" בסרגל העליון כדי לעבור לשלב הבא!`]);
    // screen and speech are the same sentence, naming the button by its own name
    // (the screen draws the name as a copy of the button, the speech quotes it)
    expect(shown(screen.getByTestId('proceed-sentence'))).toBe(proceedSentenceHe().replace(/"/g, ''));
    expect(screen.getByTestId('proceed-chip').textContent).toContain(PROCEED_HE);
    expect(PROCEED_HE).toBe('ממשיכים');
  });

  it('says nothing of it before every item is done', () => {
    const notYet = done347.map((i, k) => (k === 2 ? { ...i, done: false } : i));
    render(<Session1ChecklistCard items={notYet} doneNote={session1DoneNoteHe('s1_target_347')} />);
    expect(screen.queryByTestId('session1-done')).toBeNull();
    expect(document.body.textContent).not.toContain('נכון!');
  });
});

/**
 * Owner, 8.10.2026 (learner wording proposal §א, rule 6): the tool steps say
 * what happened instead of "✨ מצוין!" — "הלבנים השתנו, אבל המספר נשאר 230."
 * after a break — then the sentence that names the proceed button. No "נכון":
 * the tool steps have no right or wrong answer (PRD Module 14).
 */
describe('the tool steps say what happened, then what to press', () => {
  it('230 broken: "הלבנים השתנו, אבל המספר נשאר 230." and the proceed sentence, read aloud too', async () => {
    const { TaskCard } = await import('@/features/workspace/tasks/TaskCard');
    const { useWorkspaceStore } = await import('@/application/useWorkspaceStore');
    const { SESSION1_TASKS } = await import('@/data/sessionTasks');
    const ws = useWorkspaceStore.getState();
    ws.resetWorkspace();
    ws.initSession(1, false, SESSION1_TASKS.findIndex((t) => t.id === 's1_decompose_hundred'));
    useWorkspaceStore.setState({ openingScreenSeen: true, hasUngrouped: true } as any);
    render(<TaskCard />);
    const box = screen.getByTestId('session1-done');
    const note = 'הלבנים השתנו, אבל המספר נשאר 230.';
    expect((box.textContent ?? '').startsWith(note)).toBe(true);
    expect(box.textContent).not.toContain('נכון!');
    expect(box.textContent).not.toContain('מצוין');
    expect(shown(screen.getByTestId('proceed-sentence'))).toBe(proceedSentenceHe().replace(/"/g, ''));
    const speech = [...box.querySelectorAll('[data-testid="speech"]')].map((e) => e.getAttribute('data-text'));
    expect(speech).toEqual([`${note} ${proceedSentenceHe()}`]);
  });
});
