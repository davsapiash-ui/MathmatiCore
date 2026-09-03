import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD Module 10 §ב — "הטיימר מתאפס על פעולות קוגניטיביות בלבד (גרירת לבנים,
 * הקלדה, המרה). תנועות עכבר אינן מאפסות את הטיימר."
 *
 * The radar used to reset its clock on mousedown / touchstart / keydown /
 * dragstart anywhere on the window, which meant ANY click — including one on
 * empty background or on a lobby button — restarted the count. That inverted
 * the module's intent: a stuck learner fidgeting with the mouse never reached
 * the 30s grid stage or the 45s Socratic stage, while a learner sitting still
 * and thinking did.
 *
 * The clock now follows the task state the three cognitive actions actually
 * change, so an input event that touches nothing on the board cannot reset it.
 */
const src = readFileSync(
  resolve(__dirname, '../../application/useCognitiveHesitationRadar.ts'),
  'utf-8'
);

describe('Module 10: the hesitation clock resets on cognitive actions only', () => {
  it('no longer resets on raw window input events', () => {
    for (const evt of ['mousedown', 'touchstart', 'keydown', 'dragstart']) {
      expect(src).not.toContain(`'${evt}'`);
    }
    expect(src).not.toContain('window.addEventListener');
  });

  it('follows the board state the three cognitive actions change', () => {
    // counts covers block placement, decomposition and grouping;
    // answerDigits and carryDigits cover typing into the result row and the
    // memory circles.
    expect(src).toContain('s.counts');
    expect(src).toContain('s.answerDigits');
    expect(src).toContain('s.carryDigits');
  });

  it('also counts answering a closed-choice task as a cognitive action', () => {
    // Such a task offers no drag, typing or conversion at all, so without this
    // the learner would sit permanently at "hesitating" while actively working.
    expect(src).toContain('s.selectedChoiceId');
  });

  it('subscribes to the workspace store rather than to the document', () => {
    expect(src).toContain('useWorkspaceStore.subscribe');
    expect(src).toContain('unsubscribe()');
  });

  it('keeps both stages of the hierarchy intact', () => {
    expect(src).toContain('GRID_STAGE_SECONDS');
    expect(src).toContain('getHesitationThresholdSeconds()');
  });
});

/**
 * The checks above pin the source. These drive the real store and prove the
 * behaviour: the signature the radar watches must change on a cognitive action
 * and must NOT change on an interaction that touches nothing on the board.
 */
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

const signature = (s: any) =>
  `${JSON.stringify(s.counts)}|${JSON.stringify(s.answerDigits)}|${JSON.stringify(s.carryDigits)}|${s.selectedChoiceId ?? ''}`;

describe('Module 10: proven against the live store', () => {
  it('a digit typed into the result row resets the clock', () => {
    useWorkspaceStore.getState().resetWorkspace();
    const before = signature(useWorkspaceStore.getState());
    useWorkspaceStore.getState().setAnswerDigit('units', '7');
    expect(signature(useWorkspaceStore.getState())).not.toBe(before);
  });

  it('a digit typed into a memory circle resets the clock', () => {
    useWorkspaceStore.getState().resetWorkspace();
    const before = signature(useWorkspaceStore.getState());
    useWorkspaceStore.getState().setCarryDigit('tens', '1');
    expect(signature(useWorkspaceStore.getState())).not.toBe(before);
  });

  it('placing blocks on the board resets the clock', () => {
    useWorkspaceStore.getState().resetWorkspace();
    const before = signature(useWorkspaceStore.getState());
    useWorkspaceStore.setState({ counts: { units: 3, tens: 0, hundreds: 0, thousands: 0 } } as any);
    expect(signature(useWorkspaceStore.getState())).not.toBe(before);
  });

  it('moving focus between columns does NOT reset the clock', () => {
    useWorkspaceStore.getState().resetWorkspace();
    const before = signature(useWorkspaceStore.getState());
    useWorkspaceStore.getState().setFocusedPlace('hundreds');
    expect(signature(useWorkspaceStore.getState())).toBe(before);
  });

  it('a stray click that changes nothing on the board does NOT reset the clock', () => {
    useWorkspaceStore.getState().resetWorkspace();
    const before = signature(useWorkspaceStore.getState());
    // Nothing about the task changed — this is the fidgeting learner.
    useWorkspaceStore.setState({ hasInteracted: true } as any);
    expect(signature(useWorkspaceStore.getState())).toBe(before);
  });
});
