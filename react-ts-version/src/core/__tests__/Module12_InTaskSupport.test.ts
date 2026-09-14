import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Owner rulings 14.9.2026, from the literature on learners on the autism
 * spectrum (System of Least Prompts; Wood et al.): nothing is injected into
 * the seven compulsory exercises. Support stays inside the exercise.
 *
 * Two injections used to exist in the store: a "reinforcement exercise" after
 * a second mistake on the same skill, and an "excellence challenge" after
 * three successes in a row. Both were separate tasks dropped into the middle
 * of the sequence — what document 03 §3.3 rules out ("בתוך התרגיל הקיים...
 * מבלי להציג להם משימה נפרדת") and what the PRD never asked for. Challenge
 * work belongs to the choice path after the compulsory set (Module 14 §ג).
 * Every mistake now leads to the in-task coaching card; Module 12's own
 * triggers (45s hesitation, 4 consecutive errors) are untouched.
 */
const store = readFileSync(resolve(__dirname, '../../application/useWorkspaceStore.ts'), 'utf-8');

describe('Module 12 — a mistake is met inside the exercise, never with an injected one', () => {
  it('no reinforcement exercise is injected after a second mistake', () => {
    expect(store).not.toContain('תרגיל חיזוק (הזרקה)');
    expect(store).not.toContain('id: `scaffold_${task.id}_');
  });

  it('no excellence challenge is injected after three successes either', () => {
    expect(store).not.toContain('אתגר מצוינות (הזרקה)');
    expect(store).not.toContain('id: `challenge_${task.id}_');
    // injectTask stays as an API; nothing in the compulsory flow calls it.
    expect(store.includes('get().injectTask(')).toBe(false);
  });

  it('every mistake on a tracked skill opens the in-task coaching flow', () => {
    const handler = store.slice(store.indexOf('const strikes = (s.nodeStrikes[task.targetNode] || 0) + 1;'));
    const block = handler.slice(0, handler.indexOf('showFeedback({ correct: false'));
    expect(block).toContain("set({ helpState: 'friction', frictionTriggerSource: 'mistake' });");
    expect(block).not.toContain('injectTask(');
  });
});
