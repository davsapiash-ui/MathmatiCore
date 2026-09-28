// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { PLACE_ORDER, PLACE_NAMES_HE, digitAt, type Place } from '@/core/placeValue';
import { speakMissingDigits } from '@/core/missingDigitSpeech';
import { VerticalAdditionTask } from '@/features/workspace/tasks/VerticalAdditionTask';
import { TaskCard } from '@/features/workspace/tasks/TaskCard';
import { useWorkspaceStore, effectiveArithmetic } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import * as SessionTasks from '@/data/sessionTasks';
import * as BranchTasks from '@/data/sessionBranchTasks';
import type { SessionTask } from '@/data/sessionTasks';
import { approvePath } from '@/test/approvedPath';

/**
 * The vertical exercise's screen-reader label (role="group") must not say a
 * digit the child has to find. PRD Module 13's iron rule: the answer is never
 * revealed. In a skeleton exercise the hidden operand digit is that answer, and
 * the label used to read the whole operand — "386" for 3▢6 + 271. Each hidden
 * place is now said as "ספרה חסרה"; every other digit, and every exercise
 * without hidden digits, is said exactly as before.
 */

const MISSING = 'ספרה חסרה';

const all: SessionTask[] = [];
const seen = new Set<string>();
const walk = (o: unknown): void => {
  if (Array.isArray(o)) o.forEach(walk);
  else if (o && typeof o === 'object') {
    const t = o as SessionTask;
    if (typeof t.id === 'string' && typeof t.type === 'string') {
      if (!seen.has(t.id) && (t.type === 'vertical_addition' || t.type === 'addition_simple')) {
        seen.add(t.id);
        all.push(t);
      }
    } else Object.values(o).forEach(walk);
  }
};
walk(SessionTasks);
walk(BranchTasks);

const skeletons = all.filter((t) => t.hiddenDigits?.a?.length || t.hiddenDigits?.b?.length);
const withoutHidden = all.filter((t) => !t.hiddenDigits?.a?.length && !t.hiddenDigits?.b?.length);
const missingResult = withoutHidden.filter((t) => t.revealedResultDigits?.length);
const byId = (id: string) => all.find((t) => t.id === id)!;
const operator = (t: { isSubtraction?: boolean }) => (t.isSubtraction ? 'פחות' : 'ועוד');

/** The sheet exactly as TaskCard draws it for a meeting's exercise. */
function sheet(t: SessionTask, isASD = false) {
  const { a, b, target } = effectiveArithmetic(t, isASD);
  const revealed: Partial<Record<Place, string>> = {};
  for (const p of t.revealedResultDigits ?? []) revealed[p] = String(digitAt(target, p));
  const { container } = render(
    <VerticalAdditionTask
      numberA={a}
      numberB={b}
      isSubtraction={t.isSubtraction}
      answerLength={String(Math.abs(target)).length}
      hiddenA={t.hiddenDigits?.a}
      hiddenB={t.hiddenDigits?.b}
      revealedResult={revealed}
    />
  );
  const label = container.querySelector('[role="group"]')!.getAttribute('aria-label')!;
  return { container, label, a, b, target };
}

beforeEach(() => {
  useWorkspaceStore.getState().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user12', student_id: 12, role: 'student' }, role: 'student' } as any);
});
afterEach(() => cleanup());

