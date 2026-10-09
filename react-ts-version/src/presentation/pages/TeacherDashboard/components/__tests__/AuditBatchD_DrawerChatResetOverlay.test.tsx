/**
 * @vitest-environment jsdom
 *
 * Teacher-dashboard truth audit, 4.10.2026 — the learner drawer, the floating
 * chat, the reset confirmation and the overlay hook.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, act } from '@testing-library/react';
import { useState } from 'react';

const pii = vi.hoisted(() => ({ broken: false }));

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
  push: vi.fn(() => ({ key: 'k' })),
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
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('@/core/security/PiiFilter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/security/PiiFilter')>();
  return {
    ...actual,
    validateChatInputForPII: (text: string) => {
      if (pii.broken) throw new Error('filter crashed');
      return actual.validateChatInputForPII(text);
    },
  };
});

import { update } from 'firebase/database';
import { StudentLearningConditionsDrawer } from '../StudentLearningConditionsDrawer';
import { FloatingChatPanel } from '../FloatingChatPanel';
import { ResetConfirmationModal } from '../ResetConfirmationModal';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { useChatStore } from '@/application/useChatStore';

const zOf = (el: Element): number => {
  const m = /(?:^|\s)z-\[(\d+)\]/.exec(el.getAttribute('class') ?? '');
  return m ? Number(m[1]) : 0;
};

beforeEach(() => {
  pii.broken = false;
  vi.mocked(update).mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the learner drawer says and writes only what is true', () => {
  const student = { studentId: 'student_user4', name: 'תלמיד 4', helpRequested: true } as never;

  it('the help banner carries no call count (nothing writes one)', () => {
    render(<StudentLearningConditionsDrawer student={student} onClose={vi.fn()} />);
    expect(screen.getByText('התלמיד ביקש עזרה')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/קריאות תועדו/);
  });

  it('the texts promise only what the quiet-mode switch does', () => {
    render(<StudentLearningConditionsDrawer student={student} onClose={vi.fn()} />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/פיגום|צלילים|ניגודיות|בתרגיל הבא/);
    expect(text).toContain('השינוי מגיע למסכים של התלמיד מיד אחרי השמירה');
  });

  it('saving writes once, to the canonical record, with no gate field and no bare-number twin', async () => {
    const sync = vi.spyOn(firebaseSyncService, 'syncPhysicalOverride').mockResolvedValue(undefined);
    render(<StudentLearningConditionsDrawer student={{ studentId: '4', name: 'תלמיד 4' } as never} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /שמרו את תנאי הלמידה/ })); });

    expect(sync).toHaveBeenCalledTimes(1);
    const [id, payload] = sync.mock.calls[0];
    expect(id).toBe('student_user4');
    expect(Object.keys(payload as object).sort()).toEqual(['isASD', 'overrideUpdatedAt']);
    expect((payload as { isASD: boolean }).isASD).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('the floating chat', () => {
  const student = { studentId: 'student_user4', name: 'תלמיד 4' } as never;
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessage = vi.fn();
    useChatStore.setState({ messages: [], initSync: () => {}, markAsRead: () => {}, clearStudentMessages: () => {}, sendMessage } as never);
  });

  it('is drawn above the learner drawer that opens it', () => {
    render(
      <>
        <FloatingChatPanel student={student} onClose={vi.fn()} teacherId="teacher" />
        <StudentLearningConditionsDrawer student={student} onClose={vi.fn()} />
      </>
    );
    const drawer = screen.getByRole('dialog', { name: /התאמת תנאי למידה — תלמיד 4/ });
    const chat = screen.getByPlaceholderText('כתבו הודעה לתלמיד...').closest('div.fixed')!;
    expect(zOf(chat)).toBeGreaterThan(zOf(drawer));
  });

  it('the send button has a name, and the minimise button speaks in the plural', () => {
    render(<FloatingChatPanel student={student} onClose={vi.fn()} teacherId="teacher" />);
    expect(screen.getByRole('button', { name: 'שליחת ההודעה' })).toBeTruthy();
    expect(screen.getByTitle('מזערו')).toBeTruthy();
    expect(screen.queryByTitle('מזער')).toBeNull();
  });

  it('Module 3 §א (v7.9) — a PII filter failure locks nothing: the message goes and the failure is logged', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<FloatingChatPanel student={student} onClose={vi.fn()} teacherId="teacher" />);
    const box = screen.getByPlaceholderText('כתבו הודעה לתלמיד...') as HTMLInputElement;
    const send = screen.getByRole('button', { name: 'שליחת ההודעה' }) as HTMLButtonElement;

    pii.broken = true;
    fireEvent.change(box, { target: { value: 'שלום' } });
    fireEvent.click(send);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(box.disabled).toBe(false);
    expect(send.disabled).toBe(false);
    expect(consoleError).toHaveBeenCalled();
  });

  it('a message with an e-mail, phone or ID number is still refused', () => {
    render(<FloatingChatPanel student={student} onClose={vi.fn()} teacherId="teacher" />);
    const box = screen.getByPlaceholderText('כתבו הודעה לתלמיד...') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'כתבו ל-dani@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'שליחת ההודעה' }));
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('the reset confirmation', () => {
  function Host({ onConfirm }: { onConfirm: () => Promise<void> }) {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button onClick={() => setOpen(true)}>פתיחה</button>
        <ResetConfirmationModal isOpen={open} onClose={() => setOpen(false)} resetLevel="alerts" onConfirm={onConfirm} />
      </>
    );
  }
  const note = () => screen.getByPlaceholderText(/הסבר קצר על נסיבות האיפוס/) as HTMLInputElement;
  const chooseReason = () => fireEvent.change(screen.getByLabelText(/סיבת האיפוס/), { target: { value: 'test_run' } });
  const execute = () => fireEvent.click(screen.getByRole('button', { name: /בצעו איפוס מבוקר/ }));

  it('the note error does not survive closing the window', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<Host onConfirm={onConfirm} />);
    chooseReason();
    fireEvent.change(note(), { target: { value: 'כתבו לי ל-dani@example.com' } });
    await act(async () => { execute(); });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    fireEvent.click(screen.getByRole('button', { name: 'פתיחה' }));
    expect(note().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Module 3 §א (v7.9) — a PII filter failure locks nothing: the note is kept and the reset goes ahead', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<Host onConfirm={onConfirm} />);
    chooseReason();
    expect(note().disabled).toBe(false);
    fireEvent.change(note(), { target: { value: 'בדיקה של המערכת' } });

    pii.broken = true;
    await act(async () => { execute(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][1]).toBe('בדיקה של המערכת');
    expect(consoleError).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('useDismissableOverlay — focus returns on close (design doc §1.2)', () => {
  function Panel({ onClose }: { onClose: () => void }) {
    const ref = useDismissableOverlay<HTMLDivElement>(true, onClose);
    return <div ref={ref} role="dialog"><button>בפנים</button></div>;
  }
  // The radar's shape: a tile opens a small window, whose button opens the
  // panel and closes the small window in the same click.
  function Radar() {
    const [popup, setPopup] = useState(false);
    const [panel, setPanel] = useState(false);
    return (
      <>
        <button onClick={() => setPopup(true)}>משבצת</button>
        {popup && <button onClick={() => { setPopup(false); setPanel(true); }}>מעבר</button>}
        {panel && <Panel onClose={() => setPanel(false)} />}
      </>
    );
  }

  it('the opener is gone when the panel closes: focus goes to the element before it', () => {
    render(<Radar />);
    const tile = screen.getByRole('button', { name: 'משבצת' });
    tile.focus();
    fireEvent.click(tile);
    const go = screen.getByRole('button', { name: 'מעבר' });
    go.focus();
    fireEvent.click(go);
    expect(screen.queryByRole('button', { name: 'מעבר' })).toBeNull();

    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });

  it('an opener still on the page gets focus back', () => {
    function Simple() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button>אחר</button>
          <button onClick={() => setOpen(true)}>פתיחה</button>
          {open && <Panel onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(<Simple />);
    screen.getByRole('button', { name: 'אחר' }).focus();
    const opener = screen.getByRole('button', { name: 'פתיחה' });
    opener.focus();
    fireEvent.click(opener);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(document.activeElement).toBe(opener);
  });
});
