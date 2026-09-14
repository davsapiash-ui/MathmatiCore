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
const missing = readFileSync(resolve(__dirname, '../../features/workspace/tasks/MissingElementTask.tsx'), 'utf-8');

describe('Module 7 — one instruction on screen, once', () => {
  it('TaskCard is the single place the instruction is written and spoken', () => {
    expect(taskCard).toContain('<p className="text-xl text-ws-ink/85 font-medium leading-relaxed flex-1">{instruction}</p>');
    expect(taskCard).toContain('<UdlSpeechButton text={instruction} />');
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
