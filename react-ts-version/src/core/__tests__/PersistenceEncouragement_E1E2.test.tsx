/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The real button is tested in TTSNarrationButton.test.tsx; here only the text it is given.
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import {
  ENCOURAGEMENT_SENTENCES_HE,
  addPersistenceEvent,
  encouragementKey,
  encouragementSentenceHe,
  hasClosingSentence,
  meetingOfSessionId,
  persistenceEventKind,
  persistenceIndexPercent,
  type PersistenceCounts,
} from '@/core/persistenceEncouragement';
import { ClosingSentence } from '@/features/workspace/ClosingSentence';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';

/**
 * Owner decisions E1 and E2, 27.9.2026 (register, approved deviation 24).
 *
 * E1: the child never sees a number. The persistence index U ÷ (U + E + G) × 100
 * (PRD Module 16 §ב) only CHOOSES one of four sentences, by a rule checked in
 * order: E + G ≤ 2 first; then index ≥ 67; 34–66; below 34.
 * E2: meetings 3–7 end with one of them; meeting 8 shows one on stage 3 of the
 * reflection board; meetings 1 and 2 have none.
 */

const REPO = resolve(__dirname, '../../../..');
const SRC = resolve(__dirname, '../..');
const read = (abs: string) => readFileSync(abs, 'utf-8').replace(/\r\n/g, '\n');

const c = (undos: number, wrongDigits: number, wrongOptions: number): PersistenceCounts => ({ undos, wrongDigits, wrongOptions });

afterEach(cleanup);

describe('E1 — the four sentences, word for word', () => {
  it('exactly the owner’s four sentences', () => {
    expect(ENCOURAGEMENT_SENTENCES_HE).toEqual({
      fewMistakes: 'כל הכבוד! פתרתם את התרגילים בריכוז ובדיוק, כמו מתמטיקאים אמיתיים. המשיכו כך!',
      selfCorrecting: 'כל הכבוד! חקרתם, ניסיתם ותיקנתם בעצמכם טעויות, כמו מתמטיקאים אמיתיים. המשיכו כך!',
      persevering: 'כל הכבוד! התאמצתם ולא ויתרתם. גם מתמטיקאים אמיתיים עוצרים לפעמים, בודקים ומתקנים. המשיכו כך!',
      keepTrying: 'כל הכבוד שהמשכתם עד הסוף! מטעויות לומדים. כשמשהו לא מסתדר, אפשר לעצור רגע, לבדוק ולנסות שוב. אנחנו מאמינים בכם!',
    });
  });

  it('no digit, no percent sign, no score word in any of them', () => {
    for (const s of Object.values(ENCOURAGEMENT_SENTENCES_HE)) {
      expect(s, s).not.toMatch(/[0-9%]/);
      expect(s, s).not.toMatch(/אחוז|ציון|מדד|דירוג|נקוד/);
    }
  });
});

