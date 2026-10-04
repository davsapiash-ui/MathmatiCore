/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Owner decisions of 4.10.2026 (student-journey audit, group G6):
 *  1. A3-106 — meeting 2 closed before the child finished: the teacher sets a time to go on.
 *  2. A7-002 — the chat opened over the coaching card: the card folds into a tab and comes back as it was.
 *  3. A1-059 — the teacher closed the chat: one sentence, "הצ'אט לא פתוח כרגע", on hover, focus and tap.
 *  4. A5-F03 / A4-F07 — two conversions end in the plural of מסמך 03.
 */

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  const noop = async () => undefined;
  return {
    ...actual,
    ref: vi.fn((_db: unknown, path = '') => ({ _path: path })),
    set: vi.fn(noop),
    update: vi.fn(noop),
    remove: vi.fn(noop),
    get: vi.fn(async () => ({ exists: () => false, val: () => null })),
    push: vi.fn(() => ({ key: 'k', _path: 'k' })),
    onValue: vi.fn(() => () => undefined),
    onDisconnect: vi.fn(() => ({ set: noop, cancel: noop })),
    runTransaction: vi.fn(noop),
    serverTimestamp: vi.fn(() => 0),
  };
});

const emitted = vi.hoisted(() => [] as any[]);
vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async (e: any) => { emitted.push(e); }) };
});
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <button type="button" data-testid="speech" data-text={text} />,
}));
vi.mock('@/presentation/components/ui/LogoutButton', () => ({ LogoutButton: () => <button type="button">יציאה</button> }));

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useChatStore } from '@/application/useChatStore';
import { useStudentChatOpen } from '@/application/useStudentChatOpen';
import { useTeacherGenderStore } from '@/application/useTeacherGender';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { SocraticSidePanel, CARD_TAB_HE, CARD_TAB_LABEL_HE } from '@/features/workspace/overlays/HelpOverlays';
import { WorkspaceTopbar, CHAT_CLOSED_HE } from '@/features/workspace/WorkspaceTopbar';
import { SessionClosedOverlay } from '@/presentation/components/student/SessionClosedOverlay';
import { isMeeting2CloseUnfinished, Q_NOT_ANSWERED_TAG } from '@/core/meeting2CloseNotice';
import { TEACHER_SENTENCES_HE } from '@/core/teacherGender';
import { getHardcodedCatalogBanks } from '@/data/sessionTasks';
import { afterConversionsHe } from '@/data/taskBuilders';
import { conversionNounHe, noBoardColumnCard } from '@/infrastructure/services/staticSocraticCards';

