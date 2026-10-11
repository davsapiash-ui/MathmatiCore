/**
 * @vitest-environment jsdom
 *
 * Owner decision 11.10.2026 (round two): the radar tile says "סיים",
 * "ברפלקציה" or "משימה N/7" in the open meeting, a blue tile "מחכה M:SS" and a
 * red tile "כרטיס פתוח M:SS" — with the tile's colour and tag unchanged.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

const NOW = 1_700_000_000_000;

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: { currentUser: null },
  db: {},
  serverNow: () => NOW,
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  onValue: vi.fn((r: { path?: string }, cb: (snap: unknown) => void) => {
    if (r?.path === 'active_class_session') {
      const val = { active: true, status: 'active', sessionNumber: 4, startedAt: NOW - 60_000 };
      cb({ exists: () => true, val: () => val });
    }
    return vi.fn();
  }),
  update: vi.fn().mockResolvedValue(undefined),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), onSnapshot: vi.fn(() => vi.fn()) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({})) }));

import { HeatmapGrid, tileHoverLinesHe, type AnonymousStudent } from '../HeatmapGrid';

const base = (n: number, over: Partial<AnonymousStudent>): AnonymousStudent => ({
  id: `student_${n}`, studentNumber: n, displayName: `תלמיד ${n}`, sessionNumber: 4, currentPath: 'ירוק', status: 'active',
  hesitationSeconds: 0, errorCount: 0, enhancedSupport: false, isStruggling: false, isSocraticActive: false, helpRequested: false,
  lastAction: '', isOnline: true, ...over,
});

const students: AnonymousStudent[] = [
  base(1, { progress: { kind: 'task', taskNumber: 4 }, exercise: { a: 352, b: 61, subtraction: false }, errorCategory: 'calculation' }),
  base(2, { progress: { kind: 'finished' } }),
  base(3, { helpRequested: true, helpSince: NOW - 83_000, progress: { kind: 'task', taskNumber: 2 } }),
  base(4, { isSocraticActive: true, cardSince: NOW - 42_000 }),
  base(5, { sessionNumber: 3, progress: { kind: 'task', taskNumber: 1 } }),
  ...[6, 7, 8, 9, 10, 11, 12].map((n) => base(n, { isOnline: false })),
];

const tile = (n: number) => screen.getAllByRole('button').find((el) => el.getAttribute('aria-label')?.startsWith(`תלמיד ${n}.`))!;

describe('the radar tile, round two', () => {
  it('"משימה N/7" and "סיים" in place of the meeting name, which stays the tooltip', () => {
    render(<HeatmapGrid initialStudents={students} />);
    expect(within(tile(1)).getByTestId('tile-progress-1').textContent).toBe('משימה 4/7');
    expect(within(tile(2)).getByTestId('tile-progress-2').textContent).toBe('סיים');
    expect(within(tile(1)).getByTestId('tile-progress-1').getAttribute('title')).toContain('מפגש 4');
    expect(tile(2).getAttribute('aria-label')).toContain('סיים');
  });

  it('a finished learner keeps today\'s colour (no new colour)', () => {
    render(<HeatmapGrid initialStudents={students} />);
    expect(tile(2).getAttribute('data-radar-color')).toBe('GREEN');
  });

  it('a learner in another meeting keeps the meeting name', () => {
    render(<HeatmapGrid initialStudents={students} />);
    expect(within(tile(5)).queryByTestId('tile-progress-5')).toBeNull();
  });

  it('blue: "מחכה M:SS" with the help tag; red: "כרטיס פתוח M:SS" with the card tag', () => {
    render(<HeatmapGrid initialStudents={students} />);
    expect(tile(3).getAttribute('data-radar-color')).toBe('BLUE');
    expect(within(tile(3)).getByTestId('tile-clock-3').textContent).toBe('מחכה 1:23');
    expect(within(tile(3)).getAllByText('קריאה לעזרה').length).toBeGreaterThan(0);
    expect(tile(4).getAttribute('data-radar-color')).toBe('RED');
    expect(within(tile(4)).getByTestId('tile-clock-4').textContent).toBe('כרטיס פתוח 0:42');
    expect(within(tile(1)).queryByTestId('tile-clock-1')).toBeNull();
  });

  it('nothing on the tile pulses or bounces', () => {
    render(<HeatmapGrid initialStudents={students} />);
    for (const n of [1, 2, 3, 4]) expect(tile(n).outerHTML).not.toMatch(/animate-(pulse|bounce|ping)/);
  });
});

describe('the tile hover card (owner, 11.10.2026)', () => {
  const ctx = (colour: 'BLUE' | 'RED' | 'YELLOW' | 'GREEN' | 'GREY', over: Partial<Parameters<typeof tileHoverLinesHe>[1]> = {}) =>
    ({ colour, thresholdSeconds: 45, now: NOW, openMediation: 0, inOpenMeeting: true, ...over });
  it('blue: the call and the wait', () => {
    const lines = tileHoverLinesHe(students[2], ctx('BLUE', { openMediation: 2 }));
    // The state's name first, as the tile's tag and the colour map say it (PRD Module 18 §ב).
    expect(lines[0]).toBe('קריאה לעזרה · מחכה 1:23');
    expect(lines).toContain('לתיעוד: 2');
  });
  it('red: the card and how long it is open', () => {
    expect(tileHoverLinesHe(students[3], ctx('RED'))[0]).toBe('כרטיס החניכה פתוח · 0:42');
  });
  it('yellow: the seconds without action', () => {
    const lines = tileHoverLinesHe(base(9, { hesitationSeconds: 52 }), ctx('YELLOW'));
    expect(lines[0]).toBe('היסוס · 52 שניות בלי פעולה');
    expect(lines).toContain('אין אירועים לתיעוד');
  });
  it('green and grey: "פעיל", "מנותק", "טרם התחיל" — the tags\' names, never "עובד" or "לא מחובר"', () => {
    expect(tileHoverLinesHe(students[0], ctx('GREEN'))[0]).toBe('פעיל · פעולה ב-45 השניות האחרונות');
    expect(tileHoverLinesHe(base(10, { isOnline: false }), ctx('GREY'))[0]).toBe('מנותק');
    expect(tileHoverLinesHe(base(11, { isOnline: true }), ctx('GREY'))[0]).toBe('טרם התחיל את המפגש');
  });
  it('the exercise, the error letter and the level', () => {
    const lines = tileHoverLinesHe(students[0], ctx('GREEN'));
    expect(lines).toContain('משימה 4/7 · '+String.fromCharCode(0x2066)+'352 + 61'+String.fromCharCode(0x2069));
    expect(lines.some((l) => l.startsWith('ח: '))).toBe(true);
    expect(lines.some((l) => l.startsWith('מסלול: '))).toBe(true);
  });
  it('opens on hover after a short delay, without moving the tile, and closes on leave', async () => {
    render(<HeatmapGrid initialStudents={students} />);
    const wrapper = tile(3).parentElement!;
    fireEvent.mouseEnter(wrapper);
    expect(screen.queryByTestId('tile-hover-3')).toBeNull();
    const card = await screen.findByTestId('tile-hover-3', {}, { timeout: 1500 });
    expect(card.textContent).toContain('קריאה לעזרה · מחכה');
    expect(card.className).toContain('absolute');
    expect(tile(3).getAttribute('aria-describedby')).toBe('tile-hover-3');
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByTestId('tile-hover-3')).toBeNull();
  });
});