describe('E1 — the rule, in its order', () => {
  it('rule 1 comes first: at most two mistakes is "few mistakes" whatever the index', () => {
    expect(encouragementKey(c(0, 0, 0))).toBe('fewMistakes');
    expect(encouragementKey(c(0, 2, 0))).toBe('fewMistakes'); // index 0
    expect(encouragementKey(c(0, 1, 1))).toBe('fewMistakes'); // index 0
    expect(encouragementKey(c(0, 0, 2))).toBe('fewMistakes');
    expect(encouragementKey(c(9, 2, 0))).toBe('fewMistakes'); // index 82
  });

  it('the boundary between 2 and 3 mistakes', () => {
    expect(encouragementKey(c(0, 2, 0))).toBe('fewMistakes');
    expect(encouragementKey(c(0, 3, 0))).toBe('keepTrying');
    expect(encouragementKey(c(0, 2, 1))).toBe('keepTrying');
    expect(encouragementKey(c(0, 1, 2))).toBe('keepTrying');
  });

  it('the index boundaries 33 / 34 and 66 / 67 (whole percents, rounded as the server rounds)', () => {
    // 67: U = 67, E + G = 33
    expect(persistenceIndexPercent(c(67, 20, 13))).toBe(67);
    expect(encouragementKey(c(67, 20, 13))).toBe('selfCorrecting');
    // 66.67 rounds to 67: U = 6, E + G = 3
    expect(persistenceIndexPercent(c(6, 2, 1))).toBe(67);
    expect(encouragementKey(c(6, 2, 1))).toBe('selfCorrecting');
    // 66: U = 33, E + G = 17
    expect(persistenceIndexPercent(c(33, 10, 7))).toBe(66);
    expect(encouragementKey(c(33, 10, 7))).toBe('persevering');
    // 50
    expect(encouragementKey(c(3, 2, 1))).toBe('persevering');
    // 34: U = 17, E + G = 33
    expect(persistenceIndexPercent(c(17, 30, 3))).toBe(34);
    expect(encouragementKey(c(17, 30, 3))).toBe('persevering');
    // 33: U = 33, E + G = 67
    expect(persistenceIndexPercent(c(33, 60, 7))).toBe(33);
    expect(encouragementKey(c(33, 60, 7))).toBe('keepTrying');
    // 33.33 rounds to 33: U = 3, E + G = 6
    expect(persistenceIndexPercent(c(3, 4, 2))).toBe(33);
    expect(encouragementKey(c(3, 4, 2))).toBe('keepTrying');
    // 0
    expect(encouragementKey(c(0, 5, 5))).toBe('keepTrying');
  });

  it('returns the sentence itself', () => {
    expect(encouragementSentenceHe(c(0, 0, 0))).toBe(ENCOURAGEMENT_SENTENCES_HE.fewMistakes);
    expect(encouragementSentenceHe(c(9, 2, 1))).toBe(ENCOURAGEMENT_SENTENCES_HE.selfCorrecting);
    expect(encouragementSentenceHe(c(3, 2, 1))).toBe(ENCOURAGEMENT_SENTENCES_HE.persevering);
    expect(encouragementSentenceHe(c(1, 4, 2))).toBe(ENCOURAGEMENT_SENTENCES_HE.keepTrying);
  });

  it('the index is the server’s: 100 with nothing to count, rounded otherwise', () => {
    expect(persistenceIndexPercent(c(0, 0, 0))).toBe(100);
    expect(persistenceIndexPercent(c(2, 1, 1))).toBe(50);
    const server = read(resolve(REPO, 'functions/src/meetingMetrics.ts'));
    expect(server).toContain('percent: denominator === 0 ? 100 : Math.round((undos / denominator) * 100),');
  });
});

describe('E1 — counted exactly as the server counts, for this meeting only', () => {
  it('U = UNDO_EXECUTED; E = DIGIT_ENTERED with is_correct false; G = SOCRATIC_OPTION_SELECTED with is_correct false', () => {
    expect(persistenceEventKind({ event_type: 'UNDO_EXECUTED', details: {} })).toBe('undos');
    expect(persistenceEventKind({ event_type: 'DIGIT_ENTERED', details: { is_correct: false } })).toBe('wrongDigits');
    expect(persistenceEventKind({ event_type: 'DIGIT_ENTERED', details: { is_correct: true } })).toBeNull();
    expect(persistenceEventKind({ event_type: 'DIGIT_ENTERED', details: { is_correct: null } })).toBeNull();
    expect(persistenceEventKind({ event_type: 'SOCRATIC_OPTION_SELECTED', details: { is_correct: false } })).toBe('wrongOptions');
    expect(persistenceEventKind({ event_type: 'SOCRATIC_OPTION_SELECTED', details: { is_correct: true } })).toBeNull();
    for (const t of ['DIGIT_DELETED', 'BOARD_CLEARED', 'HESITATION_DETECTED', 'SOCRATIC_CARD_SHOWN', 'PROBLEM_COMPLETE']) {
      expect(persistenceEventKind({ event_type: t, details: { is_correct: false } }), t).toBeNull();
    }
    expect(addPersistenceEvent(c(1, 1, 1), { event_type: 'UNDO_EXECUTED' })).toEqual(c(2, 1, 1));
  });

  it('the server counts the same three things', () => {
    const server = read(resolve(REPO, 'functions/src/meetingMetrics.ts'));
    expect(server).toContain('if (ev?.event_type === "UNDO_EXECUTED") undos++;');
    expect(server).toContain('else if (ev?.event_type === "DIGIT_ENTERED" && ev.details?.is_correct === false) wrongDigits++;');
    expect(server).toContain('else if (ev?.event_type === "SOCRATIC_OPTION_SELECTED" && ev.details?.is_correct === false) wrongOptions++;');
  });

  it('the one telemetry emitter counts every event it sends, after the learner is resolved', () => {
    const sync = read(resolve(SRC, 'infrastructure/services/FirebaseSyncService.ts'));
    const body = sync.slice(sync.indexOf('public async emitTelemetry<'), sync.indexOf('// --- PRD v4 Task 1 Implementation Functions ---'));
    const count = body.indexOf('useWorkspaceStore.getState().recordPersistenceEvent(payload);');
    expect(count).toBeGreaterThan(body.indexOf('if (numStudentId === null)'));
    expect(count).toBeLessThan(body.indexOf('await indexedDBQueue.enqueue(payload)'));
  });

  it('"session_4_student_7" belongs to meeting 4', () => {
    expect(meetingOfSessionId('session_4_student_7')).toBe(4);
    expect(meetingOfSessionId('session_04_student_7')).toBe(4);
    expect(meetingOfSessionId('x')).toBeNull();
  });
});