const ws = () => useWorkspaceStore.getState();
const speechTexts = () => screen.queryAllByTestId('speech').map((b) => b.getAttribute('data-text'));
const allTasks = () => getHardcodedCatalogBanks().flatMap((b: any) => b.tasks ?? []);
const byId = (id: string) => allTasks().find((t: any) => t.id === id);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('1 — A3-106: meeting 2 closed before the child finished', () => {
  beforeEach(() => useTeacherGenderStore.setState({ gender: 'female' }));

  it('the sentence, in both genders', () => {
    expect(TEACHER_SENTENCES_HE.closedBodyMeeting2Unfinished.female).toBe('העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו.');
    expect(TEACHER_SENTENCES_HE.closedBodyMeeting2Unfinished.male).toBe('העבודה שלכם נשמרה בבטחה. המורה יקבע איתכם מתי תמשיכו.');
  });

  it('the screen and its read-aloud say it; the generic close stays as it was', () => {
    render(<SessionClosedOverlay meeting2Unfinished />);
    expect(screen.getByText('העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו.')).toBeTruthy();
    expect(speechTexts()).toEqual(['המורה סגרה את התחנה. העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו.']);
    act(() => useTeacherGenderStore.setState({ gender: 'male' }));
    expect(speechTexts()).toEqual(['המורה סגר את התחנה. העבודה שלכם נשמרה בבטחה. המורה יקבע איתכם מתי תמשיכו.']);
    cleanup();
    act(() => useTeacherGenderStore.setState({ gender: 'female' }));
    render(<SessionClosedOverlay />);
    expect(speechTexts()).toEqual(['המורה סגרה את התחנה. העבודה שלכם נשמרה בבטחה. כשהמורה תפתח תחנה חדשה, הפעילות תתחדש כאן מיד.']);
  });

  const base = { meeting: 2, isTeacherOrAdmin: false, isGateApproved: false, workspaceOnMeeting2: true, flowStatus: 'task', record: null };
  it('only meeting 2, only a learner, only before the gate approves', () => {
    expect(isMeeting2CloseUnfinished(base)).toBe(true);
    for (const meeting of [1, 3, 4, 5, 6, 7, 8]) expect(isMeeting2CloseUnfinished({ ...base, meeting })).toBe(false);
    expect(isMeeting2CloseUnfinished({ ...base, isTeacherOrAdmin: true })).toBe(false);
    expect(isMeeting2CloseUnfinished({ ...base, isGateApproved: true })).toBe(false);
  });

  it('the workspace on this device decides: its end screen is "finished"', () => {
    expect(isMeeting2CloseUnfinished({ ...base, flowStatus: 'sessionDone' })).toBe(false);
    // The server's close completes the unfinished learner, but this device still holds the task.
    expect(isMeeting2CloseUnfinished({ ...base, record: { completedMeeting2: true, qMatrixResults: { task7_subtraction_zero_tens: Q_NOT_ANSWERED_TAG } } })).toBe(true);
  });

  it('without the workspace, the record decides: completed by the close leaves "not_answered" behind', () => {
    const away = { ...base, workspaceOnMeeting2: false, flowStatus: null };
    expect(isMeeting2CloseUnfinished({ ...away, record: { completedMeeting2: true, qMatrixResults: { task1_read_write_zero: 'success', task7_subtraction_zero_tens: 'not_answered' } } })).toBe(true);
    expect(isMeeting2CloseUnfinished({ ...away, record: { completedMeeting2: true, qMatrixResults: { task1_read_write_zero: 'success', task7_subtraction_zero_tens: 'fail' } } })).toBe(false);
    // Closed by time: nothing completed.
    expect(isMeeting2CloseUnfinished({ ...away, record: { completedMeeting2: false } })).toBe(true);
  });
});

describe('2 — A7-002: the chat opened over the coaching card', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    emitted.length = 0;
    ws().resetWorkspace();
    useStudentChatOpen.setState({ open: false });
    useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
    ws().initSession(1, false, 2);
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('folds into a tab, keeps its choice, hint and lock, writes nothing, and comes back as it was', async () => {
    const { container } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const wrong = ws().aiSocraticHint!.choices.find((c) => !c.isCorrect)!;
    fireEvent.click(screen.getByText(wrong.textHe));
    expect(ws().isSocraticCardLocked).toBe(true);
    const lockUntil = ws().socraticPenaltyLockoutUntil;
    const eventsBefore = emitted.length;
    const historyBefore = ws().socraticCardHistory.cards.length;

    act(() => useStudentChatOpen.setState({ open: true }));
    const aside = container.querySelector('[data-testid="socratic-card"]')!;
    expect(aside.getAttribute('data-folded')).toBe('true');
    expect(aside.className).toContain('invisible');
    expect(aside.hasAttribute('inert')).toBe(true);
    const tab = screen.getByTestId('socratic-card-tab');
    expect(tab.textContent).toContain(CARD_TAB_HE);
    expect(tab.getAttribute('aria-label')).toBe(CARD_TAB_LABEL_HE);
    // Escape belongs to the chat while the card is folded: the card stays.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ws().helpState).toBe('socratic');

    // The lock runs on while folded.
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(ws().socraticPenaltyLockoutUntil).toBe(lockUntil);
    expect(ws().helpState).toBe('socratic');
    expect(emitted.length).toBe(eventsBefore);
    expect(ws().socraticCardHistory.cards.length).toBe(historyBefore);

    // The tab closes the chat; the card is back with the same choice and hint.
    fireEvent.click(tab);
    expect(useStudentChatOpen.getState().open).toBe(false);
    expect(screen.queryByTestId('socratic-card-tab')).toBeNull();
    expect(aside.getAttribute('data-folded')).toBeNull();
    expect(aside.hasAttribute('inert')).toBe(false);
    expect(screen.getByText(wrong.textHe).closest('button')!.className).toContain('border-rose-500');
    expect(screen.getByTestId('socratic-lock-indicator')).toBeTruthy();
    expect(emitted.length).toBe(eventsBefore);
  });

  it('a card that settles while folded is recorded as shown only once it is seen', async () => {
    render(React.createElement(SocraticSidePanel, null));
    act(() => useStudentChatOpen.setState({ open: true }));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(emitted.filter((e) => e.event_type === 'SOCRATIC_CARD_SHOWN')).toHaveLength(0);
    act(() => useStudentChatOpen.setState({ open: false }));
    expect(emitted.filter((e) => e.event_type === 'SOCRATIC_CARD_SHOWN')).toHaveLength(1);
  });

  it('no card, no tab', () => {
    render(React.createElement(SocraticSidePanel, null));
    act(() => useStudentChatOpen.setState({ open: true }));
    expect(screen.queryByTestId('socratic-card-tab')).toBeNull();
  });
});

