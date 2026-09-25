import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { useWorkspaceStore, getActiveTasks, selectCanProceed } from '@/application/useWorkspaceStore';
import { EMPTY_COUNTS, MAX_VISIBLE_BLOCKS } from '@/core/placeValue';
import { useAuthStore } from '@/application/useAuthStore';

/**
 * The owner walked meeting 1 on the live site (24.9.2026) and four audits
 * followed. Each fix here has its source in the current documents; nothing
 * from an older PRD was restored.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8').replace(/\r\n/g, '\n');
const signIn = () => useAuthStore.setState({ user: { uid: 'student_user5', name: 'user5' } as any, role: 'student', isAuthenticated: true });
const ws = () => useWorkspaceStore.getState();

describe('the meeting ends even if the help button is pressed during the celebration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signIn(); // the help button does nothing for a learner who is not signed in
    ws().resetWorkspace();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('PRD Module 14: nothing strands the learner — "התקדם" then help within 2.5 s still reaches the end screen', () => {
    ws().initSession(1, false, 8); // the last exercise, 806 − 351
    const s0 = ws();
    expect(getActiveTasks(s0)[s0.standardTaskIdx].id).toBe('s1_r_sub806');
    useWorkspaceStore.setState({
      counts: { ...EMPTY_COUNTS, hundreds: 4, tens: 5, units: 5 },
      hasUngrouped: true,
      answerDigits: { hundreds: '4', tens: '5', units: '5' },
    });
    ws().proceed();
    expect(ws().awaitingNext).toBe(true);
    vi.advanceTimersByTime(800);
    ws().requestSilentHelp(); // its own toast replaces the celebration
    expect(ws().feedback?.title).toContain('המורה יודעת');
    vi.advanceTimersByTime(5_000);
    expect(ws().flowStatus).toBe('sessionDone');
    expect(ws().awaitingNext).toBe(false);
  });

  it('the help button’s acknowledgement is neutral — no confetti (מסמך 03 §3.1: ללא תשומת לב חברתית)', () => {
    ws().initSession(1, false, 0);
    ws().requestSilentHelp();
    expect(ws().feedback?.neutral).toBe(true);
  });
});

describe('a coaching card belongs to the exercise that opened it', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ws().resetWorkspace();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('the next exercise opens with no card and no hint', () => {
    ws().initSession(1, false, 5); // 26 cubes
    ws().setKeyboardSocratic(); // the 45-second card
    expect(ws().helpState).toBe('socratic');
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, tens: 2, units: 6 }, hasGrouped: true, answerDigits: { tens: '2', units: '6' } });
    ws().proceed();
    vi.advanceTimersByTime(5_000);
    const s = ws();
    expect(getActiveTasks(s)[s.standardTaskIdx].id).toBe('s1_t8');
    expect(s.helpState).toBe('closed');
    expect(s.aiSocraticHint).toBeNull();
  });

  it('an AI answer that arrives after the card closed, or after the exercise changed, is dropped', () => {
    const engine = src('application/useWorkspaceStore.ts');
    expect(engine).toContain("const stillTheSameCard = now.helpState === 'socratic' && selectStandardTask(now)?.id === currentTask?.id;");
    expect(engine).toContain('if (!stillTheSameCard) return;');
  });

  it('four presses of "התקדם" on an empty answer open no card (register 17: an empty answer is not a wrong answer)', () => {
    ws().initSession(1, false, 6); // 713 + 94
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, hundreds: 8, units: 7 }, hasGrouped: true });
    for (let i = 0; i < 5; i++) {
      ws().proceed();
      vi.advanceTimersByTime(4_000);
    }
    expect(ws().helpState).toBe('closed');
    expect(ws().consecutiveErrorCount).toBe(0);
  });

  it('the pause that opens the 45-second card is counted per exercise (PRD Module 12 §ב)', () => {
    const radar = src('application/useCognitiveHesitationRadar.ts');
    expect(radar).toContain('`${s.sessionNumber}:${s.standardTaskIdx}|${JSON.stringify(s.counts)}|');
  });
});

describe('the second wrong answer opens the card in meeting 1 too (מסמך 03 §3.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ws().resetWorkspace();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('713 + 94 with a wrong board twice: the friction beat, then the card', () => {
    ws().initSession(1, false, 6);
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, hundreds: 7, tens: 1, units: 3 }, answerDigits: { hundreds: '8', tens: '0', units: '7' } });
    ws().proceed();
    expect(ws().helpState).toBe('closed');
    vi.advanceTimersByTime(4_000);
    ws().proceed();
    expect(ws().helpState).toBe('friction');
  });
});

describe('meeting 1 writes no Q-matrix result (PRD Module 14 §ב: not scored)', () => {
  it('both the success and the failure path skip meeting 1', () => {
    const store = src('application/useWorkspaceStore.ts');
    expect(store).toContain("if (studentId && !task.isOptionalChoiceTask && s.sessionNumber !== 1) {");
    expect(store).toContain("if (s.sessionNumber !== 1) {\n          const qKey = (task as any).qMatrixKey || (task as any).targetNode || task.id;\n          const qUpdate = { [qKey]: detail };");
  });
});

describe('"התקדם" and the blocks a task puts on the board', () => {
  beforeEach(() => ws().resetWorkspace());

  it('the 26 cubes do not light "התקדם"; an answer does', () => {
    ws().initSession(1, false, 5);
    expect(ws().counts.units).toBe(26);
    expect(selectCanProceed(ws())).toBe(false);
    ws().groupColumnClick('units');
    ws().groupColumnClick('units');
    expect(selectCanProceed(ws())).toBe(false);
    ws().setAnswerDigit('tens', '2');
    ws().setAnswerDigit('units', '6');
    expect(selectCanProceed(ws())).toBe(true);
  });
});

describe('the sync does not write what did not change, and does not loop', () => {
  it('setSupersededByOtherDevice with the same value does not notify the store', () => {
    ws().resetWorkspace();
    let notified = 0;
    const unsub = useWorkspaceStore.subscribe(() => { notified += 1; });
    ws().setSupersededByOtherDevice(false);
    ws().setSupersededByOtherDevice(false);
    expect(notified).toBe(0);
    ws().setSupersededByOtherDevice(true);
    expect(notified).toBe(1);
    ws().setSupersededByOtherDevice(false);
    unsub();
  });

  it('identical payloads are sent once, and database writes are coalesced into one window', () => {
    const sync = src('infrastructure/services/FirebaseSyncService.ts');
    expect(sync).toContain('if (payloadKey === this.lastSyncedPayloadKey) return;');
    expect(sync).toContain('this.pendingRemoteSync = () => {');
    expect(sync).toContain('this.scheduleRemoteSync();');
    expect(sync).toContain("window.addEventListener('pagehide', this.flushRemoteSyncOnPageHide);");
    // the local save stays immediate, before the coalesced remote writes
    expect(sync.indexOf('this.saveSessionProgressLocally(normId, sanitizedPayload)')).toBeLessThan(sync.indexOf('this.pendingRemoteSync = () => {'));
    // and the hidden operand digits are part of the snapshot now
    expect(sync).toContain('operandDigits: state.operandDigits,');
  });
});

describe('the board holds what מסמך 03 §3.3 asks for', () => {
  it('45 blocks in one column fit', () => {
    expect(MAX_VISIBLE_BLOCKS).toBeGreaterThanOrEqual(45);
  });
});

describe('no wording from the old meeting 1, and the documents’ names for things', () => {
  it('no "מעבדה", "תיבת המענה", "שאריות", "לחצו להסרה" reaches the child', () => {
    for (const f of [
      'application/useWorkspaceStore.ts',
      'data/sessionTasks.ts',
      'core/session1Checklist.ts',
      'features/workspace/tasks/Session1ChecklistCard.tsx',
      'features/workspace/board/DienesBlock.tsx',
      'presentation/pages/StudentHub.tsx',
    ]) {
      const text = src(f);
      expect(text, f).not.toContain('מערכת המעבדה');
      expect(text, f).not.toContain('כלי המעבדה');
      expect(text, f).not.toContain('לחצו להסרה');
      expect(text, f).not.toContain('את השאריות');
      expect(text, f).not.toContain('טרם בוצע');
    }
    const engine = src('infrastructure/services/SocraticEngine.ts');
    expect(engine).not.toContain('פריטה משכן');
    expect(engine).not.toContain('בכל משבצת בבית המספרים');
    expect(engine).not.toContain('בטור היחידות היחידות');
  });

  it('the lobby card of meeting 1 says "ארגז החול" (מסמך 04)', () => {
    expect(src('presentation/pages/StudentHub.tsx')).toContain("title: 'תחנה 1: ארגז החול'");
  });

  it('the checklist has a read-aloud button (PRD Module 24)', () => {
    expect(src('features/workspace/tasks/Session1ChecklistCard.tsx')).toContain('<UdlSpeechButton text={items.map((i) => i.label).join');
  });
});
