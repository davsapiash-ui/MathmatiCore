/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup, act, waitFor } from '@testing-library/react';

/**
 * Measure 5 on the radar (owner, 11.10.2026): the colour map card beside
 * the grid (under the action queue), the tile's number of unrecorded events, and "תיעוד התיווך" in the
 * tile's drawer — two taps to record, disabled for a read-only account.
 */
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: { currentUser: null },
  db: {},
  authReady: Promise.resolve(),
  serverNow: () => Date.now(),
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  onValue: vi.fn(() => vi.fn()),
  update: vi.fn().mockResolvedValue(undefined),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), onSnapshot: vi.fn(() => vi.fn()) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({})) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));
const saves = vi.hoisted(() => [] as Array<any>);
vi.mock('@/infrastructure/services/TeacherMediationService', () => ({
  subscribeMeetingMediationTelemetry: vi.fn(() => () => {}),
  subscribeMediationRecords: vi.fn(() => () => {}),
  saveMediationRecord: vi.fn(async (input: any) => {
    saves.push(input);
    return {
      id: 'ev_' + (input.event?.ref ?? 'self_' + saves.length), class_id: 'class_1', student_id: input.studentNumber, session_number: input.meeting,
      event_ref: input.event?.ref ?? null, event_time_iso: input.event ? new Date(input.event.at).toISOString() : new Date().toISOString(),
      action: input.event ? input.action : 'approached', data_led: input.dataLed, note: null, recorded_at: Date.now() + 1000, recorded_by: 'uid',
    };
  }),
}));

import { HeatmapGrid, radarLegendItems, RADAR_LEGEND_LETTERS, type AnonymousStudent } from '../HeatmapGrid';
import { RadarColourMap, useRadarColourMapStore } from '../RadarColourMap';
import { useTeacherMediationStore } from '@/application/useTeacherMediationStore';
import { useReadOnlyStaffStore, READ_ONLY_TITLE } from '@/application/useIsReadOnlyStaff';
import { buildActionQueue, clockHe, type MediationEvent } from '@/core/teacherMediation';

const base = (n: number, over: Partial<AnonymousStudent> = {}): AnonymousStudent => ({
  id: `student_${n}`,
  studentNumber: n,
  displayName: `תלמיד ${n}`,
  sessionNumber: 4,
  currentPath: 'ירוק',
  status: 'active',
  hesitationSeconds: 0,
  errorCount: 0,
  enhancedSupport: false,
  isStruggling: false,
  isSocraticActive: false,
  helpRequested: false,
  isOnline: true,
  ...over,
});

const T = new Date(2026, 9, 11, 9, 7, 0).getTime();
const help1: MediationEvent = { ref: 'log_help_1', studentNumber: 1, kind: 'help_called', at: T };
const card1: MediationEvent = { ref: 'log_card_1', studentNumber: 1, kind: 'radar_card_open', at: T + 60_000 };

beforeEach(() => {
  saves.length = 0;
  useTeacherMediationStore.setState({ meeting: 4, runStartedAt: T - 600_000, telemetryEvents: [help1, card1], records: [], optimistic: [], expandedLearner: null, pendingAction: {} });
});
afterEach(() => {
  cleanup();
  useReadOnlyStaffStore.setState({ readOnly: false });
  useTeacherMediationStore.setState({ meeting: null, runStartedAt: null, telemetryEvents: [], records: [], optimistic: [] });
});

describe('the radar legend', () => {
  it('shows the five colour meanings and the three letters in the colour map card, with the calibrated seconds', () => {
    render(<><HeatmapGrid initialStudents={[base(1)]} /><RadarColourMap /></>);
    const legend = screen.getByTestId('radar-legend');
    const text = legend.textContent ?? '';
    // The full sentence is each row's tooltip and accessible name; the row shows the short label on one line (owner, 11.10.2026).
    const titles = [...legend.querySelectorAll('[data-testid^="radar-legend-"][title]')].map((b) => b.getAttribute('title'));
    for (const meaning of [
      'עובד (פעולה ב-45 השניות האחרונות)',
      'היסוס: 45 שניות בלי פעולה',
      'כרטיס החניכה פתוח אצלו',
      'קרא למורה',
      'לא מחובר או לא התחיל את המפגש',
    ]) expect(titles).toContain(meaning);
    // The rows say the names of the tile's tags (PRD Module 18 §ב), the same as the hover card's first line.
    for (const short of ['קריאה לעזרה', 'כרטיס החניכה פתוח', 'מנותק / טרם התחיל', 'היסוס', 'פעיל']) expect(text).toContain(short);
    expect(text).not.toContain('קרא למורה');
    expect(text).not.toContain('עובד');
    expect(screen.getByTestId('radar-legend-label-GREEN').className).toContain('whitespace-nowrap');
    for (const letter of ['טעות בהבנת ערך המקום', 'טעות חישוב', 'טעות בשלבי הפתרון']) expect(text).toContain(letter);
    expect(RADAR_LEGEND_LETTERS.map((l) => l.glyph)).toEqual(['מ', 'ח', 'ר']);
    expect(radarLegendItems(30).find((i) => i.color === 'YELLOW')!.meaning).toBe('היסוס: 30 שניות בלי פעולה');
    expect(radarLegendItems(30).find((i) => i.color === 'GREEN')!.meaning).toBe('עובד (פעולה ב-30 השניות האחרונות)');
    // The level stripe key is kept, once.
    expect(screen.getAllByTestId('radar-level-legend')).toHaveLength(1);
    // Owner, 11.10.2026 (after the live radar): no strip above the grid any more — the card is the key.
    expect(legend.innerHTML).not.toMatch(/animate-/);
  });

  it('the grid alone draws no legend strip', () => {
    render(<HeatmapGrid initialStudents={[base(1)]} />);
    expect(screen.queryByTestId('radar-legend')).toBeNull();
  });
});

