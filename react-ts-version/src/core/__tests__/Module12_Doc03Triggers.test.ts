import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore, columnRequiresConversion } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

/**
 * מסמך 03 §3.3–3.8 names three triggers for the coaching card:
 *   1. 45 seconds of hesitation in the active column (owned by the radar hook),
 *   2. four consecutive deletions in the active column,
 *   3. a required conversion the learner did not perform.
 * Only the first was wired. The deletion count existed but nothing read it, and
 * the third trigger did not exist at all — so a learner who kept answering a
 * carry column without ever regrouping was never offered the card.
 *
 * PRD Module 12: none of them may fire in session 2.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

function startTask(sessionNumber: number) {
  useWorkspaceStore.getState().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1 } } as any);
  useWorkspaceStore.setState({ sessionNumber, standardTaskIdx: 0, flowStatus: 'task' } as any);
}

describe('Module 12: the three coaching triggers of מסמך 03', () => {
  beforeEach(() => startTask(4));

  it('trigger 2 — four consecutive deletions open the card and are reported as such', async () => {
    // The tens of 1,245 + 328 need no carry, so trigger 3 cannot fire here.
    const s = useWorkspaceStore.getState();
    for (let i = 0; i < 4; i++) {
      s.setAnswerDigit('tens', '6');
      s.setAnswerDigit('tens', '');
    }
    await flush();
    expect(useWorkspaceStore.getState().consecutiveDeletions).toBeGreaterThanOrEqual(4);
    expect(useWorkspaceStore.getState().helpState).toBe('socratic');
    expect(useWorkspaceStore.getState().socraticTriggerReason).toBe('consecutive_errors_4');
  });

  it('three deletions do not open it — the threshold is four', async () => {
    const s = useWorkspaceStore.getState();
    for (let i = 0; i < 3; i++) {
      s.setAnswerDigit('tens', '6');
      s.setAnswerDigit('tens', '');
    }
    await flush();
    expect(useWorkspaceStore.getState().helpState).not.toBe('socratic');
  });

  it('a correct entry between deletions restarts the count', async () => {
    const s = useWorkspaceStore.getState();
    s.setAnswerDigit('tens', '6'); s.setAnswerDigit('tens', '');
    s.setAnswerDigit('tens', '6'); s.setAnswerDigit('tens', '');
    s.setAnswerDigit('tens', '7'); // 4 + 2 + 1 carried = 7, the correct tens digit
    expect(useWorkspaceStore.getState().consecutiveDeletions).toBe(0);
    s.setAnswerDigit('tens', ''); s.setAnswerDigit('tens', '6'); s.setAnswerDigit('tens', '');
    await flush();
    expect(useWorkspaceStore.getState().helpState).not.toBe('socratic');
  });

  it('trigger 3 — a wrong digit in a carry column with no regrouping done opens the card', async () => {
    // 1,245 + 328: the units need a carry (5 + 8 = 13). 9 ignores it.
    useWorkspaceStore.setState({ hasGrouped: false } as any);
    useWorkspaceStore.getState().setAnswerDigit('units', '9');
    await flush();
    expect(useWorkspaceStore.getState().socraticTriggerReason).toBe('conversion_not_performed');
    expect(useWorkspaceStore.getState().helpState).toBe('socratic');
  });

  it('trigger 3 stays silent once the conversion has been made on the canvas', async () => {
    useWorkspaceStore.setState({ hasGrouped: true, conversionsByColumn: { composed: { units: true }, decomposed: {} } } as any);
    useWorkspaceStore.getState().setAnswerDigit('units', '9');
    await flush();
    expect(useWorkspaceStore.getState().helpState).not.toBe('socratic');
  });

  it('trigger 3 stays silent in a column that needs no conversion', async () => {
    // Tens: nothing to carry in 1,245 + 328 (4 + 2).
    useWorkspaceStore.getState().setAnswerDigit('tens', '2');
    await flush();
    expect(useWorkspaceStore.getState().helpState).not.toBe('socratic');
  });

  it('no trigger fires in session 2 (PRD Module 12: the card is disabled there)', async () => {
    startTask(2);
    const s = useWorkspaceStore.getState();
    for (let i = 0; i < 6; i++) {
      s.setAnswerDigit('tens', '6');
      s.setAnswerDigit('tens', '');
    }
    s.openSocraticCard('hesitation_45s');
    await flush();
    expect(useWorkspaceStore.getState().helpState).not.toBe('socratic');
  });

  it('an open card is not reopened by another trigger, and the 30s lockout blocks it', async () => {
    useWorkspaceStore.getState().openSocraticCard('hesitation_45s');
    useWorkspaceStore.getState().openSocraticCard('consecutive_errors_4');
    expect(useWorkspaceStore.getState().socraticTriggerReason).toBe('hesitation_45s');

    startTask(4);
    useWorkspaceStore.getState().lockSocraticCard(30000);
    useWorkspaceStore.getState().openSocraticCard('consecutive_errors_4');
    expect(useWorkspaceStore.getState().helpState).not.toBe('socratic');
  });

  it('the lockout ends after its 30 seconds even when the card was closed meanwhile', async () => {
    // The countdown that releases the lock is polled by the OPEN card only. A
    // learner who picked a wrong option and closed the card (or typed a digit,
    // which closes it) never got another card for the rest of the lesson.
    startTask(4);
    useWorkspaceStore.getState().lockSocraticCard(30000);
    useWorkspaceStore.setState({ socraticLockDeadline: Date.now() - 1 } as any);
    useWorkspaceStore.getState().openSocraticCard('consecutive_errors_4');
    expect(useWorkspaceStore.getState().isSocraticCardLocked).toBe(false);
    expect(useWorkspaceStore.getState().helpState).toBe('socratic');
  });
});

describe('columnRequiresConversion agrees with the vertical algorithm', () => {
  it('addition: a carry column is required, a quiet one is not', () => {
    expect(columnRequiresConversion('units', 1245, 328, false)).toBe(true);  // 5+8
    expect(columnRequiresConversion('tens', 1245, 328, false)).toBe(false);  // 4+2+1
    expect(columnRequiresConversion('tens', 456, 281, false)).toBe(true);    // 5+8
  });

  it('subtraction: a borrow column is required', () => {
    expect(columnRequiresConversion('units', 53, 18, true)).toBe(true);      // 3 < 8
    expect(columnRequiresConversion('tens', 78, 25, true)).toBe(false);      // 7 > 2
  });

  it('the carry or borrow into a column is the exercise\'s own, not the memory circle', () => {
    // 85 + 17: the tens are 8 + 1 + the carried 1 = 10 — a conversion, circle or not.
    expect(columnRequiresConversion('tens', 85, 17, false)).toBe(true);
    // 512 − 13: after the units borrow, the tens are 1 − 1 = 0 < 1 — a decomposition.
    expect(columnRequiresConversion('tens', 512, 13, true)).toBe(true);
    // 403 − 128: a chained decomposition through the empty tens.
    expect(columnRequiresConversion('units', 403, 128, true)).toBe(true);
    expect(columnRequiresConversion('tens', 403, 128, true)).toBe(true);
    expect(columnRequiresConversion('hundreds', 403, 128, true)).toBe(false);
  });
});