describe('E1 — the store keeps this meeting’s counts', () => {
  const STUDENT = 'student_user5';
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: STUDENT, name: 'user5' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: { [STUDENT]: { pedagogicalPath: 'green_path' } } as any });
    useWorkspaceStore.getState().resetWorkspace();
  });
  const record = (meeting: number, event_type: string, details: Record<string, unknown> = {}) =>
    useWorkspaceStore.getState().recordPersistenceEvent({ session_id: `session_${meeting}_student_5`, event_type, details });

  it('a meeting starts from zero, and counts only its own events', () => {
    useWorkspaceStore.getState().initSession(4, false);
    expect(useWorkspaceStore.getState().meetingPersistence).toEqual({ sessionNumber: 4, undos: 0, wrongDigits: 0, wrongOptions: 0 });
    record(4, 'UNDO_EXECUTED');
    record(4, 'DIGIT_ENTERED', { is_correct: false });
    record(4, 'DIGIT_ENTERED', { is_correct: true });
    record(4, 'SOCRATIC_OPTION_SELECTED', { is_correct: false });
    record(3, 'UNDO_EXECUTED'); // another meeting's event
    expect(useWorkspaceStore.getState().meetingPersistence).toEqual({ sessionNumber: 4, undos: 1, wrongDigits: 1, wrongOptions: 1 });

    useWorkspaceStore.getState().initSession(5, false);
    expect(useWorkspaceStore.getState().meetingPersistence).toEqual({ sessionNumber: 5, undos: 0, wrongDigits: 0, wrongOptions: 0 });
  });

  it('a reload keeps them — for the same meeting only', () => {
    const saved = { sessionNumber: 6, flowStatus: 'task', standardTaskIdx: 3, meetingPersistence: { sessionNumber: 6, undos: 4, wrongDigits: 2, wrongOptions: 1 } };
    useWorkspaceStore.getState().restoreSession(saved);
    expect(useWorkspaceStore.getState().meetingPersistence).toEqual({ sessionNumber: 6, undos: 4, wrongDigits: 2, wrongOptions: 1 });
    useWorkspaceStore.getState().restoreSession({ ...saved, sessionNumber: 7 });
    expect(useWorkspaceStore.getState().meetingPersistence).toEqual({ sessionNumber: 7, undos: 0, wrongDigits: 0, wrongOptions: 0 });
  });

  it('they travel with the saved workspace state, so a reload has them', () => {
    const sync = read(resolve(SRC, 'infrastructure/services/FirebaseSyncService.ts'));
    const snapshot = sync.slice(sync.indexOf('private getSyncableWorkspaceState()'), sync.indexOf('private stopSync()'));
    expect(snapshot).toContain('meetingPersistence: state.meetingPersistence,');
  });
});

