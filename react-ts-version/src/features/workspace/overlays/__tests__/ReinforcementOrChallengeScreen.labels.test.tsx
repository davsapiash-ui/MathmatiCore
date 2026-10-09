// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReinforcementOrChallengeScreen } from '../ReinforcementOrChallengeScreen';

/**
 * PRD v7.9 Module 14 §ג: the choice screen after the seven compulsory
 * exercises. The buttons the learner sees are "חיזוק וחזרה על החומר" and
 * "אתגר"; the word "מסלול" does not appear on the screen (it is reserved for
 * the path the teacher sets, Module 20); and the screen is shown also after
 * the meeting's target time.
 */
describe('choice screen labels (PRD Module 14 §ג)', () => {
  it('shows the title and the two PRD button names, and no "מסלול"', () => {
    const onSelectBranch = vi.fn();
    const { container } = render(<ReinforcementOrChallengeScreen onSelectBranch={onSelectBranch} onSkipToFinish={vi.fn()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('סיימתם את שבעת התרגילים של התחנה!');
    expect(text).not.toContain('מסלול');
    fireEvent.click(screen.getByRole('button', { name: /חיזוק וחזרה על החומר/ }));
    expect(onSelectBranch).toHaveBeenLastCalledWith('reinforcement');
    fireEvent.click(screen.getByRole('button', { name: /^אתגר/ }));
    expect(onSelectBranch).toHaveBeenLastCalledWith('challenge');
  });

  it('the read-aloud text has no "מסלול" either', () => {
    const src = readFileSync(resolve(__dirname, '../ReinforcementOrChallengeScreen.tsx'), 'utf8');
    const texts = src.slice(src.indexOf('const BRANCH_CHOICE_TEXT'), src.indexOf('interface ReinforcementOrChallengeScreenProps'));
    expect(texts).not.toContain('מסלול');
  });

  it('the store opens the choice screen in meetings 3–7 without any time condition', () => {
    const store = readFileSync(resolve(__dirname, '../../../../application/useWorkspaceStore.ts'), 'utf8');
    const at = store.indexOf("set({ flowStatus: 'choice_branch'");
    expect(at).toBeGreaterThan(0);
    const guard = store.slice(store.lastIndexOf('function advanceStandard()', at), at);
    expect(guard).toContain('s.sessionNumber >= 3 && s.sessionNumber <= 7');
    expect(guard).not.toMatch(/deadline|elapsed|targetTime|Date\.now/i);
  });
});
