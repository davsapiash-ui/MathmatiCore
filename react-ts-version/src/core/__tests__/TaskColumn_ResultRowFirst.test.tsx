/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { TaskCard } from '@/features/workspace/tasks/TaskCard';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { SESSION1_TASKS, getSessionTasks } from '@/data/sessionTasks';
import { approvePath } from '@/test/approvedPath';

/**
 * Owner, 27.9.2026: the result row (שורת התוצאה) is in view without scrolling
 * on 1024×768, 1280×720, 1366×768 and 1536×864 laptop screens. Inside the task
 * column the order is: the instruction, the number or the exercise, the result
 * row, and only then the checklist or other extra content — which is the part
 * that may scroll. (The sizes themselves were checked in a real browser on a
 * dev-only harness; jsdom has no layout, so this locks the order and the CSS
 * that carries it.)
 */

const ws = () => useWorkspaceStore.getState();
const at = (id: string) => SESSION1_TASKS.findIndex((t) => t.id === id);
const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => ws().resetWorkspace());
afterEach(cleanup);

describe('meeting 1, the target task', () => {
  beforeEach(() => ws().initSession(1, false, at('s1_target_347')));

  // Owner, 8.10.2026 (task-zone design spec, approved): heading, then the guide
  // — goal, steps, and the done box in a slot of its own — then the work area.
  // The slot keeps one height from the start, so the result row never moves
  // when the done box appears and stays in view (owner, 27.9.2026).
  it('heading → goal → steps → result row, in the task column\'s DOM; no big 347 (owner, 29.9.2026)', () => {
    render(<TaskCard />);
    const heading = screen.getByTestId('task-heading');
    const goal = screen.getByTestId('task-goal');
    const steps = screen.getByTestId('guide-steps');
    const row = screen.getByTestId('result-row');
    expect(heading.textContent).toBe('משימת היכרות: בודקים אם המספר משתנה');
    // PRD 7 §א rule (1): the location is a smaller span than the topic, on the same line.
    expect(screen.getByTestId('task-position').textContent).toBe('משימת היכרות:');
    expect(goal.textContent).toBe('משימת היעד: איזה מספר, לדעתכם, הלבנים יראו לאחר הפריטה?');
    expect([...steps.querySelectorAll(':scope > li')].map((li) => li.textContent)).toEqual([
      '1בנו את המספר 347 בבית המספרים',
      '2פרטו לבנת עשרת אחת לעשר לבני יחידה',
      '3כתבו בשורת התוצאה איזה מספר הלבנים מראות עכשיו',
    ]);
    // the number the row is checked against is not printed above it in station 1
    expect(screen.queryByTestId('representation-number')).toBeNull();
    expect(follows(heading, goal)).toBe(true);
    expect(follows(goal, steps)).toBe(true);
    expect(follows(steps, row)).toBe(true);
    // the result row is the task's own row of three boxes, hundreds on the left
    expect(row.getAttribute('aria-label')).toBe('שורת התוצאה');
    expect(row.querySelectorAll('input')).toHaveLength(3);
  });

  it('the done box\'s height is held from the start: an invisible copy in the same slot, so the row does not move', () => {
    render(<TaskCard />);
    const slot = screen.getByTestId('guide-slot');
    const layers = [...slot.children];
    expect(layers).toHaveLength(2);
    expect(layers[1].className).toContain('invisible');
    expect(layers[1].getAttribute('aria-hidden')).toBe('true');
    expect(layers[1].textContent).toContain('בסרגל העליון כדי לעבור לשלב הבא!');
    expect(screen.queryByTestId('session1-done')).toBeNull();
    expect(slot.contains(screen.getByTestId('result-row'))).toBe(false);
  });

  it('one read-aloud button for the guide: the heading, the goal and every step, in order', () => {
    render(<TaskCard />);
    const texts = screen.getAllByTestId('speech').map((e) => e.getAttribute('data-text') ?? '');
    const guide = texts.find((t) => t.startsWith('משימת היכרות: בודקים אם המספר משתנה.'));
    expect(guide).toBeTruthy();
    expect(guide).toContain('משימת היעד: איזה מספר, לדעתכם, הלבנים יראו לאחר הפריטה? בנו את המספר 347 בבית המספרים.');
    expect(guide).toContain('בנו את המספר 347 בבית המספרים. פרטו לבנת עשרת אחת לעשר לבני יחידה. כתבו בשורת התוצאה');
  });
});

