import type { CSSProperties } from 'react';
import { motion, useReducedMotionConfig } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { PROCEED_HE, PROCEED_SENTENCE_HE, proceedSentenceHe } from '@/core/toolbarNames';
import { MathText } from './MathText';

/**
 * The learner's task zone — one layout for every exercise (design-task-zone;
 * owner's station-1 review 7.10.2026, design spec and wording approved
 * 8.10.2026). Top to bottom, always in the same place:
 *
 *   1. TaskZoneHeader — one line: "משימה N מתוך 7: <topic>" / "משימת היכרות: <topic>",
 *      and the station tag;
 *   2. GuideBlock     — the goal line, "מה עושים:" with the numbered steps and the
 *      lines that depend on a condition, and the done box in a slot of its own;
 *   3. the work area  — the exercise's own component (result row, vertical sheet, choices).
 *
 * Stations 2 and 8 keep their instruction as the PRD writes it (InstructionBlock).
 * Calm by requirement (ASD, DESIGN_SYSTEM_RULES 1.3): no decoration, no
 * transform animation; colour and opacity changes of 200 ms at most, none in
 * quiet mode or with reduced motion.
 */

export function TaskZoneHeader({ stationNumber, heading, showStation }: { stationNumber: number; heading: string; showStation: boolean }) {
  return (
    <div className="shrink-0 flex items-start justify-between gap-3 mb-fl-6-16">
      <h1 className="font-display font-black text-ws-ink leading-tight [text-wrap:balance] text-[clamp(20px,calc(1.1429vh+13.14px),24px)]" data-testid="task-heading">
        {heading}
      </h1>
      {showStation && (
        <span className="shrink-0 mt-0.5 text-sm font-bold text-ws-ink bg-ws-blueSoft rounded-full px-3 py-1" data-testid="station-tag">
          תחנה {stationNumber}
        </span>
      )}
    </div>
  );
}

/** Stations 2 and 8: the PRD instruction as it is, with its read-aloud button. */
export function InstructionBlock({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <div
      className="shrink-0 flex items-start gap-3 mb-fl-6-24 rounded-2xl px-fl-12-16 py-fl-6-16"
      style={{ backgroundColor: 'hsl(var(--ws-blue-soft) / 0.45)', ...style }}
      data-testid="task-instruction"
    >
      <p className="flex-1 min-w-0 max-w-[60ch] text-fl-16-20 text-ws-ink font-medium leading-[var(--instruction-leading,1.55)] whitespace-pre-line">
        <MathText text={text} />
      </p>
      <UdlSpeechButton text={text} className="shrink-0" />
    </div>
  );
}

export type StepState = 'done' | 'current' | 'todo' | 'passed';

export interface StepView {
  label: string;
  state: StepState;
  /** Lines that depend on a condition: under the step, no number, never ticked. */
  subs?: string[];
  /** A count the step waits for (station 1, step 1: five blocks), drawn as dots — no number on the screen. */
  progress?: { value: number; of: number };
}

/**
 * The goal, the steps and the done box, in one block with one read-aloud
 * button (it reads the heading, the goal and the steps in order).
 *
 * Two layouts: working (each step with its condition lines) and done (the
 * steps without them, then the done box in the height they freed). With a
 * work area under the block (`lockHeight`), both are laid out in one grid
 * cell and only one is shown, so the block keeps one height from the start
 * and nothing below it moves when the done box appears (design spec §2.3).
 */
