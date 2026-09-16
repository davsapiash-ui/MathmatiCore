import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

/**
 * Owner ruling (16.9.2026), on the pedagogical advisor's recommendation:
 * the coaching card is contingent (Wood et al.; מסמך 03 §1.3 ד' "שגיאות
 * חוזרות"). The first wrong answer on an exercise gets the feedback line and
 * the learner's own tools — Undo, memory circles, blocks. The card opens on
 * the second wrong answer in a row on the same exercise, and is reported with
 * its own trigger so the research data can tell it apart from Module 12's
 * three triggers. An empty answer is not a wrong answer and never opens it.
 *
 * מסמך 03 §1.3 ב' / 04 §1 (owner, 15.9.2026): a learner may bring back the
 * Module 10 grid after closing it — the one aid that fades.
 */
function startTask(sessionNumber: number) {
  useWorkspaceStore.getState().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1 } } as any);
  useWorkspaceStore.setState({ sessionNumber, standardTaskIdx: 0, flowStatus: 'task' } as any);
}

const wrongAnswer = () => {
  const s = useWorkspaceStore.getState();
  s.setAnswerDigit('units', '1');
  s.setAnswerDigit('tens', '1');
  s.setAnswerDigit('hundreds', '1');
  s.setAnswerDigit('thousands', '1');
  s.proceed();
};

describe('מסמך 03 "שגיאות חוזרות" — the card opens on the second wrong answer, not the first', () => {
  beforeEach(() => startTask(4));

  it('the first wrong answer leaves the learner with feedback and their own tools', () => {
    wrongAnswer();
    const s = useWorkspaceStore.getState();
    expect(s.wrongAnswerStreak).toBe(1);
    expect(s.helpState).toBe('closed');
  });

  it('the second wrong answer in a row opens the coaching flow with its own trigger', () => {
    wrongAnswer();
    wrongAnswer();
    expect(useWorkspaceStore.getState().helpState).toBe('friction');
    useWorkspaceStore.getState().helpFrictionDone();
    const s = useWorkspaceStore.getState();
    expect(s.helpState).toBe('socratic');
    expect(s.socraticTriggerReason).toBe('repeated_errors');
  });

  it('an empty answer is not a wrong answer', () => {
    useWorkspaceStore.getState().proceed();
    const s = useWorkspaceStore.getState();
    expect(s.wrongAnswerStreak).toBe(0);
    expect(s.helpState).toBe('closed');
  });

  it('the beat never gets stuck when the card declines to open', () => {
    wrongAnswer();
    wrongAnswer();
    useWorkspaceStore.getState().lockSocraticCard(30000);
    useWorkspaceStore.getState().helpFrictionDone();
    expect(useWorkspaceStore.getState().helpState).toBe('closed');
  });
});

describe('מסמך 03 §1.3 ב\' — bringing the Module 10 grid back', () => {
  beforeEach(() => startTask(4));

  it('once the grid has opened, closing it leaves it available to bring back', () => {
    const s = useWorkspaceStore.getState();
    expect(s.additionHelperOffered).toBe(false);
    s.openAdditionHelper();
    s.closeAdditionHelper();
    expect(useWorkspaceStore.getState().additionHelperOffered).toBe(true);
    expect(useWorkspaceStore.getState().isAdditionHelperOpen).toBe(false);
  });

  it('a workspace reset forgets the offer', () => {
    useWorkspaceStore.getState().openAdditionHelper();
    useWorkspaceStore.getState().resetWorkspace();
    expect(useWorkspaceStore.getState().additionHelperOffered).toBe(false);
  });

  it('the topbar button appears only after the grid was offered, and never in sessions 2 or 8 (source pin)', () => {
    const topbar = readFileSync(resolve(__dirname, '../../features/workspace/WorkspaceTopbar.tsx'), 'utf-8');
    expect(topbar).toContain("additionHelperOffered && !isAdditionHelperOpen && sessionNumber !== 2 && sessionNumber !== 8 && (");
    expect(topbar).toContain('aria-label="הצג שוב את לוח החיבור"');
  });
});