describe('other representation exercises: no "בנו בלוח בדיוק / בלוח כרגע" box (owner, 28.9.2026)', () => {
  for (const meeting of [3, 4, 7] as const) {
    for (const path of ['green_path', 'remediation_path'] as const) {
      it(`meeting ${meeting}, ${path}: every representation exercise has its result row and no box`, () => {
        const tasks = getSessionTasks(meeting, path);
        tasks.forEach((t, idx) => {
          if (t.type !== 'representation') return;
          cleanup();
          approvePath(path); // the learner's approved path (Module 26)
          ws().initSession(meeting, false, idx);
          render(<TaskCard />);
          expect(screen.getByTestId('result-row')).toBeTruthy();
          const text = screen.getByTestId('task-column').textContent ?? '';
          expect(text, t.id).not.toContain('בנו בלוח בדיוק');
          expect(text, t.id).not.toContain('בלוח כרגע');
          expect(text, t.id).not.toContain('הלוח תואם');
        });
      });
    }
  }
});

describe('the layout that keeps the row in view (source)', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

  it('sizes are fluid by the window, with no step at any screen size (owner, 28.9.2026)', async () => {
    const tw = readFileSync(resolve(__dirname, '../../../tailwind.config.js'), 'utf-8');
    expect(tw).not.toMatch(/short: \{ raw|tiny: \{ raw/);
    // @ts-expect-error the tailwind config is plain JavaScript, without types
    const { default: config } = await import('../../../tailwind.config.js');
    const spacing = (config as any).theme.extend.spacing as Record<string, string>;
    // 12px in a 600px-tall window, 32px in a 950px-tall one, in proportion between
    expect(spacing['fl-12-32']).toBe('clamp(12px, calc(5.7143vh - 22.29px), 32px)');
    const at = (v: string, h: number) => {
      const [, min, k, sign, b, max] = v.match(/clamp\((\d+)px, calc\(([\d.]+)vh ([+-]) ([\d.]+)px\), (\d+)px\)/)!.map(Number.parseFloat as any) as any;
      return Math.min(max, Math.max(min, (k * h) / 100 + (v.includes(' - ') ? -b : b)));
    };
    expect(at(spacing['fl-12-32'], 600)).toBeCloseTo(12, 1);
    expect(at(spacing['fl-12-32'], 775)).toBeCloseTo(22, 1);
    expect(at(spacing['fl-12-32'], 950)).toBeCloseTo(32, 1);
    // no child screen of the exercise column uses a height step
    for (const f of ['TaskCard', 'IntroTask', 'FlexibleDecompTask', 'MissingElementTask', 'VerticalAdditionTask', 'RepresentationTask', 'PlaceValueInputBoxes', 'Session1ChecklistCard']) {
      expect(src(`features/workspace/tasks/${f}.tsx`), f).not.toMatch(/\b(short|tiny):/);
    }
    expect(src('features/workspace/StudentWorkspacePage.tsx')).not.toMatch(/\b(short|tiny):/);
  });

  it('the notebook square scales with the screen, and the sheet and the result row use it', () => {
    expect(src('index.css')).toContain('--ws-cell: clamp(40px, min(7.4vh, 5vw), 64px);');
    expect(src('features/workspace/tasks/VerticalAdditionTask.tsx')).toContain('const CELL = "var(--ws-cell)";');
    expect(src('features/workspace/tasks/RepresentationTask.tsx')).toContain("const CELL = 'var(--ws-cell)';");
  });

  it('the task card and the centred card of meetings 2 and 8 never grow past the screen', () => {
    // The card is drawn by TaskCardFrame (shared with the teacher's demonstration).
    expect(src('features/workspace/tasks/TaskCard.tsx')).toContain('<TaskCardFrame id="tour-task-card">');
    expect(src('features/workspace/tasks/TaskCard.tsx')).toMatch(/function TaskCardFrame[\s\S]*?className="[^"]*min-h-0[^"]*overflow-y-auto/);
    expect(src('features/workspace/StudentWorkspacePage.tsx')).toContain('max-w-3xl flex-none h-auto max-h-full');
  });
});
