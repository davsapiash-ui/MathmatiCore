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
 * Owner ruling 16.9.2026: the card is contingent. The first wrong answer on an
 * exercise gets feedback and the learner's own tools; the card opens on the
 * second wrong answer in a row (מסמך 03 §1.3 ד' "שגיאות חוזרות"). An empty
 * answer never opens it. Module 12's own triggers are untouched.
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

  it('the second wrong answer in a row opens the in-task coaching flow; an empty answer never does', () => {
    const handler = store.slice(store.indexOf("const incomplete = detail === 'missing_answer' || detail === 'no_choice';"));
    const block = handler.slice(0, handler.indexOf('showFeedback({ correct: false'));
    expect(block).toContain("const incomplete = detail === 'missing_answer' || detail === 'no_choice';");
    expect(block).toContain('if (streak >= 2) {');
    expect(block).toContain("set({ helpState: 'friction', frictionTriggerSource: 'mistake' });");
    expect(block).not.toContain('injectTask(');
  });

  it('the dead "which help would you like?" palette is gone (owner, 14.9.2026)', () => {
    const overlays = readFileSync(resolve(__dirname, '../../features/workspace/overlays/HelpOverlays.tsx'), 'utf-8');
    expect(overlays).not.toContain('איזו עזרה תרצו לקבל כעת?');
    expect(overlays).not.toContain('דוגמה פתורה');
    expect(store).not.toContain("helpState: 'palette'");
    expect(store).not.toContain('requestHelp:');
    expect(store).not.toContain('chooseSupport');
  });
});
