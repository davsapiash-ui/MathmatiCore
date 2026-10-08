// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({ UdlSpeechButton: () => null }));

import { VerticalAdditionTask } from '@/features/workspace/tasks/VerticalAdditionTask';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import type { Place } from '@/core/placeValue';

/**
 * PRD Module 9, strict instructions: "When the lock is active and the learner
 * attempts input into a locked column, reject the keystroke and emit a brief
 * shake animation on that field."
 *
 * The vertical exercise shook with one flag for the whole row: a keystroke into
 * the locked tens box moved every result box, open ones included, and the move
 * after a digit — units typed, focus to the still-locked tens — shook the row
 * before the child had tried anything there (85 + 17, enhanced profile).
 */
const SHAKE = /shake/;
let recordBlockedKeystroke: ReturnType<typeof vi.fn>;

function row() {
  const { container } = render(<VerticalAdditionTask numberA={85} numberB={17} answerLength={3} />);
  const boxes = [...container.querySelectorAll('input')].filter((i) => /בשורת התוצאה|בתשובה/.test(i.getAttribute('aria-label') ?? ''));
  expect(boxes).toHaveLength(3);
  // Left to right: hundreds, tens, units.
  const [hundreds, tens, units] = boxes;
  return { hundreds, tens, units, all: boxes };
}
const shaking = (boxes: HTMLInputElement[]) => boxes.filter((b) => SHAKE.test(b.style.animation));

beforeEach(() => {
  useAuthStore.setState({ user: { uid: 'student_user4', student_id: 4 } as never, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
  recordBlockedKeystroke = vi.fn();
  // The tens stay locked until a conversion is done in them.
  useWorkspaceStore.setState({
    sessionNumber: 4,
    isColumnInputLocked: (place: Place) => place === 'tens',
    recordBlockedKeystroke,
  } as never);
});
afterEach(() => cleanup());

describe('Module 9 — a keystroke into a locked box shakes that box only', () => {
  it('a digit typed into the locked tens box: only that box shakes, and the attempt is recorded', () => {
    const { tens, all } = row();
    fireEvent.keyDown(tens, { key: '1' });
    expect(shaking(all)).toEqual([tens]);
    expect(recordBlockedKeystroke).toHaveBeenCalledWith('tens');
  });

  it('arriving in a locked box shakes nothing — by a click, or after a digit in the next box', () => {
    const { units, tens, all } = row();
    fireEvent.focus(tens);
    expect(shaking(all)).toEqual([]);

    units.focus();
    fireEvent.change(units, { target: { value: '2' } });
    // PRD Module 14 §ב (v7.9): the focus no longer moves on by itself.
    expect(document.activeElement, 'the focus stays where the digit was typed').toBe(units);
    tens.focus();
    expect(shaking(all), 'no attempt was made in the tens box').toEqual([]);
    expect(recordBlockedKeystroke).not.toHaveBeenCalled();
  });

  it('Tab leaves a locked box without a shake: the lock stops writing, not moving', () => {
    const { tens, all } = row();
    const notPrevented = fireEvent.keyDown(tens, { key: 'Tab' });
    expect(notPrevented).toBe(true);
    expect(shaking(all)).toEqual([]);
  });

  it('the shake keyframes are in the stylesheet the app loads', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf-8');
    expect(css).toMatch(/@keyframes shake\s*\{/);
  });
});