describe('"מפת הצבעים" — live counts and the highlight (owner, 11.10.2026)', () => {
  afterEach(() => useRadarColourMapStore.setState({ highlight: null }));
  const learners = [
    base(1, { helpRequested: true }),
    base(2, { helpRequested: true }),
    base(3, { isSocraticActive: true }),
    base(4, { hesitationSeconds: 120 }),
    base(5),
    base(6, { isOnline: false }),
  ];
  it('rows in the radar priority, each with the number of learners in that state now', async () => {
    render(<><HeatmapGrid initialStudents={learners} /><RadarColourMap /></>);
    const legend = screen.getByTestId('radar-legend');
    const order = within(legend).getAllByRole('button', { pressed: false }).map((b) => b.getAttribute('data-testid'));
    expect(order).toEqual(['radar-legend-BLUE', 'radar-legend-RED', 'radar-legend-GREY', 'radar-legend-YELLOW', 'radar-legend-GREEN']);
    await waitFor(() => expect(within(legend).getByTestId('radar-legend-count-BLUE').textContent).toBe('2'));
    expect(within(legend).getByTestId('radar-legend-count-RED').textContent).toBe('1');
    expect(within(legend).getByTestId('radar-legend-count-YELLOW').textContent).toBe('0'); // no meeting open here: grey, as the tiles (Module 18)
    expect(within(legend).getByTestId('radar-legend-count-GREEN').textContent).toBe('0');
    expect(within(legend).getByTestId('radar-legend-count-GREY').textContent).toBe('3');
  });
  it('a click outlines the tiles in that state only (no colour change, no motion); a second click clears', async () => {
    render(<><HeatmapGrid initialStudents={learners} /><RadarColourMap /></>);
    const tileOf = (n: number) => screen.getAllByRole('button').find((el) => el.getAttribute('aria-label')?.startsWith(`תלמיד ${n}.`))!;
    const before = tileOf(1).getAttribute('data-radar-color');
    fireEvent.click(screen.getByTestId('radar-legend-BLUE'));
    expect(screen.getByTestId('radar-legend-BLUE').getAttribute('aria-pressed')).toBe('true');
    expect(tileOf(1).getAttribute('data-highlighted')).toBe('true');
    expect(tileOf(2).getAttribute('data-highlighted')).toBe('true');
    expect(tileOf(3).getAttribute('data-highlighted')).toBeNull();
    expect(tileOf(1).className).toContain('outline');
    expect(tileOf(1).className).not.toMatch(/animate-/);
    expect(tileOf(1).getAttribute('data-radar-color')).toBe(before);
    fireEvent.click(screen.getByTestId('radar-legend-BLUE'));
    expect(tileOf(1).getAttribute('data-highlighted')).toBeNull();
  });
  it('a read-only account uses it the same way', () => {
    useReadOnlyStaffStore.setState({ readOnly: true });
    render(<><HeatmapGrid initialStudents={learners} /><RadarColourMap /></>);
    expect((screen.getByTestId('radar-legend-RED') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('the tile and its drawer', () => {
  it('the tile shows the number of unrecorded events; the drawer records the newest in two taps', async () => {
    render(<HeatmapGrid initialStudents={[base(1)]} />);
    expect(screen.getByTestId('mediation-badge-1').textContent).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: /תלמיד 1/ }));
    const section = await screen.findByTestId('mediation-log-section');
    expect(section.textContent).toContain('תיעוד התיווך');
    const newest = within(section).getByTestId('mediation-newest');
    expect(newest.textContent).toContain(`כרטיס החניכה נפתח, ${clockHe(T + 60_000)}`);
    expect(within(section).getAllByTestId('mediation-older-row')[0].textContent).toContain(`קריאה לעזרה, ${clockHe(T)}`);

    await act(async () => { fireEvent.click(within(newest).getByTestId('mediation-newest-action-wrote')); });
    expect(saves).toEqual([]); // both choices are needed
    await act(async () => { fireEvent.click(within(newest).getByTestId('mediation-newest-dataled-no')); });
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toMatchObject({ meeting: 4, studentNumber: 1, event: card1, action: 'wrote', dataLed: false });
    // Recorded: the newest open one is now the help call, and the badge says 1.
    await waitFor(() => expect(within(section).getByTestId('mediation-newest').textContent).toContain('קריאה לעזרה'));
    expect(within(section).getAllByTestId('mediation-recorded-row')[0].textContent).toContain('תועד');
    expect(screen.getByTestId('mediation-badge-1').textContent).toBe('1');
  });

  it('"ניגשתי בלי קריאה" asks only whether the data led there, and records a row of its own', async () => {
    render(<HeatmapGrid initialStudents={[base(1)]} />);
    fireEvent.click(screen.getByRole('button', { name: /תלמיד 1/ }));
    const section = await screen.findByTestId('mediation-log-section');
    fireEvent.click(within(section).getByTestId('mediation-self-approach'));
    expect(within(section).queryByTestId('mediation-self-action-wrote')).toBeNull();
    await act(async () => { fireEvent.click(within(section).getByTestId('mediation-self-dataled-yes')); });
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toMatchObject({ meeting: 4, studentNumber: 1, event: null, action: 'approached', dataLed: true });
  });

  it('a read-only account sees the section with every button disabled', async () => {
    useReadOnlyStaffStore.setState({ readOnly: true });
    render(<HeatmapGrid initialStudents={[base(1)]} />);
    fireEvent.click(screen.getByRole('button', { name: /תלמיד 1/ }));
    const section = await screen.findByTestId('mediation-log-section');
    const buttons = within(section).getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(5);
    for (const b of buttons) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.getAttribute('title')).toBe(READ_ONLY_TITLE);
    }
    expect(saves).toEqual([]);
  });
});

describe('buildActionQueue', () => {
  it('one item per learner: help call and chat merged, oldest call first, then unread chat; the rest folded', () => {
    const q = buildActionQueue({
      learners: [{ studentNumber: 3, helpRequested: true }, { studentNumber: 8, helpRequested: false }, { studentNumber: 9, helpRequested: true }],
      openEvents: [
        { ref: 'h3', studentNumber: 3, kind: 'help_called', at: 300 },
        { ref: 'chat:c3', studentNumber: 3, kind: 'chat_learner_message', at: 320 },
        { ref: 'h9', studentNumber: 9, kind: 'chat_help_called', at: 100 },
        { ref: 'chat:c8', studentNumber: 8, kind: 'chat_learner_message', at: 50 },
        { ref: 'hes4', studentNumber: 4, kind: 'radar_hesitation', at: 10 },
      ],
      chatMessages: [
        { id: 'c3', senderId: 'student_user3', timestamp: 320, read: false },
        { id: 'c8', senderId: 'student_user8', timestamp: 50, read: false },
        { id: 't1', senderId: 'teacherUid', timestamp: 60, read: false },
      ],
    });
    expect(q.items.map((i) => [i.studentNumber, i.kind])).toEqual([[9, 'help'], [3, 'help'], [8, 'chat']]);
    expect(q.items.find((i) => i.studentNumber === 3)!.events.map((e) => e.ref)).toEqual(['h3', 'chat:c3']);
    expect(q.items.find((i) => i.studentNumber === 3)!.unreadCount).toBe(1);
    expect(q.toRecord.map((e) => e.ref)).toEqual(['hes4']);
  });

  it('a read chat message with no call waits in the folded list; an expanded learner stays in the queue', () => {
    const q = buildActionQueue({
      learners: [],
      openEvents: [{ ref: 'chat:c2', studentNumber: 2, kind: 'chat_learner_message', at: 5 }],
      chatMessages: [{ id: 'c2', senderId: 'student_user2', timestamp: 5, read: true }],
    });
    expect(q.items).toEqual([]);
    expect(q.toRecord.map((e) => e.ref)).toEqual(['chat:c2']);
    const kept = buildActionQueue({ learners: [], openEvents: [], chatMessages: [], keepOpen: 6 });
    expect(kept.items.map((i) => i.studentNumber)).toEqual([6]);
  });
});

describe('the side action queue, read-only', () => {
  it('is visible with every button disabled, and records nothing', async () => {
    const { MediationQueue } = await import('../MediationQueue');
    useReadOnlyStaffStore.setState({ readOnly: true });
    render(<MediationQueue learners={[{ studentNumber: 1, helpRequested: true }]} gateLearners={[]} onOpenGate={() => {}} readOnly teacherId="t" />);
    const queue = screen.getByTestId('mediation-queue');
    const item = within(queue).getByTestId('queue-item');
    expect(item.getAttribute('data-learner')).toBe('1');
    for (const id of ['queue-action-wrote', 'queue-action-approached', 'queue-action-wrote_and_approached', 'queue-action-none']) {
      const b = within(item).getByTestId(id) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      expect(b.getAttribute('title')).toBe(READ_ONLY_TITLE);
    }
    expect((within(queue).getByTestId('queue-self-approach') as HTMLButtonElement).disabled).toBe(true);
    expect(saves).toEqual([]);
  });
});
