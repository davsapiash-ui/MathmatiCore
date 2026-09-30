/**
 * @vitest-environment jsdom
 *
 * PRD Module 21 §ב: "ההקלטה מתעדת שינויי DOM ושינויי קנבס בלבד". Invariant 1 and
 * Module 3 §א: Zero-PII. The chat panel renders inside the page the learner's
 * screen recorder watches, so what a child types to the teacher — and every
 * bubble of the conversation — used to reach the recording chunks (RTDB, the
 * teacher's replay, the Drive reset backups), even when the PII filter refused
 * to send the message.
 *
 * This runs the real rrweb `record()` with the live options of
 * StudentWorkspacePage around the real StudentChatOverlay and a math input:
 * the chat must be absent from the events, the math digit present (Module 21:
 * the teacher analyses the steps, "הזנה בעיגולי זיכרון").
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
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

import { record } from 'rrweb';
import { StudentChatOverlay } from '../StudentChatOverlay';
import { useAuthStore } from '@/application/useAuthStore';
import { useChatStore } from '@/application/useChatStore';

// What the child types and what the teacher wrote. Neither may reach the recording.
const TYPED_SECRET = 'אני גר ברחוב הזית 7 והטלפון 0501234567';
const TEACHER_BUBBLE = 'תשובת המורה לילד ששמה נשאר מחוץ להקלטה';
const LATE_BUBBLE = 'הודעה שהגיעה אחרי שההקלטה התחילה';

/** The options StudentWorkspacePage passes to rrweb, verbatim. */
function liveRecordOptions() {
  return {
    sampling: { mousemove: 50, mouseInteraction: true, scroll: 150, input: 'last' as const },
    recordCanvas: true,
    collectFonts: true,
    inlineStylesheet: true,
  };
}

function MathBoard() {
  return (
    <div>
      <input aria-label="ספרת האחדות" inputMode="numeric" defaultValue="" />
    </div>
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

// jsdom has no 2D canvas context and no scrollIntoView. rrweb's canvas recorder
// (recordCanvas: true, as in the live page) patches the 2D prototype, so give it one.
const win = window as unknown as Record<string, unknown>;
if (typeof win.CanvasRenderingContext2D === 'undefined') {
  win.CanvasRenderingContext2D = class CanvasRenderingContext2D {
    fillRect() {}
  };
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('Module 21 §ב — the chat is not in the screen recording', () => {
  let stop: (() => void) | undefined;
  let events: unknown[];

  beforeEach(() => {
    events = [];
    useAuthStore.setState({
      user: { uid: 'student_user3', role: 'student', name: 'תלמיד 3' } as never,
      role: 'student',
      isAuthenticated: true,
      isStudentAuthenticated: true,
    });
    useChatStore.setState({
      messages: [
        { id: 'm1', senderId: '1002220159', receiverId: 'student_user3', text: TEACHER_BUBBLE, timestamp: Date.now(), read: false } as never,
      ],
      initSync: () => {},
      markAsRead: () => {},
      sendMessage: vi.fn(),
    } as never);
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    cleanup();
  });

  it('the StudentWorkspacePage recorder uses rrweb defaults for blocking and does not mask inputs', () => {
    // The recorder StudentWorkspacePage starts (features/workspace/screenRecorder.ts).
    const page = readFileSync(resolve(__dirname, '../../screenRecorder.ts'), 'utf-8');
    const call = page.slice(page.indexOf('stopRecorder = recordFn({'), page.indexOf('flushInterval = setInterval(flush,'));
    expect(call.length).toBeGreaterThan(0);
    expect(call).toContain("input: 'last'");
    expect(call).toContain('recordCanvas: true');
    // A different blockClass would silently stop protecting the chat.
    expect(call).not.toMatch(/blockClass|blockSelector/);
    // Module 21: the teacher replays the digits the child typed.
    expect(call).not.toMatch(/maskAllInputs|maskInputOptions/);
  });

  it('the panel carries the rrweb block class', () => {
    const { container } = render(<StudentChatOverlay />);
    act(() => { document.dispatchEvent(new Event('toggle-chat')); });
    const panel = container.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(panel!.classList.contains('rr-block')).toBe(true);
    // The message list sits inside the blocked panel. The learner has no free
    // text at all (owner, 1.10.2026: a learner never types a name) — only ready
    // messages and the call button.
    expect(panel!.querySelector('input, textarea, [contenteditable]')).toBeNull();
    expect(panel!.textContent).toContain('אפשר עזרה בתרגיל?');
    expect(panel!.textContent).toContain('קראו למורה');
  });

  it('a ready message is sent with one press, as the learner’s own message (owner, 1.10.2026)', () => {
    const sendMessage = vi.fn();
    useChatStore.setState({ sendMessage } as never);
    const { container } = render(<StudentChatOverlay />);
    act(() => { document.dispatchEvent(new Event('toggle-chat')); });
    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'לא הבנתי את ההוראה')!;
    fireEvent.click(button);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toBe('student_user3');
    expect(sendMessage.mock.calls[0][1]).toBe('תלמיד 3');
    expect(sendMessage.mock.calls[0][3]).toBe('לא הבנתי את ההוראה');
  });

  it('chat text and bubbles are absent from the events; a math digit is present', async () => {
    const { container } = render(
      <>
        <MathBoard />
        <StudentChatOverlay />
      </>
    );
    // The chat is open when the recording starts: the full snapshot sees it.
    act(() => { document.dispatchEvent(new Event('toggle-chat')); });

    stop = record({ emit: (e) => { events.push(e); }, ...liveRecordOptions() }) as () => void;
    await flush();

    // A new message arrives while recording (a DOM mutation inside the panel).
    act(() => {
      useChatStore.setState((s) => ({
        messages: [
          ...s.messages,
          { id: 'm2', senderId: '1002220159', receiverId: 'student_user3', text: LATE_BUBBLE, timestamp: Date.now(), read: false } as never,
        ],
      }));
    });
    await flush();

    // The child writes a digit on the board.
    const digit = container.querySelector('input[aria-label="ספרת האחדות"]') as HTMLInputElement;
    fireEvent.input(digit, { target: { value: '7' } });
    await flush();

    const json = JSON.stringify(events);
    expect(events.length).toBeGreaterThan(1);
    expect(json).not.toContain(TEACHER_BUBBLE);
    expect(json).not.toContain(LATE_BUBBLE);
    expect(json).not.toContain('צ\'אט עם המורה');
    // The board is still recorded: its label and the typed digit.
    expect(json).toContain('ספרת האחדות');
    const inputEvents = (events as Array<{ type: number; data?: { source?: number; text?: string } }>).filter(
      (e) => e.type === 3 && e.data?.source === 5
    );
    expect(inputEvents.some((e) => e.data?.text === '7')).toBe(true);
  });

  it('control: without the block class the same typing would have been recorded', async () => {
    // Proves the assertion above can fail: a plain input in the same page, same options.
    const { container } = render(<input aria-label="לא חסום" defaultValue="" />);
    stop = record({ emit: (e) => { events.push(e); }, ...liveRecordOptions() }) as () => void;
    await flush();
    const plain = container.querySelector('input') as HTMLInputElement;
    fireEvent.input(plain, { target: { value: TYPED_SECRET } });
    await flush();
    expect(JSON.stringify(events)).toContain(TYPED_SECRET);
  });
});
