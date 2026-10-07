/**
 * @vitest-environment jsdom
 */
/**
 * The instruction shown as the task and its steps (owner, 7.10.2026): the
 * same agreed words, split at sentence ends only — never inside a number, a
 * quoted button name or a line that is one step. Every bank instruction
 * round-trips: joining the parts gives the text back, word for word.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { instructionLayout } from '@/core/instructionSteps';
import { getSessionTasks } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { TaskCard } from '@/features/workspace/tasks/TaskCard';

afterEach(cleanup);

const bank = () => {
  const out: { id: string; instructionHe?: string }[] = [];
  for (const m of [1, 3, 4, 5, 6, 7, 8] as const) {
    for (const p of ['green_path', 'remediation_path'] as const) {
      out.push(...(getSessionTasks(m, p) ?? []));
      if (m >= 3 && m <= 7) out.push(...getSessionBranchTasks(m, 'reinforcement', p), ...getSessionBranchTasks(m, 'challenge', p));
    }
  }
  return out;
};

describe('instructionLayout', () => {
  it('the task, then the steps, in the words of the instruction', () => {
    const { lead, steps } = instructionLayout(
      'פתרו במאונך: 1,245 + 328. ייצגו את המספרים בעזרת לבנים. כאשר מצטברות 10 לבנים בטור, לחצו על הכפתור "קבצו 10" שבראש הטור ורשמו את ההמרה בעיגול הזיכרון. רשמו את התוצאה בשורת התוצאה.'
    );
    expect(lead).toBe('פתרו במאונך: 1,245 + 328.');
    expect(steps).toEqual([
      'ייצגו את המספרים בעזרת לבנים.',
      'כאשר מצטברות 10 לבנים בטור, לחצו על הכפתור "קבצו 10" שבראש הטור ורשמו את ההמרה בעיגול הזיכרון.',
      'רשמו את התוצאה בשורת התוצאה.',
    ]);
  });

  it('a question is a step of its own; a quoted name, a number and a line break are respected', () => {
    expect(instructionLayout('בנו בבית המספרים 3 לבני מאה ו-4 לבני עשרת. פרטו לבנת מאה אחת לעשר לבני עשרת. איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.').steps).toEqual([
      'פרטו לבנת מאה אחת לעשר לבני עשרת.',
      'איזה מספר מייצגות הלבנים לאחר הפריטה?',
      'כתבו אותו בשורת התוצאה.',
    ]);
    expect(instructionLayout('לחצו על כפתור ביטול הפעולה ↺ כדי לחזור צעד אחד אחורה.\nאחר כך לחצו על פח האשפה כדי לנקות את בית המספרים.')).toEqual({
      lead: 'לחצו על כפתור ביטול הפעולה ↺ כדי לחזור צעד אחד אחורה.',
      steps: ['אחר כך לחצו על פח האשפה כדי לנקות את בית המספרים.'],
    });
    expect(instructionLayout('שאלה "א. ב." בתוך מירכאות. שנייה.')).toEqual({ lead: 'שאלה "א. ב." בתוך מירכאות.', steps: ['שנייה.'] });
    expect(instructionLayout('משפט אחד בלבד.')).toEqual({ lead: 'משפט אחד בלבד.', steps: [] });
  });

  it('every instruction of every bank round-trips, and no part is only a number', () => {
    const all = [...bank(), ...DIAGNOSTIC_TASKS.map((t) => ({ id: t.id, instructionHe: t.instructionHe }))];
    expect(all.length).toBeGreaterThan(120);
    for (const t of all) {
      const text = (t.instructionHe ?? '').trim();
      if (!text) continue;
      const { lead, steps } = instructionLayout(text);
      expect([lead, ...steps].join(' ').replace(/\s+/g, ' '), t.id).toBe(text.replace(/\s+/g, ' '));
      for (const part of [lead, ...steps]) expect(part, `${t.id}: a part that is only a number`).not.toMatch(/^[0-9▢,\s+−=]+$/);
    }
  });
});

describe('on the task card', () => {
  const open = (meeting: 4 | 8) => {
    useWorkspaceStore.getState().resetWorkspace();
    useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
    const tasks = getSessionTasks(meeting, 'green_path') ?? [];
    useWorkspaceStore.setState({ sessionNumber: meeting, dynamicTasks: tasks, standardTaskIdx: 0, flowStatus: 'task', helpState: 'closed', currentState: 'PROBLEM_ACTIVE', successHold: null } as any);
    render(React.createElement(TaskCard));
  };

  it('meeting 4: the task in bold, three numbered steps, the whole instruction read aloud', () => {
    open(4);
    const box = screen.getByTestId('task-instruction');
    const lead = screen.getByTestId('instruction-lead');
    expect(lead.textContent).toBe('פתרו במאונך: 1,245 + 328.');
    expect(lead.className).toContain('font-bold');
    const steps = screen.getByTestId('instruction-steps').querySelectorAll('li');
    expect(steps).toHaveLength(3);
    // The build step carries the child's own mark, "בניתי" (core/buildStep.ts).
    expect(steps[0].textContent).toBe('1ייצגו את המספרים בעזרת לבנים.בניתי');
    expect(screen.getByTestId('mark-step-1').getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('mark-step-2')).toBeNull();
    expect(screen.queryByTestId('mark-step-3')).toBeNull();
    expect(steps[2].textContent).toBe('3רשמו את התוצאה בשורת התוצאה.');
    // The exercise's numbers stay isolated left-to-right (MathText).
    expect(lead.querySelector('bdi[dir="ltr"]')?.textContent).toBe('1,245 + 328');
    // One read-aloud button (the mark buttons are the child's, not read-alouds).
    expect(box.querySelectorAll('button:not([data-testid^="mark-step-"])')).toHaveLength(1);
  });

  it('meeting 8: two sentences become the task and one step', () => {
    open(8);
    expect(screen.getByTestId('instruction-steps').querySelectorAll('li')).toHaveLength(1);
  });
});