describe('a skeleton exercise: the label says "ספרה חסרה" and never the hidden digit', () => {
  it('3▢6 + 271 (meeting 7) is "תרגיל במאונך: 3, ספרה חסרה, 6 ועוד 271"', () => {
    const t = byId('s7_r_t3');
    expect([t.numberA, t.numberB, t.isSubtraction ?? false, t.hiddenDigits]).toEqual([386, 271, false, { a: ['tens'] }]);
    const { label } = sheet(t);
    expect(label).toBe('תרגיל במאונך: 3, ספרה חסרה, 6 ועוד 271');
    expect(label).not.toContain('8');
    expect(label).not.toContain('386');
  });

  it('two, three and four hidden digits, in subtraction and in addition', () => {
    expect(sheet(byId('s7_r_t4')).label).toBe('תרגיל במאונך: 5, ספרה חסרה, ספרה חסרה פחות 178');
    cleanup();
    expect(sheet(byId('s6_g_t7')).label).toBe('תרגיל במאונך: 6, 0, ספרה חסרה, ספרה חסרה פחות 2847');
    cleanup();
    expect(sheet(byId('s7_g_t2')).label).toBe('תרגיל במאונך: 2, ספרה חסרה, 3, ספרה חסרה ועוד 1554');
    cleanup();
    expect(sheet(byId('s7_g_t3')).label).toBe('תרגיל במאונך: 5, ספרה חסרה, ספרה חסרה, ספרה חסרה פחות 2847');
    cleanup();
    expect(sheet(byId('s7_g_challenge_1')).label).toBe(
      'תרגיל במאונך: ספרה חסרה, ספרה חסרה, ספרה חסרה, ספרה חסרה פחות 2587'
    );
  });

  it.each([false, true])('isASD=%s: every skeleton in every bank — each hidden place is "ספרה חסרה", every other digit is itself', (isASD) => {
    expect(skeletons.length).toBeGreaterThan(10);
    for (const t of skeletons) {
      cleanup();
      const { container, label, a, b } = sheet(t, isASD);
      const m = label.match(new RegExp(`^תרגיל במאונך: (.+) ${operator(t)} (.+)$`));
      expect(m, `${t.id}: ${label}`).not.toBeNull();
      // one "ספרה חסרה" for each box the child types a hidden digit into
      const boxes = container.querySelectorAll('input[aria-label*="החסרה במספר"]').length;
      expect(boxes, t.id).toBeGreaterThan(0);
      expect(label.split(MISSING).length - 1, t.id).toBe(boxes);
      const operands: Array<[string, number, Place[]]> = [
        [m![1], a, t.hiddenDigits?.a ?? []],
        [m![2], b, t.hiddenDigits?.b ?? []],
      ];
      for (const [said, n, hidden] of operands) {
        const digits = String(n);
        const placeOf = (i: number) => PLACE_ORDER[digits.length - 1 - i];
        if (!digits.split('').some((_, i) => hidden.includes(placeOf(i)))) {
          expect(said, t.id).toBe(digits);
          continue;
        }
        const tokens = said.split(', ');
        expect(tokens.length, t.id).toBe(digits.length);
        tokens.forEach((token, i) => {
          expect(token, `${t.id} ${placeOf(i)}`).toBe(hidden.includes(placeOf(i)) ? MISSING : digits[i]);
        });
      }
    }
  });

  it('in its meeting, through the task card — and the instruction on the screen keeps its boxes', () => {
    const idx = SessionTasks.getSessionTasks(7, 'green_path').findIndex((t) => t.id === 's7_g_t2');
    expect(idx).toBeGreaterThanOrEqual(0);
    // Meetings 3–8 have no exercises without an approved path (#139, Module 26).
    approvePath('green_path');
    useWorkspaceStore.getState().initSession(7, false, idx);
    const { container } = render(<TaskCard />);
    const group = screen.getByRole('group', { name: /^תרגיל במאונך/ });
    expect(group.getAttribute('aria-label')).toBe('תרגיל במאונך: 2, ספרה חסרה, 3, ספרה חסרה ועוד 1554');
    // Only speech says "ספרה חסרה": the screen, and the text handed to the
    // read-aloud button, still show 2,▢3▢ (TTSService converts it as it speaks).
    const instruction = byId('s7_g_t2').instructionHe;
    expect(instruction).toContain('2,▢3▢ + 1,554');
    expect(container.textContent).toContain('2,▢3▢ + 1,554');
    expect(screen.getAllByTestId('speech').map((s) => s.getAttribute('data-text'))).toContain(instruction);
  });

  it('the read-aloud of each skeleton instruction says the hidden operand exactly as the label does', () => {
    for (const t of skeletons) {
      cleanup();
      const { label } = sheet(t);
      const operandA = label.match(new RegExp(`^תרגיל במאונך: (.+) ${operator(t)} `))![1];
      expect(operandA, t.id).toContain(MISSING);
      expect(t.instructionHe, t.id).toContain('▢');
      expect(speakMissingDigits(t.instructionHe), t.id).toContain(`${operandA} ${t.isSubtraction ? '−' : '+'} `);
    }
  });
});

describe('an exercise with no hidden operand digit keeps exactly the label it had', () => {
  it.each([false, true])('isASD=%s: every such exercise in every bank', (isASD) => {
    expect(withoutHidden.length).toBeGreaterThan(50);
    for (const t of withoutHidden) {
      cleanup();
      const { label, a, b } = sheet(t, isASD);
      expect(label, t.id).toBe(`תרגיל במאונך: ${a} ${operator(t)} ${b}`);
    }
  });

  it('for example 456 + 281 and 300 − 142, and the diagnostic sheet (no hidden props)', () => {
    expect(sheet(byId('s4_r_t4')).label).toBe('תרגיל במאונך: 456 ועוד 281');
    cleanup();
    expect(sheet(byId('s6_r_t4')).label).toBe('תרגיל במאונך: 300 פחות 142');
    cleanup();
    const { container } = render(<VerticalAdditionTask numberA={405} numberB={132} isSubtraction answerLength={3} />);
    expect(container.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('תרגיל במאונך: 405 פחות 132');
  });

  it('a missing result digit (the answer there) is in no label: its box is empty and named without a digit', () => {
    expect(missingResult.map((t) => t.id).sort()).toEqual(['s4_r_t7', 's6_r_t7']);
    for (const t of missingResult) {
      cleanup();
      const { container, label, a, b, target } = sheet(t);
      expect(label, t.id).toBe(`תרגיל במאונך: ${a} ${operator(t)} ${b}`);
      const places = PLACE_ORDER.slice(0, String(Math.abs(target)).length);
      const missing = places.filter((p) => !t.revealedResultDigits!.includes(p));
      expect(missing, t.id).toEqual(['tens']);
      const labels = [...container.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')!);
      const box = container.querySelector(`input[aria-label="ספרת ה${PLACE_NAMES_HE.tens} בתשובה"]`) as HTMLInputElement;
      expect(box, t.id).not.toBeNull();
      expect(box.value, t.id).toBe('');
      for (const l of labels) {
        expect(l, t.id).not.toContain(String(target));
        expect(l, t.id).not.toContain(`ספרת ה${PLACE_NAMES_HE.tens} בתשובה, נתונה`);
      }
      // the digits the exercise gives are said as given
      for (const p of t.revealedResultDigits!) {
        expect(labels, `${t.id} ${p}`).toContain(`ספרת ה${PLACE_NAMES_HE[p]} בתשובה, נתונה: ${digitAt(target, p)}`);
      }
    }
  });
});
