/**
 * @vitest-environment jsdom
 *
 * Owner question Q16 (audit chat-17, 4.10.2026). The floating chat had a trash
 * icon, added by an agent on 31.8 with no owner decision, that deleted the
 * whole conversation with a learner for good: no backup, no audit entry. PRD
 * 23א §א: "מניעה מוחלטת של מחיקה בלתי הפיכה של נתוני הפיילוט". Chat history
 * goes only with a reset, after its backup (23א §ג).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

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
  remove: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue({ exists: () => false, val: () => null }),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
  orderByChild: vi.fn((k) => k),
}));
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { FloatingChatPanel } from '../FloatingChatPanel';
import { useChatStore } from '@/application/useChatStore';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Q16 — the floating chat cannot delete a conversation', () => {
  it('the header has only minimise and close; no delete control and no delete call', () => {
    const clearStudentMessages = vi.fn();
    useChatStore.setState({ messages: [], initSync: () => {}, markAsRead: () => {}, clearStudentMessages, sendMessage: vi.fn() } as never);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FloatingChatPanel student={{ studentId: 'student_user4', name: 'תלמיד 4' } as never} onClose={vi.fn()} teacherId="teacher" />);

    expect(screen.queryByTitle('נקו את היסטוריית השיחה')).toBeNull();
    const header = screen.getByText('תלמיד 4').closest('div.h-12')!;
    const titles = Array.from(header.querySelectorAll('button')).map((b) => b.getAttribute('title'));
    expect(titles).toEqual(['מזערו', 'סגרו']);
    for (const b of Array.from(header.querySelectorAll('button'))) b.click();
    expect(confirm).not.toHaveBeenCalled();
    expect(clearStudentMessages).not.toHaveBeenCalled();
  });
});
