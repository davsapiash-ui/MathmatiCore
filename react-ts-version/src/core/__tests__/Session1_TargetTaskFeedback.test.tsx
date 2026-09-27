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

/**
 * Register decision י (owner, 27.9.2026): once the target task is done, the
 * card says first "נכון! הלבנים מסודרות אחרת, אבל המספר נשאר 347." and then,
 * as before, "לחצו על כפתור התקדם…". The other steps keep their words.
 */

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
    expect(text.indexOf('לחצו על כפתור')).toBeGreaterThan(note.length - 1);
    expect(text).toContain('בסרגל העליון כדי לעבור לשלב הבא!');
    expect(text).not.toContain('מצוין');
    // the sentence has its read-aloud button (PRD Module 24), in the same words
    const speech = [...box.querySelectorAll('[data-testid="speech"]')].map((e) => e.getAttribute('data-text'));
    expect(speech).toEqual([`${note} לחצו על כפתור התקדם בסרגל העליון כדי לעבור לשלב הבא!`]);
  });

  it('says nothing of it before every item is done', () => {
    const notYet = done347.map((i, k) => (k === 2 ? { ...i, done: false } : i));
    render(<Session1ChecklistCard items={notYet} doneNote={session1DoneNoteHe('s1_target_347')} />);
    expect(screen.queryByTestId('session1-done')).toBeNull();
    expect(document.body.textContent).not.toContain('נכון!');
  });
});

describe('the other steps keep their words', () => {
  it('"✨ מצוין! לחצו על כפתור התקדם…" and no extra sentence', () => {
    const items = session1Checklist('s1_decompose_hundred', { counts: { ...EMPTY_COUNTS }, blocksAddedCount: 0, hasUngrouped: true, undoCount: 0, hasClearedBoard: false })!;
    render(<Session1ChecklistCard items={items} doneNote={session1DoneNoteHe('s1_decompose_hundred')} />);
    const text = screen.getByTestId('session1-done').textContent ?? '';
    expect(text.startsWith('✨ מצוין! לחצו על כפתור')).toBe(true);
    expect(text).not.toContain('נכון!');
  });
});