describe('3 — A1-059: the teacher closed the chat', () => {
  beforeEach(() => {
    ws().resetWorkspace();
    ws().initSession(3, false, 0);
  });
  afterEach(() => useChatStore.setState({ globalChatEnabled: true } as any));

  const topbar = () => render(<MemoryRouter><WorkspaceTopbar /></MemoryRouter>);
  const chatButton = (c: HTMLElement) => c.querySelector('#chat-toggle-button') as HTMLButtonElement;

  it('one sentence: the name, and the tooltip on hover, focus and tap; the chat does not open', () => {
    vi.useFakeTimers();
    useChatStore.setState({ globalChatEnabled: false } as any);
    const { container } = topbar();
    const b = chatButton(container);
    expect(CHAT_CLOSED_HE).toBe("הצ'אט לא פתוח כרגע");
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.hasAttribute('disabled')).toBe(false);
    expect(b.getAttribute('aria-label')).toBe(CHAT_CLOSED_HE);
    expect(b.hasAttribute('title')).toBe(false);
    const tip = screen.getByTestId('chat-closed-tooltip');
    expect(tip.textContent).toBe(CHAT_CLOSED_HE);
    expect(tip.className).toContain('group-hover:opacity-100');
    expect(tip.className).toContain('group-focus-within:opacity-100');
    expect(tip.className).toContain('opacity-0');

    const toggled = vi.fn();
    document.addEventListener('toggle-chat', toggled);
    fireEvent.click(b);
    expect(toggled).not.toHaveBeenCalled();
    expect(screen.getByTestId('chat-closed-tooltip').className).toContain('opacity-100');
    act(() => { vi.advanceTimersByTime(4_100); });
    expect(screen.getByTestId('chat-closed-tooltip').className).not.toMatch(/(^| )opacity-100/);
    document.removeEventListener('toggle-chat', toggled);
  });

  it('open: no tooltip, and the button opens the chat', () => {
    useChatStore.setState({ globalChatEnabled: true } as any);
    const { container } = topbar();
    expect(screen.queryByTestId('chat-closed-tooltip')).toBeNull();
    const toggled = vi.fn();
    document.addEventListener('toggle-chat', toggled);
    fireEvent.click(chatButton(container));
    expect(toggled).toHaveBeenCalledTimes(1);
    document.removeEventListener('toggle-chat', toggled);
  });
});

