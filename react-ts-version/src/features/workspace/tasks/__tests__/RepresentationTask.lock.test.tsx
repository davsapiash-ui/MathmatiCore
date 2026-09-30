/**
 * @vitest-environment jsdom
 *
 * The enhanced-support lock in the component (PRD Module 9 §א; owner's
 * decisions of 28.9.2026, register שהB.4, and 30.9.2026 for station 3).
 *
 * Station 3 and s7_r_t1 / s7_g_t1: ONE answer box, no place names, no place
 * colours; locked until the exercise's conversion is done with the blocks; a
 * digit key into it is rejected, logged as KEYBOARD_LOCK_BLOCKED with the
 * column of the conversion still missing, and shakes it.
 *
 * Station 1 and station 7's other representation exercises keep a box per
 * digit: only the exercise's conversion column locks, and it shakes alone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const sent = vi.hoisted(() => ({ events: [] as any[] }));
vi.mock('@/infrastructure/services/FirebaseSyncService', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/FirebaseSyncService');
  return { ...actual, emitTelemetry: (e: any) => (sent.events.push(e), Promise.resolve()) };
});

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { EMPTY_COUNTS, type PlaceCounts } from '@/core/placeValue';
import { RepresentationTask } from '../RepresentationTask';

const taskOf = (meeting: 3 | 7, path: 'green_path' | 'remediation_path', id: string) =>
  getSessionTasks(meeting, path).find((t) => t.id === id)!;

function load(meeting: number, task: SessionTask, counts: Partial<PlaceCounts>, profile: string | null = 'enhanced_cognitive_support') {
  useWorkspaceStore.getState().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, ...(profile ? { support_profile_id: profile } : {}) } } as any);
  useWorkspaceStore.setState({
    activeSupportProfileId: profile, // Module 19 §ב: the applied profile
    sessionNumber: meeting, dynamicTasks: [task], standardTaskIdx: 0, flowStatus: 'task',
    counts: { ...EMPTY_COUNTS, ...counts },
  } as any);
  sent.events.length = 0;
}

describe('station 3: one answer box', () => {
  // s3_r_t4: 8 tens and 5 units; a ten is broken into ten units → 85.
  const task = taskOf(3, 'remediation_path', 's3_r_t4');

  beforeEach(() => load(3, task, { tens: 8, units: 5 }));

  it('one box, no place names, no place colours, no big number over it', () => {
    const { container } = render(<RepresentationTask task={task} />);
    const row = screen.getByTestId('result-row');
    expect(row.getAttribute('aria-label')).toBe('שורת התוצאה');
    expect(row.querySelectorAll('input')).toHaveLength(1);
    const box = screen.getByTestId('representation-answer') as HTMLInputElement;
    expect(box.getAttribute('aria-label')).toBe('התשובה');
    expect(box.style.borderColor).toBe('rgb(148, 163, 184)'); // the one neutral colour of every free box
    expect(box.getAttribute('style')).not.toMatch(/--block-/);
    expect(container.textContent).not.toMatch(/יחידות|עשרות|מאות|אלפים/);
    expect(screen.queryByTestId('representation-number')).toBeNull();
    expect(container.textContent).not.toContain('85');
  });

  it('a digit key in the locked box is rejected, logged with the column of the missing break, and shakes the box', () => {
    render(<RepresentationTask task={task} />);
    const box = screen.getByTestId('representation-answer') as HTMLInputElement;
    expect(box.readOnly).toBe(true);
    expect(box.getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(box, { key: '8' });
    const blocked = sent.events.filter((e) => e.event_type === 'KEYBOARD_LOCK_BLOCKED');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].column_index).toBe(0); // the units wait for the ten
    expect(blocked[0].details.conversion_required).toBe('decomposition');
    expect(box.style.animation).toContain('shake');
    // Tab still leaves the box: nothing is logged for it.
    fireEvent.keyDown(box, { key: 'Tab' });
    expect(sent.events.filter((e) => e.event_type === 'KEYBOARD_LOCK_BLOCKED')).toHaveLength(1);
    // A change that gets through anyway (paste) is refused too.
    fireEvent.change(box, { target: { value: '85' } });
    expect(useWorkspaceStore.getState().answerDigits).toEqual({});
  });

  it("the break opens the box; it takes a free number, kept as the row's digits", () => {
    render(<RepresentationTask task={task} />);
    act(() => useWorkspaceStore.getState().splitBlockClick('tens'));
    const box = screen.getByTestId('representation-answer') as HTMLInputElement;
    expect(box.readOnly).toBe(false);
    fireEvent.change(box, { target: { value: '8' } });
    fireEvent.change(box, { target: { value: '85' } });
    expect(useWorkspaceStore.getState().answerDigits).toEqual({ tens: '8', units: '5' });
    expect(box.value).toBe('85');
    // Anything but a digit is dropped; four digits at most.
    fireEvent.change(box, { target: { value: '8,5a' } });
    expect(box.value).toBe('85');
    fireEvent.change(box, { target: { value: '123456' } });
    expect(box.value).toBe('1234');
    // Typing is undone like any other action (Module 11 §א).
    act(() => useWorkspaceStore.getState().undo());
    expect(box.value).toBe('85');
  });

  it('every other learner types at once', () => {
    load(3, task, { tens: 8, units: 5 }, null);
    render(<RepresentationTask task={task} />);
    const box = screen.getByTestId('representation-answer') as HTMLInputElement;
    expect(box.readOnly).toBe(false);
    fireEvent.change(box, { target: { value: '85' } });
    expect(useWorkspaceStore.getState().answerDigits).toEqual({ tens: '8', units: '5' });
  });

  it('a decomposition is never locked (s3_g_t3: 4,500 from hundreds only)', () => {
    const t3 = taskOf(3, 'green_path', 's3_g_t3');
    load(3, t3, {});
    render(<RepresentationTask task={t3} />);
    const box = screen.getByTestId('representation-answer') as HTMLInputElement;
    expect(box.readOnly).toBe(false);
    fireEvent.change(box, { target: { value: '45' } });
    expect(useWorkspaceStore.getState().answerDigits).toEqual({ tens: '4', units: '5' });
  });
});

describe('station 7, s7_g_t6: a box per digit, per column', () => {
  // 1 thousand, 16 hundreds, 13 tens → 2,730: tens grouped into a hundred, hundreds into a thousand.
  const task = taskOf(7, 'green_path', 's7_g_t6');

  beforeEach(() => load(7, task, { thousands: 1, hundreds: 16, tens: 13 }));

  it('a digit key in a locked box is rejected, logged with its column, and shakes that box only', () => {
    render(<RepresentationTask task={task} />);
    const tens = screen.getByLabelText('ספרת העשרות בשורת התוצאה') as HTMLInputElement;
    const units = screen.getByLabelText('ספרת היחידות בשורת התוצאה') as HTMLInputElement;
    expect(tens.readOnly).toBe(true);
    expect(units.readOnly).toBe(false);
    fireEvent.keyDown(tens, { key: '3' });
    const blocked = sent.events.filter((e) => e.event_type === 'KEYBOARD_LOCK_BLOCKED');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].column_index).toBe(1);
    expect(blocked[0].details.conversion_required).toBe('composition');
    expect(tens.style.animation).toContain('shake');
    expect(units.style.animation).toBe('');
    // No big number over the row in station 7 either: it was the answer, 2,730.
    expect(screen.queryByTestId('representation-number')).toBeNull();
  });

  it('the open box takes a digit, and the locked one opens after the grouping', () => {
    render(<RepresentationTask task={task} />);
    const units = screen.getByLabelText('ספרת היחידות בשורת התוצאה') as HTMLInputElement;
    fireEvent.change(units, { target: { value: '0' } });
    expect(useWorkspaceStore.getState().answerDigits.units).toBe('0');
    act(() => useWorkspaceStore.getState().groupColumnClick('tens'));
    const tens = screen.getByLabelText('ספרת העשרות בשורת התוצאה') as HTMLInputElement;
    expect(tens.readOnly).toBe(false);
  });
});

describe('writing a number goes as it is read, the highest place first (owner, 1.10.2026)', () => {
  // Meeting 2 diagnoses "שש מאות ושמונה" written as 806; a typing habit from
  // the units in station 1 would produce it without the misconception.
  it('station 1, s1_r_words703: after each digit the cursor moves to the next lower place', () => {
    const task = getSessionTasks(1, null as any).find((t) => t.id === 's1_r_words703')!;
    load(1, task, { hundreds: 7, units: 3 }, null);
    render(<RepresentationTask task={task} />);
    const [h, t, u] = Array.from(screen.getByTestId('result-row').querySelectorAll('input')) as HTMLInputElement[];
    expect(h.getAttribute('aria-label')).toContain('מאות');
    h.focus();
    fireEvent.change(h, { target: { value: '7' } });
    expect(document.activeElement).toBe(t);
    fireEvent.change(t, { target: { value: '0' } });
    expect(document.activeElement).toBe(u);
    fireEvent.change(u, { target: { value: '3' } });
    expect(document.activeElement).toBe(u);
    const d = useWorkspaceStore.getState().answerDigits;
    expect([d.hundreds, d.tens, d.units]).toEqual(['7', '0', '3']);
  });

  it('station 7, s7_r_t6: the same order', () => {
    const task = getSessionTasks(7, 'remediation_path').find((t) => t.id === 's7_r_t6')!;
    load(7, task, { hundreds: 5, tens: 1 }, null);
    render(<RepresentationTask task={task} />);
    const [h, t] = Array.from(screen.getByTestId('result-row').querySelectorAll('input')) as HTMLInputElement[];
    h.focus();
    fireEvent.change(h, { target: { value: '5' } });
    expect(document.activeElement).toBe(t);
  });
});

describe('the cursor never lands in a locked box (enhanced profile, 1.10.2026)', () => {
  it('s1_target_347: after the tens digit the cursor skips the locked units box, and Tab leaves it', () => {
    const task = getSessionTasks(1, null as any).find((t) => t.id === 's1_target_347')!;
    load(1, task, { hundreds: 3, tens: 4, units: 7 });
    render(<RepresentationTask task={task} />);
    const [h, t, u] = Array.from(screen.getByTestId('result-row').querySelectorAll('input')) as HTMLInputElement[];
    expect(u.readOnly).toBe(true);
    h.focus();
    fireEvent.change(h, { target: { value: '3' } });
    expect(document.activeElement).toBe(t);
    fireEvent.change(t, { target: { value: '4' } });
    expect(document.activeElement).toBe(t);
    expect(sent.events.filter((e) => e.event_type === 'KEYBOARD_LOCK_BLOCKED')).toHaveLength(0);
    // Tab is not swallowed by the locked box.
    u.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    u.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });
});
