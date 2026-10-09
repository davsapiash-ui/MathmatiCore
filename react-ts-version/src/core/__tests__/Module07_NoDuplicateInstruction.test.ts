import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 7 / UDL: the learner's screen carries one instruction, once, with one
 * read-aloud button beside it.
 *
 * Found on 15.9.2026: TaskCard renders `instruction` with a UdlSpeechButton,
 * and MissingElementTask rendered the very same `instructionHe` again directly
 * below it with a second speech button. A learner solving a missing-digit
 * exercise saw the same sentence twice — the visual load the design rules and
 * Module 7 exist to prevent, and worst for the learners the profile serves.
 *
 * The spoken sentence is richer than the written one (it reads the equation
 * aloud), so the button stays — moved beside the equation it describes.
 */
const taskCard = readFileSync(resolve(__dirname, '../../features/workspace/tasks/TaskCard.tsx'), 'utf-8');
const taskZone = readFileSync(resolve(__dirname, '../../features/workspace/tasks/TaskZone.tsx'), 'utf-8');
const missing = readFileSync(resolve(__dirname, '../../features/workspace/tasks/MissingElementTask.tsx'), 'utf-8');

describe('Module 7 — one instruction on screen, once', () => {
  // Since 8.10.2026 the task zone draws it (TaskZone.tsx): stations 2 and 8 as the
  // PRD writes it (InstructionBlock), stations 1 and 3–7 as goal and steps (GuideBlock).
  it('the task zone is the single place the instruction is written and spoken', () => {
    // Shown through MathText, which isolates each exercise left to right (audit 4.10.2026, A6-101).
    expect(taskZone).toContain('<MathText text={text} />');
    expect(taskZone.split('<MathText text={text} />').length - 1).toBe(1);
    expect(taskZone).toContain('<UdlSpeechButton text={text} className="shrink-0" />');
    expect(taskCard.split('<InstructionBlock').length - 1).toBe(1);
    expect(taskCard.split('<TaskGuideBlock').length - 1).toBe(1);
  });

  it('MissingElementTask no longer repeats it on screen', () => {
    expect(missing).not.toContain('>{instructionHe}<');
    // The instruction still reaches the learner's ear, inside the equation sentence.
    expect(missing).toContain('const speechText = isSubtraction');
    expect(missing).toContain('<UdlSpeechButton text={speechText} />');
  });

  it('no task component re-renders the instruction TaskCard already shows', () => {
    for (const file of ['MissingElementTask', 'SmallChangeTask', 'RepresentationTask', 'IntroTask']) {
      const src = readFileSync(resolve(__dirname, `../../features/workspace/tasks/${file}.tsx`), 'utf-8');
      expect(src, file).not.toContain('>{instructionHe}<');
      expect(src, file).not.toContain('>{task.instructionHe}<');
    }
  });
});