describe('E2 — where the child gets it', () => {
  it('meetings 3–7 end with one sentence; 1, 2 and 8 do not', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].filter(hasClosingSentence)).toEqual([3, 4, 5, 6, 7]);
  });

  it('meetings 3–7: the sentence of that meeting’s index, and its read-aloud button — nothing else', () => {
    for (const n of [3, 4, 5, 6, 7]) {
      const { container } = render(<ClosingSentence sessionNumber={n} counts={c(3, 2, 1)} />);
      const box = screen.getByTestId('closing-sentence');
      expect(box.textContent).toBe(ENCOURAGEMENT_SENTENCES_HE.persevering);
      expect(screen.getByTestId('speech').getAttribute('data-text')).toBe(ENCOURAGEMENT_SENTENCES_HE.persevering);
      expect(container.textContent).not.toMatch(/[0-9%]/);
      expect(container.querySelectorAll('button, input, [role="radio"], [role="checkbox"]')).toHaveLength(0);
      cleanup();
    }
  });

  it('meetings 1 and 2 (and 8, whose sentence is on the reflection board): nothing new', () => {
    for (const n of [1, 2, 8]) {
      const { container } = render(<ClosingSentence sessionNumber={n} counts={c(0, 0, 0)} />);
      expect(container.innerHTML, `meeting ${n}`).toBe('');
      cleanup();
    }
  });

  it('the end screen shows it, with this meeting’s counts', () => {
    const page = read(resolve(SRC, 'features/workspace/StudentWorkspacePage.tsx'));
    const end = page.slice(page.indexOf("if (endScreen === 'sessionDone') {"));
    expect(end).toContain('<ClosingSentence sessionNumber={sessionNumber} counts={meetingPersistence} />');
    // Meeting 8's board gets meeting 8's own counts.
    expect(page).toContain('const { undos: undoCount, wrongDigits: errorCount, wrongOptions: guessCount } = meetingPersistence;');
  });

  it('the chosen sentence is shown, never saved: nothing new reaches a record', () => {
    for (const f of ['application/useWorkspaceStore.ts', 'infrastructure/services/FirebaseSyncService.ts', 'core/srlReflection.ts']) {
      const text = read(resolve(SRC, f));
      expect(text, f).not.toContain('encouragementSentenceHe');
      expect(text, f).not.toContain('ENCOURAGEMENT_SENTENCES_HE');
    }
  });
});

describe('one praise, one sentence at the end of meetings 3–7', () => {
  it('every closing sentence carries the praise itself', () => {
    for (const s of Object.values(ENCOURAGEMENT_SENTENCES_HE)) expect(s.startsWith('כל הכבוד'), s).toBe(true);
  });

  it('meetings 3–7 end on the one sentence alone (PRD 14 §ג: no heading, no number; owner, OWNER-1)', () => {
    const page = read(resolve(SRC, 'features/workspace/StudentWorkspacePage.tsx'));
    const end = page.slice(page.indexOf("if (endScreen === 'sessionDone') {"), page.indexOf('{classStateOverlays}', page.indexOf("if (endScreen === 'sessionDone') {")));
    expect(end).toContain("hasClosingSentence(endStation) && endStation === sessionNumber ? 'encouragement'");
    expect(end).toMatch(/endKind === 'encouragement' \? \(\s*\/\/[^\n]*\n\s*<ClosingSentence sessionNumber=\{sessionNumber\} counts=\{meetingPersistence\} \/>/);
    expect(end).not.toContain('`סיימתם את תחנה ${');
    expect(end).not.toContain('כל הכבוד');
  });

  it('no toast before that screen (review S11, 9.10.2026: not PRD text)', () => {
    const store = read(resolve(SRC, 'application/useWorkspaceStore.ts'));
    const plain = store.replace(/[\u0591-\u05C7]/g, '');
    expect(plain).not.toContain('הושלמה בהצלחה');
    expect(store).not.toContain('🎉');
  });
});