export function GuideBlock({
  goal,
  steps,
  speech,
  done,
  doneNote,
  lockHeight,
}: {
  goal: string | null;
  steps: StepView[];
  speech: string;
  done: boolean;
  doneNote: string | null;
  lockHeight: boolean;
}) {
  // Without a work area (station 1's tool steps) the rows take the taller size: the space is there.
  const roomy = !lockHeight;
  const working = <StepList steps={steps} testId="guide-steps" roomy={roomy} />;
  const finished = (ghost: boolean) => (
    <div className="flex flex-col gap-fl-4-8">
      <StepList steps={steps.map((s) => ({ ...s, subs: undefined }))} testId={ghost ? undefined : 'guide-steps'} roomy={roomy} />
      {ghost ? <DoneBoxBody note={doneNote} ghost /> : <DoneBox note={doneNote} />}
    </div>
  );
  return (
    <section className="shrink-0 flex flex-col gap-fl-4-8 mb-fl-6-16 rounded-2xl px-fl-12-16 py-fl-6-12" style={{ backgroundColor: 'hsl(var(--ws-blue-soft) / 0.45)' }} data-testid="task-instruction">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-fl-4-8">
          {goal && (
            <p className="max-w-[60ch] text-fl-16-20 text-ws-ink font-medium leading-snug [text-wrap:pretty]" data-testid="task-goal">
              <MathText text={goal} />
            </p>
          )}
          {steps.length > 0 && <h2 className="text-[15px] font-bold text-ws-soft">מה עושים:</h2>}
        </div>
        <UdlSpeechButton text={speech} className="shrink-0" />
      </div>
      {steps.length > 0 &&
        (lockHeight ? (
          <div className="grid" data-testid="guide-slot">
            <div className={`[grid-area:1/1] ${done ? 'invisible' : ''}`} aria-hidden={done || undefined} inert={done || undefined}>
              {done ? <StepList steps={steps} /> : working}
            </div>
            <div className={`[grid-area:1/1] ${done ? '' : 'invisible'}`} aria-hidden={!done || undefined} inert={!done || undefined}>
              {finished(!done)}
            </div>
          </div>
        ) : done ? (
          finished(false)
        ) : (
          working
        ))}
    </section>
  );
}

function StepList({ steps, testId, roomy = false }: { steps: StepView[]; testId?: string; roomy?: boolean }) {
  const numbered = steps.length > 1;
  return (
    <ol className={`flex flex-col ${roomy ? 'gap-fl-8-16' : 'gap-fl-4-8'}`} data-testid={testId}>
      {steps.map((step, i) => (
        <StepRow key={`${i}-${step.label}`} step={step} number={numbered ? i + 1 : null} roomy={roomy} />
      ))}
    </ol>
  );
}

const ROW_TONE: Record<StepState, string> = {
  done: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800',
  current: 'bg-ws-surface border-ws-blue',
  todo: 'bg-ws-surface border-ws-surface2',
  passed: 'bg-ws-surface border-ws-surface2',
};
const MARK_TONE: Record<StepState, string> = {
  done: 'bg-emerald-600 text-white',
  current: 'bg-ws-blue text-white',
  todo: 'border-2 border-ws-soft text-ws-soft',
  passed: 'border-2 border-ws-soft text-ws-soft',
};

/**
 * One step. Each state shows colour, mark and word (DESIGN_SYSTEM_RULES 1.1):
 * to do — the number in a ring; the step to do now — a filled blue number and
 * a blue border; done — a green check and "בוצע". Done text stays at full
 * strength: the child reads what they did. Not clickable, so no hover.
 */
