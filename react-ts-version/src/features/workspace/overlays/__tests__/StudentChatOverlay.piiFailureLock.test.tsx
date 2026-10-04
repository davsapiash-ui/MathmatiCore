/**
 * @vitest-environment jsdom
 *
 * PRD Module 3 §א: "במקרה של תקלה ברכיב הסינון, המערכת נועלת את הקלט ליתר
 * ביטחון עד להתאוששות הלוגיקה"; "if the PII detection logic encounters a
 * runtime error, disable all input and transmission components immediately".
 *
 * A filter failure stopped that one send and left the box open. Now the text
 * box and its send button stay locked until the filter answers again; the
 * ready messages and "קראו למורה" carry no typed text and stay available.
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

import { StudentChatOverlay, PII_FILTER_RECHECK_MS, READY_HELP_MESSAGE_HE, PII_REFUSAL_CHILD_HE } from '../StudentChatOverlay';
import { useAuthStore } from '@/application/useAuthStore';
import { useChatStore } from '@/application/useChatStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

describe('Module 3 §א — a PII filter failure locks the text box until the filter recovers', () => {
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
  });

  function open() {
    const view = render(<StudentChatOverlay />);
    act(() => { document.dispatchEvent(new Event('toggle-chat')); });
    const box = view.container.querySelector('input[aria-label="הודעה למורה"]') as HTMLInputElement;
    const send = view.container.querySelector('button[aria-label="שליחת ההודעה"]') as HTMLButtonElement;
    const ready = Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === READY_HELP_MESSAGE_HE)!;
    return { box, send, ready };
  }

  it('the failure sends nothing and locks the box and its button; the ready messages still go', () => {
    const { box, send, ready } = open();
    pii.broken = true;
    fireEvent.change(box, { target: { value: 'אפשר עזרה בתרגיל 3' } });
    fireEvent.click(send);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(box.disabled).toBe(true);
    expect(send.disabled).toBe(true);

    fireEvent.click(ready);
    expect(sendMessage, 'a ready message carries no typed text').toHaveBeenCalledTimes(1);
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

  it('the lock lifts once the filter answers again, and the message can be sent', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { box, send } = open();
    pii.broken = true;
    fireEvent.change(box, { target: { value: 'אפשר עזרה בתרגיל 3' } });
    fireEvent.click(send);
    expect(box.disabled).toBe(true);

    act(() => { vi.advanceTimersByTime(PII_FILTER_RECHECK_MS); });
    expect(box.disabled, 'still down: still locked').toBe(true);

    pii.broken = false;
    act(() => { vi.advanceTimersByTime(PII_FILTER_RECHECK_MS); });
    expect(box.disabled).toBe(false);
    expect(box.value, 'what the child typed is still there').toBe('אפשר עזרה בתרגיל 3');
    fireEvent.click(send);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
