/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, act } from '@testing-library/react';

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: { currentUser: null },
  db: {},
  authReady: Promise.resolve(),
  serverNow: () => Date.now(),
  isServerClockKnown: () => true,
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  onValue: vi.fn(() => vi.fn()),
  update: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue({ exists: () => false, val: () => null }),
  onDisconnect: vi.fn(() => ({ set: vi.fn().mockResolvedValue(undefined), cancel: vi.fn().mockResolvedValue(undefined) })),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
  orderByChild: vi.fn((k) => k),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => vi.fn()),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({})) }));

import { StudentLearningConditionsDrawer } from '../StudentLearningConditionsDrawer';

/**
 * Radar tile → "מעבר לניתוח מעמיק" → the learner drawer → "איפוס נתונים".
 * The confirmation window was portalled at z-50, under the drawer's backdrop
 * (z-[9998]) and panel (z-[9999]): the confirm click hit the backdrop and
 * closed everything, and one Escape closed both windows.
 */

afterEach(cleanup);

const zOf = (el: Element): number => {
  const cls = el.getAttribute('class') ?? '';
  const m = /(?:^|\s)z-\[(\d+)\]/.exec(cls) ?? /(?:^|\s)z-(\d+)(?:\s|$)/.exec(cls);
  return m ? Number(m[1]) : 0;
};

const student = { studentId: 'student_user4', name: 'תלמיד 4' } as never;

function openResetFromDrawer(onClose = vi.fn()) {
  render(<StudentLearningConditionsDrawer student={student} onClose={onClose} activeSessionNumber={4} />);
  fireEvent.click(screen.getByRole('button', { name: 'איפוס נתונים של תלמיד 4' }));
  return {
    onClose,
    drawer: screen.getByRole('dialog', { name: /התאמת תנאי למידה — תלמיד 4/ }),
    confirm: screen.getByRole('dialog', { name: 'אישור איפוס נתונים' }),
  };
}

describe('the reset confirmation sits above the learner drawer', () => {
  it('drawn above the drawer and its backdrop', () => {
    const { drawer, confirm } = openResetFromDrawer();
    // Every other full-screen layer on the page, the drawer's backdrop included.
    const layers = Array.from(document.body.querySelectorAll('div.fixed')).filter((d) => d !== confirm && !confirm.contains(d));
    expect(layers.length).toBeGreaterThan(0);
    expect(zOf(confirm)).toBeGreaterThan(zOf(drawer));
    for (const layer of layers) expect(zOf(confirm)).toBeGreaterThan(zOf(layer));
  });

  it('Escape closes the confirmation only; the drawer stays open', () => {
    const { onClose } = openResetFromDrawer();
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryByRole('dialog', { name: 'אישור איפוס נתונים' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /התאמת תנאי למידה — תלמיד 4/ })).toBeTruthy();

    // The next Escape belongs to the drawer again.
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useDismissableOverlay: only the overlay opened last answers the keyboard', () => {
  it('Tab is trapped by the top overlay alone', async () => {
    const { useDismissableOverlay } = await import('@/hooks/useDismissableOverlay');
    function Overlay({ name, open }: { name: string; open: boolean }) {
      const r = useDismissableOverlay<HTMLDivElement>(open, () => {});
      return open ? (
        <div ref={r} role="dialog" aria-label={name}>
          <button>{`${name} first`}</button>
          <button>{`${name} last`}</button>
        </div>
      ) : null;
    }
    const { rerender } = render(<><Overlay name="drawer" open /><Overlay name="confirm" open={false} /></>);
    rerender(<><Overlay name="drawer" open /><Overlay name="confirm" open /></>);
    // jsdom has no layout; make every button count as visible to the trap.
    for (const b of Array.from(document.querySelectorAll('button'))) Object.defineProperty(b, 'offsetParent', { get: () => document.body });

    const focusedInDrawer: string[] = [];
    screen.getByRole('dialog', { name: 'drawer' }).addEventListener('focusin', (e) => focusedInDrawer.push((e.target as HTMLElement).textContent ?? ''));

    screen.getByText('confirm last').focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => { window.dispatchEvent(tab); });
    expect(document.activeElement?.textContent).toBe('confirm first');
    // The drawer's trap used to run first and pull focus into the drawer, and
    // the confirmation's trap pulled it back.
    expect(focusedInDrawer).toEqual([]);
  });
});