function StepRow({ step, number, roomy }: { step: StepView; number: number | null; roomy: boolean }) {
  // A single step has no number (wording rule 3): its mark is a ring, blue while it is the step to do.
  const mark = number === null && step.state !== 'done' ? (step.state === 'current' ? 'border-2 border-ws-blue' : MARK_TONE.todo) : MARK_TONE[step.state];
  return (
    <li className={`rounded-xl border-2 px-fl-8-12 py-fl-4-8 transition-colors duration-200 ${ROW_TONE[step.state]}`} data-state={step.state}>
      <div className={`flex items-center gap-3 ${roomy ? 'min-h-[40px]' : 'min-h-[28px]'}`}>
        <span aria-hidden="true" className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-black transition-colors duration-200 ${mark}`}>
          {step.state === 'done' ? <Check className="w-4 h-4" strokeWidth={3} /> : number}
        </span>
        <span className="flex-1 min-w-0 text-[clamp(15px,calc(0.5714vh+11.57px),17px)] font-semibold text-ws-ink leading-snug">
          <MathText text={step.label} />
        </span>
        {step.state === 'done' ? (
          <span className="shrink-0 text-sm font-bold text-emerald-800 dark:text-emerald-300">בוצע</span>
        ) : step.progress ? (
          <ProgressDots value={step.progress.value} of={step.progress.of} />
        ) : null}
      </div>
      {step.subs?.length ? (
        <ul className="mt-1 flex flex-col gap-0.5 ps-10" data-testid="step-subs">
          {step.subs.map((sub) => (
            <li key={sub} className="text-[15px] font-medium text-ws-ink leading-snug">
              <MathText text={sub} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** How far a counted step is, as dots: filled for each done, a ring for each still to do. No number, no percentage. */
function ProgressDots({ value, of }: { value: number; of: number }) {
  const filled = Math.min(value, of);
  return (
    <span className="shrink-0 flex items-center gap-1.5" data-testid="step-progress" aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={`w-2.5 h-2.5 rounded-full transition-colors duration-200 ${i < filled ? 'bg-emerald-600' : 'border-2 border-ws-soft'}`} />
      ))}
    </span>
  );
}

/**
 * The PRD's checklist of a station-1 step on its own, with its read-aloud
 * button: the steps by the same rules, then the done box.
 */
export function TaskSteps({
  steps,
  doneNote = null,
  testIds = {},
}: {
  steps: { label: string; done: boolean; progress?: { value: number; of: number } }[];
  doneNote?: string | null;
  testIds?: { list?: string; items?: string };
}) {
  const allDone = steps.every((s) => s.done);
  const current = steps.findIndex((s) => !s.done);
  return (
    <div className="flex flex-col gap-fl-4-12 rounded-2xl border border-ws-surface2 bg-ws-surface px-fl-10-16 py-fl-8-16" data-testid={testIds.list}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-ws-soft">מה עושים:</h2>
        <UdlSpeechButton text={steps.map((s) => s.label).join('. ')} className="shrink-0" />
      </div>
      <StepList
        testId={testIds.items}
        steps={steps.map((s, i) => ({ label: s.label, progress: s.progress, state: s.done ? 'done' : i === current ? 'current' : 'todo' }))}
      />
      {allDone && <DoneBox note={doneNote} />}
    </div>
  );
}

/** Opacity-only entrance, 200 ms; none in quiet mode (the teacher's MotionConfig) or with reduced motion. */
function useFade() {
  const reduce = useReducedMotionConfig();
  return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: reduce ? 0 : 0.2 } };
}

/**
 * The done signal, modelled on the PRD's station-1 target task: a green box,
 * always in the same slot, that says what was done and which button to press.
 * The button's name is drawn as a copy of the real top-bar button (blue, its
 * radius, its arrow), so the child looks for the button they see. Screen and
 * speech are built from the same halves (core/toolbarNames).
 */
export function DoneBox({ note }: { note: string | null }) {
  const fade = useFade();
  return (
    <motion.div {...fade} role="status" aria-live="polite" data-testid="session1-done">
      <DoneBoxBody note={note} />
    </motion.div>
  );
}

/** `ghost`: the invisible copy that only holds the box's height — no test ids, no read-aloud button. */
function DoneBoxBody({ note, ghost = false }: { note: string | null; ghost?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 px-fl-10-16 py-fl-6-12">
      <div className="flex-1 min-w-0 flex flex-col gap-1 text-emerald-800 dark:text-emerald-200">
        {note && <p className="text-[17px] font-black leading-snug">{note}</p>}
        <p className="text-base font-bold leading-relaxed" data-testid={ghost ? undefined : 'proceed-sentence'}>
          {PROCEED_SENTENCE_HE.before} <ProceedChip ghost={ghost} /> {PROCEED_SENTENCE_HE.after}
        </p>
      </div>
      {/* PRD Module 7: what the box says is read aloud on the child's click only. */}
      {ghost ? <span className="shrink-0 w-11 h-11" /> : <UdlSpeechButton text={note ? `${note} ${proceedSentenceHe()}` : proceedSentenceHe()} className="shrink-0" />}
    </div>
  );
}

/** A small, non-interactive copy of the top bar's "ממשיכים" (WorkspaceTopbar): same colour, radius and arrow. */
function ProceedChip({ ghost = false }: { ghost?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle rounded-xl bg-ws-accent text-white font-display font-extrabold text-sm px-2.5 py-0.5" data-testid={ghost ? undefined : 'proceed-chip'}>
      {PROCEED_HE}
      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
    </span>
  );
}
