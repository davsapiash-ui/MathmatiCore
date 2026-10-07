/**
 * @vitest-environment jsdom
 *
 * Owner, 1.10.2026: the teacher receives the message the learner pressed, with
 * the exercise the learner is on ("אפשר עזרה בתרגיל? (תרגיל 3 מתוך 7)"), and
 * the research data records the exercise of every request for help from the chat.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';

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

import { StudentChatOverlay, withExerciseHe, READY_HELP_MESSAGE_HE, CALL_TEACHER_MESSAGE_HE } from '../StudentChatOverlay';
import { useAuthStore } from '@/application/useAuthStore';
import { useChatStore } from '@/application/useChatStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { currentTaskLabelHe } from '@/application/taskLabel';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

describe('chat help messages name the exercise (owner, 1.10.2026)', () => {
  let sendMessage: ReturnType<typeof vi.fn>;
  let logChatHelpRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({
      user: { uid: 'student_user3', role: 'student', name: 'תלמיד 3' } as never,
      role: 'student',
      isAuthenticated: true,
      isStudentAuthenticated: true,
    });
    sendMessage = vi.fn();
    useChatStore.setState({ messages: [], initSync: () => {}, markAsRead: () => {}, sendMessage } as never);
    logChatHelpRequest = vi.fn();
    useWorkspaceStore.setState({ sessionNumber: 4, activeBankPath: 'green_path', dynamicTasks: null, standardTaskIdx: 2, logChatHelpRequest } as never);
  });
  afterEach(() => cleanup());

  const open = () => {
    const view = render(<StudentChatOverlay />);
    act(() => { document.dispatchEvent(new Event('toggle-chat')); });
    return view;
  };
  const button = (c: HTMLElement, text: string) =>
    Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;

  it('the label is the heading the learner reads', () => {
    expect(currentTaskLabelHe(useWorkspaceStore.getState())).toMatch(/^תרגיל 3 מתוך \d+$/);
    expect(withExerciseHe('א', null)).toBe('א');
  });

  it('"אפשר עזרה בתרגיל?" sends exactly what the button says, with the exercise, and is recorded', () => {
    const { container } = open();
    fireEvent.click(button(container, READY_HELP_MESSAGE_HE));
    const label = currentTaskLabelHe(useWorkspaceStore.getState());
    expect(sendMessage.mock.calls[0][3]).toBe(`${READY_HELP_MESSAGE_HE} (${label})`);
    expect(logChatHelpRequest).toHaveBeenCalledWith('ready_message');
  });

  it('"לא הבנתי את ההוראה" is sent as it is and is not a help request', () => {
    const { container } = open();
    fireEvent.click(button(container, 'לא הבנתי את ההוראה'));
    expect(sendMessage.mock.calls[0][3]).toBe('לא הבנתי את ההוראה');
    expect(logChatHelpRequest).not.toHaveBeenCalled();
  });

  it('"קראו למורה" sends the call with the exercise and is recorded', () => {
    const { container } = open();
    fireEvent.click(button(container, 'קראו למורה'));
    const label = currentTaskLabelHe(useWorkspaceStore.getState());
    expect(sendMessage.mock.calls[0][3]).toBe(`${CALL_TEACHER_MESSAGE_HE} (${label})`);
    expect(logChatHelpRequest).toHaveBeenCalledWith('call');
  });
});
