import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Owner ruling 14.9.2026, from the literature on learners on the autism
 * spectrum (System of Least Prompts; Wood et al.): support stays inside the
 * exercise. The "reinforcement exercise" the store used to inject after a
 * second mistake on the same skill was a separate task dropped into the middle
 * of the sequence — exactly what document 03 §3.3 rules out ("בתוך התרגיל
 * הקיים... מבלי להציג להם משימה נפרדת") and what the PRD never asked for.
 * Every mistake now leads to the in-task coaching card; Module 12's own
 * triggers (45s hesitation, 4 consecutive errors) are untouched.
 */
const store = readFileSync(resolve(__dirname, '../../application/useWorkspaceStore.ts'), 'utf-8');

describe('Module 12 — a mistake is met inside the exercise, never with an injected one', () => {
  it('no reinforcement exercise is injected after a second mistake', () => {
    expect(store).not.toContain('תרגיל חיזוק (הזרקה)');
    expect(store).not.toMatch(/id: `scaffold_\$\{task\.id\}/);
  });

  it('every mistake on a tracked skill opens the in-task coaching flow', () => {
    const handler = store.slice(store.indexOf('const strikes = (s.nodeStrikes[task.targetNode] || 0) + 1;'));
    const block = handler.slice(0, handler.indexOf('showFeedback({ correct: false'));
    expect(block).toContain("set({ helpState: 'friction', frictionTriggerSource: 'mistake' });");
    expect(block).not.toContain('injectTask(');
  });
});
