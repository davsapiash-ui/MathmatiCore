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

  it('instruction → result row → checklist, in the task column\'s DOM; no big 347 (owner, 29.9.2026)', () => {
    render(<TaskCard />);
    const column = screen.getByTestId('task-column');
    const instruction = [...column.querySelectorAll('p')].find((p) => p.textContent?.startsWith('משימת היעד:'))!;
    const row = screen.getByTestId('result-row');
    const checklist = screen.getByTestId('session1-checklist');
    expect(instruction && row && checklist).toBeTruthy();
    // the number the row is checked against is not printed above it in station 1
    expect(screen.queryByTestId('representation-number')).toBeNull();
    expect(follows(instruction, row)).toBe(true);
    expect(follows(row, checklist)).toBe(true);
    // the result row is the task's own row of three boxes, hundreds on the left
    expect(row.getAttribute('aria-label')).toBe('שורת התוצאה');
    expect(row.querySelectorAll('input')).toHaveLength(3);
  });

  it('the checklist sits in the one area of the column that scrolls', () => {
    render(<TaskCard />);
    const area = screen.getByTestId('checklist-area');
    expect(area.contains(screen.getByTestId('session1-checklist'))).toBe(true);
    expect(area.className).toContain('overflow-y-auto');
    expect(area.className).toContain('flex-1');
    expect(area.contains(screen.getByTestId('result-row'))).toBe(false);
  });

  it('read-aloud buttons are all still there: the instruction and the checklist', () => {
    render(<TaskCard />);
    const texts = screen.getAllByTestId('speech').map((e) => e.getAttribute('data-text'));
    expect(texts).toContain(SESSION1_TASKS[at('s1_target_347')].instructionHe);
    expect(texts.some((t) => t?.startsWith('בנו את המספר 347 בלבנים.'))).toBe(true);
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
    expect(src('features/workspace/tasks/TaskCard.tsx')).toMatch(/id="tour-task-card" className="[^"]*min-h-0[^"]*overflow-y-auto/);
    expect(src('features/workspace/StudentWorkspacePage.tsx')).toContain('max-w-3xl flex-none h-auto max-h-full');
  });
});
