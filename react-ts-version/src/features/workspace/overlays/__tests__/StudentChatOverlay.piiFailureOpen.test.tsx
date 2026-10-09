/**
 * @vitest-environment jsdom
 *
 * PRD Module 3 §א (v7.9): "אם רכיב הסינון עצמו נכשל (שגיאת ריצה), שום דבר
 * אינו ננעל: הצ'אט, ההקלדה והעבודה ממשיכים כרגיל, והכשל נרשם ביומן השרת".
 *
 * The filter used to fail closed: a failure locked the text box until the
 * filter answered again. Now nothing locks, the message goes, and the failure
 * is logged. A message the filter reads and finds PII in is still refused.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';

const pii = vi.hoisted(() => ({ broken: false }));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  auth: { currentUser: null },
  authReady: Promise.resolve(),
  serverNow: () => Date.now(),
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  update: vi.fn(() => Promise.resolve()),
  set: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'k' })),
  onValue: vi.fn(() => () => {}),
  get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
}));
vi.mock('@/application/useActiveClassSession', () => ({ useActiveClassSession: () => null }));
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({ UdlSpeechButton: () => null }));
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

import { StudentChatOverlay, READY_HELP_MESSAGE_HE, PII_REFUSAL_CHILD_HE } from '../StudentChatOverlay';
import { setPiiFilterFailureSink } from '@/core/security/PiiFilter';
import { useAuthStore } from '@/application/useAuthStore';
import { useChatStore } from '@/application/useChatStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

describe('Module 3 §א — a PII filter failure locks nothing and is logged', () => {
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pii.broken = false;
    useAuthStore.setState({
      user: { uid: 'student_user3', role: 'student', name: 'תלמיד 3' } as never,
      role: 'student',
      isAuthenticated: true,
      isStudentAuthenticated: true,
    });
    sendMessage = vi.fn();
    useChatStore.setState({ messages: [], initSync: () => {}, markAsRead: () => {}, sendMessage } as never);
    useWorkspaceStore.setState({ sessionNumber: 4, activeBankPath: 'green_path', dynamicTasks: null, standardTaskIdx: 2, logChatHelpRequest: vi.fn() } as never);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    setPiiFilterFailureSink(null);
  });

  function open() {
    const view = render(<StudentChatOverlay />);
    act(() => { document.dispatchEvent(new Event('toggle-chat')); });
    const box = view.container.querySelector('input[aria-label="הודעה למורה"]') as HTMLInputElement;
    const send = view.container.querySelector('button[aria-label="שליחת ההודעה"]') as HTMLButtonElement;
    const ready = Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === READY_HELP_MESSAGE_HE)!;
    return { box, send, ready };
  }

  it('the failure locks nothing: the message goes, the box stays open, and the failure is logged', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = vi.fn();
    setPiiFilterFailureSink(sink);
    const { box, send, ready } = open();
    pii.broken = true;
    fireEvent.change(box, { target: { value: 'אפשר עזרה בתרגיל 3' } });
    fireEvent.click(send);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][3]).toBe('אפשר עזרה בתרגיל 3');
    expect(box.disabled).toBe(false);
    expect(box.value, 'sent, so the box is cleared').toBe('');
    expect(consoleError).toHaveBeenCalled();
    expect(sink, 'the failure reaches the server log').toHaveBeenCalledWith('StudentChatOverlay', expect.any(Error));

    // Typing and sending continue while the filter is still down.
    fireEvent.change(box, { target: { value: 'עוד שאלה' } });
    expect(box.value).toBe('עוד שאלה');
    fireEvent.click(send);
    expect(sendMessage).toHaveBeenCalledTimes(2);

    fireEvent.click(ready);
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it('a refused message gets one child\'s sentence, not the teacher screens\' text (audit 4.10.2026, A7-006)', async () => {
    const { toast } = await import('sonner');
    const { box, send } = open();
    for (const typed of ['המייל שלי a@b.co', 'הטלפון 0501234567']) {
      vi.mocked(toast.warning).mockClear();
      fireEvent.change(box, { target: { value: typed } });
      fireEvent.click(send);
      expect(sendMessage).not.toHaveBeenCalled();
      expect(toast.warning).toHaveBeenCalledWith(PII_REFUSAL_CHILD_HE);
    }
    expect(PII_REFUSAL_CHILD_HE).toBe("בהודעה יש מספר טלפון, מספר זהות או כתובת מייל. בצ'אט לא כותבים אותם. מחקו ושלחו שוב.");
  });

  it('the ready messages are at least 12px, the size of the card\'s text (UX audit 4.10.2026, UX-008)', () => {
    const { ready } = open();
    expect(ready.className).toMatch(/\btext-sm\b/);
    expect(ready.className).not.toMatch(/text-\[11px\]/);
  });
});