describe('4 — A5-F03 / A4-F07: two conversions, the plural of מסמך 03', () => {
  it('5,230 and 2,500 close in the plural; one conversion stays singular', () => {
    expect(byId('s3_g_t4').instructionHe).toBe('בנו בבית המספרים 5 לבני אלף, 2 לבני מאה ו-3 לבני עשרת. פרטו לבנת אלף אחת לעשר לבני מאה. אחר כך פרטו לבנת מאה אחת לעשר לבני עשרת. איזה מספר מייצגות הלבנים לאחר שתי הפריטות? כתבו אותו בשורת התוצאה.');
    expect(byId('s7_g_t1').instructionHe).toBe('בנו בבית המספרים 25 לבני מאה. קבצו 10 לבני מאה ללבנת אלף אחת. קבצו שוב 10 לבני מאה ללבנת אלף אחת. איזה מספר מייצגות הלבנים לאחר שתי ההקבצות? כתבו אותו בשורת התוצאה.');
    for (const id of ['s3_r_t2', 's3_r_t4', 's3_r_t6', 's3_g_t2', 's3_g_t6']) expect(byId(id).instructionHe, id).toContain('לאחר הפריטה?');
    for (const id of ['s7_r_t1']) expect(byId(id).instructionHe, id).toContain('לאחר ההקבצה?');
    expect(afterConversionsHe(1, 'הפריטה', 'הפריטות')).toBe('הפריטה');
    expect(afterConversionsHe(2, 'ההקבצה', 'ההקבצות')).toBe('שתי ההקבצות');
  });

  it('400 − 156 is left as it is: stations 5–6 never say in advance how many breaks (owner, 30.9.2026) — for the owner', () => {
    expect(byId('s6_r_t7').instructionHe).toBe('בתרגיל 400 − 156 חסרה ספרת העשרות בשורת התוצאה. בצעו את הפריטה בלבנים כדי לגלות אותה, וכתבו אותה בתיבה הריקה.');
  });

  it('the cards name the conversions as the instruction does', () => {
    expect(conversionNounHe(true, byId('s3_g_t4'))).toBe('הפריטות');
    expect(conversionNounHe(true, byId('s3_r_t2'))).toBe('הפריטה');
    expect(conversionNounHe(false, byId('s7_g_t1'))).toBe('ההקבצות');
    expect(conversionNounHe(false, byId('s7_r_t1'))).toBe('ההקבצה');
  });

  it('no child text with two conversions says the singular', () => {
    for (const t of allTasks()) {
      const text: string = t.instructionHe ?? '';
      const breaks = text.split(/[^א-ת]+/).filter((w) => w === 'פרטו').length;
      const groups = text.split(/[^א-ת]+/).filter((w) => w === 'קבצו').length;
      if (breaks > 1) expect(text, t.id).not.toContain('לאחר הפריטה?');
      if (groups > 1) expect(text, t.id).not.toContain('לאחר ההקבצה?');
    }
  });

  it('meeting 8: the circle over a column that took and gave a block records two breaks', () => {
    const card = (a: number, b: number, circles: Record<string, string>, focus: string) =>
      noBoardColumnCard({ numberA: a, numberB: b, isSubtraction: true }, { memoryCircles: circles, focusColumn: focus } as any)!.questionHe;
    // 532 − 167: the units take one break (12); the tens take one and give one (12).
    const circles = { units: '12', tens: '12', hundreds: '4' };
    expect(card(532, 167, circles, 'units')).toBe('נסו לחשוב: בתרגיל 532 − 167, כבר רשמתם את הפריטה בעיגולי הזיכרון. ממה מחסרים עכשיו בטור היחידות?');
    expect(card(532, 167, circles, 'tens')).toBe('נסו לחשוב: בתרגיל 532 − 167, כבר רשמתם את הפריטות בעיגולי הזיכרון. ממה מחסרים עכשיו בטור העשרות?');
    // 4,000 − 1,562 at the units: one break into the column, as the AI prompt's example says.
    expect(card(4000, 1562, { units: '10', tens: '9', hundreds: '9', thousands: '3' }, 'units')).toContain('כבר רשמתם את הפריטה בעיגולי הזיכרון');
  });
});
