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

  it('instruction → 347 → result row → checklist, in the task column\'s DOM', () => {
    render(<TaskCard />);
    const column = screen.getByTestId('task-column');
    const instruction = [...column.querySelectorAll('p')].find((p) => p.textContent?.startsWith('משימת היעד:'))!;
    const number = [...column.querySelectorAll('span')].find((s) => s.textContent === '347')!;
    const row = screen.getByTestId('result-row');
    const checklist = screen.getByTestId('session1-checklist');
    expect(instruction && number && row && checklist).toBeTruthy();
    expect(follows(instruction, number)).toBe(true);
    expect(follows(number, row)).toBe(true);
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
    expect(texts.some((t) => t?.startsWith('בנו את המספר 347 בלבני דינס.'))).toBe(true);
  });
});

describe('other representation exercises: the "בנו בלוח בדיוק" box is extra content, after the row', () => {
  it('meeting 7', () => {
    const idx = getSessionTasks(7, 'green_path').findIndex((t) => t.type === 'representation' && !t.hideRequiredCounts);
    expect(idx).toBeGreaterThanOrEqual(0);
    ws().initSession(7, false, idx);
    render(<TaskCard />);
    const row = screen.getByTestId('result-row');
    const box = [...screen.getByTestId('task-column').querySelectorAll('p')].find((p) => p.textContent === 'בנו בלוח בדיוק:')!;
    expect(box).toBeTruthy();
    expect(follows(row, box)).toBe(true);
  });
});

describe('the layout that keeps the row in view (source)', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

  it('short-screen variants exist and come after the width breakpoints', () => {
    const tw = readFileSync(resolve(__dirname, '../../../tailwind.config.js'), 'utf-8');
    expect(tw).toContain("short: { raw: '(max-height: 820px)' }");
    expect(tw).toContain("tiny: { raw: '(max-height: 680px)' }");
  });

  it('the notebook square scales with the screen, and the sheet and the result row use it', () => {
    expect(src('index.css')).toContain('--ws-cell: clamp(40px, min(7.4vh, 5vw), 64px);');
    expect(src('features/workspace/tasks/VerticalAdditionTask.tsx')).toContain('const CELL = "var(--ws-cell)";');
    expect(src('features/workspace/tasks/RepresentationTask.tsx')).toContain("const CELL = 'var(--ws-cell)';");
  });

  it('the task card and the centred card of meetings 2 and 8 never grow past the screen', () => {
    expect(src('features/workspace/tasks/TaskCard.tsx')).toMatch(/id="tour-task-card" className="[^"]*min-h-0[^"]*overflow-y-auto/);
    expect(src('features/workspace/StudentWorkspacePage.tsx')).toContain("'max-w-3xl flex-none h-auto max-h-full'");
  });
});
