/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

/**
 * The admin's chat (owner, 11.10.2026): the same live client scan as the teacher's chat — the send button is
 * blocked and a gentle notice shows while the box holds a forbidden pattern (PRD Module 22 §ב.1) — and the
 * same offline queue (Module 22 §ה). The notice does not promise names: the scan does not detect them.
 */
vi.mock('@/infrastructure/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => {}),
}));
const h = vi.hoisted(() => ({
  sent: [] as unknown[],
  fail: null as null | { code: string },
  queued: [] as Array<{ name: string; payload: Record<string, unknown>; key: string }>,
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => async (data: unknown) => {
    if (h.fail) throw h.fail;
    h.sent.push(data);
    return { data: { ok: true } };
  }),
}));
vi.mock('@/infrastructure/services/IndexedDBQueue', () => ({
  indexedDBQueue: {
    enqueueCallable: vi.fn(async (name: string, payload: Record<string, unknown>, key: string) => { h.queued.push({ name, payload, key }); }),
  },
}));
vi.mock('@/application/useAdminStore', () => ({
  useAdminStore: () => ({ teachers: [{ id: 'teacher_a', ssoEmail: 'teacher.a@example.org', schoolId: 'school_1' }], schools: [] }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { AdminChatView } from '../AdminChatView';

const setOnline = (online: boolean) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
const box = () => screen.getByPlaceholderText('הקלדת הודעה (ללא פרטים מזהים)...') as HTMLInputElement;
const send = () => screen.getByRole('button', { name: 'שלח' }) as HTMLButtonElement;

beforeEach(() => {
  h.sent = []; h.fail = null; h.queued = [];
  Object.values(toast).forEach((f) => f.mockClear());
  setOnline(true);
  render(<AdminChatView />);
  fireEvent.click(screen.getByRole('button', { name: /teacher\.a@example\.org/ }));
});
afterEach(() => { cleanup(); setOnline(true); });

describe('the admin chat: the live scan', () => {
  it('a forbidden pattern blocks the send button and shows a gentle notice under the box; it does not mention names', () => {
    fireEvent.change(box(), { target: { value: 'כתבו לי ל-dana@example.com' } });
    const notice = screen.getByTestId('admin-chat-pii-notice');
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).not.toContain('שמות');
    expect(box().getAttribute('aria-invalid')).toBe('true');
    expect(box().getAttribute('aria-describedby')).toBe(notice.id);
    expect(send().disabled).toBe(true);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(h.sent).toEqual([]);

    fireEvent.change(box(), { target: { value: 'תלמיד 3 צריך עזרה בחיסור' } });
    expect(screen.queryByTestId('admin-chat-pii-notice')).toBeNull();
    expect(send().disabled).toBe(false);
  });

  it('a clean message is sent through the function, with an id the server keeps; the toast says "פרטים מזהים"', async () => {
    fireEvent.change(box(), { target: { value: 'נפגשים מחר' } });
    await act(async () => { fireEvent.click(send()); });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ receiver_id: 'teacher_a', message_body: 'נפגשים מחר', school_id: 'school_1' });
    expect(String((h.sent[0] as { client_message_id: string }).client_message_id)).toMatch(/^adm_[A-Za-z0-9_]{8,64}$/);
    expect(toast.success).toHaveBeenCalledWith('ההודעה נשלחה אחרי בדיקת פרטים מזהים.');
    expect(box().value).toBe('');
  });
});

describe('the admin chat: the offline queue, as the teacher\'s', () => {
  it('no network: the message is queued for the same function and sent when the connection returns', async () => {
    setOnline(false);
    fireEvent.change(box(), { target: { value: 'נפגשים מחר' } });
    await act(async () => { fireEvent.click(send()); });
    expect(h.sent).toEqual([]);
    expect(h.queued).toHaveLength(1);
    expect(h.queued[0].name).toBe('sendTeacherAdminMessage');
    expect(h.queued[0].payload).toMatchObject({ receiver_id: 'teacher_a', message_body: 'נפגשים מחר' });
    expect(h.queued[0].key).toBe(h.queued[0].payload.client_message_id);
    expect(toast.info).toHaveBeenCalled();
    expect(box().value).toBe('');
  });

  it('a transient server error queues it too; any other error says so and keeps the text', async () => {
    h.fail = { code: 'functions/unavailable' };
    fireEvent.change(box(), { target: { value: 'נפגשים מחר' } });
    await act(async () => { fireEvent.click(send()); });
    expect(h.queued).toHaveLength(1);

    h.fail = { code: 'functions/permission-denied' };
    fireEvent.change(box(), { target: { value: 'עוד הודעה' } });
    await act(async () => { fireEvent.click(send()); });
    expect(h.queued).toHaveLength(1);
    expect(toast.error).toHaveBeenCalled();
    expect(box().value).toBe('עוד הודעה');
  });
});
