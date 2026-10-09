import type { SessionTask } from '@/data/sessionTasks';
import { SESSION1_TASKS } from '@/data/sessionTasks';
import type { DemoStation, TeacherDemoPart } from '@/data/teacherDemos';
import { EMPTY_COUNTS, type PlaceCounts } from '@/core/placeValue';
import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';

/**
 * A demonstration (data/teacherDemos.ts) as the learners' code reads an
 * exercise, so the demonstration screen can use the learners' own guide
 * (core/taskGuide.ts) and coaching cards (SocraticEngine) for it. Never a
 * learner exercise: it is in no bank and nothing checks or records it. The id
 * starts with the station ("s4_…") because the static cards read the station
 * from it.
 */
export function demoSessionTask(station: DemoStation, part: TeacherDemoPart): SessionTask {
  const { body } = part;
  const base = { id: `s${station}_${part.id}`, titleHe: part.topicHe, instructionHe: part.instructionHe };
  if (body.kind === 'vertical') {
    return {
      ...base,
      type: 'vertical_addition',
      numberA: body.a,
      numberB: body.b,
      isSubtraction: body.isSubtraction,
      correctAnswer: body.answer,
      ...(body.isSubtraction ? { requiresUngrouping: true } : { requiresGrouping: true }),
      ...(body.hiddenA ? { hiddenDigits: { a: body.hiddenA } } : {}),
      ...(body.revealedResult ? { revealedResultDigits: body.revealedResult } : {}),
    };
  }
  if (body.kind === 'choice') {
    return {
      ...base,
      type: 'small_change',
      givenHe: body.givenHe,
      questionHe: body.questionHe,
      choices: body.choices,
      correctAnswer: body.choices.find((c) => c.correct)?.id ?? '',
    };
  }
  return { ...base, type: 'representation', numberA: body.answer, correctAnswer: body.answer, requiredCounts: body.finalCounts };
}

/**
 * Station 1 has no demonstration exercise: its example card is the one a
 * learner gets at the station's target task (347) on an empty board — the
 * board the teacher's station 1 opens with.
 */
const STATION1_CARD_TASK_ID = 's1_target_347';

/**
 * "דוגמה לכרטיס החניכה": the static coaching card a learner gets for this
 * exercise and board after 45 seconds without a step (Module 12) — the
 * engine's own static card, never an AI call. The same card every time.
 */
export function demoCoachingCard(station: 1 | DemoStation, part: TeacherDemoPart | null): SocraticHintResponse {
  if (station === 1 || part === null) {
    const task = SESSION1_TASKS.find((t) => t.id === STATION1_CARD_TASK_ID);
    return SocraticEngine.getSynchronousTaskHint(task, { ...EMPTY_COUNTS }, { trigger: 'hesitation_45s' });
  }
  const counts: PlaceCounts = { ...EMPTY_COUNTS, ...part.coachingBoard };
  return SocraticEngine.getSynchronousTaskHint(demoSessionTask(station, part), counts, { trigger: 'hesitation_45s' });
}
