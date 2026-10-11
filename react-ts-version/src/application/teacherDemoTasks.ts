import type { SessionTask } from '@/data/sessionTasks';
import type { DemoStation, TeacherDemoPart } from '@/data/teacherDemos';

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

/** The id of station 1's demonstration task (STATION1_DEMO_TASK). */
export const STATION1_DEMO_TASK_ID = 's1_demo_tools';

/**
 * Station 1 has no demonstration exercise, and its example card is never
 * about a learner's exercise (owner, 11.10.2026 — it used to be the target
 * task, 347). The card is about this demonstration of the tools instead: no
 * number, in no bank, checked and recorded by nothing. On the empty board its
 * static card is the learners' "build first" card
 * (useWorkspaceStore.demoStaticCoachingCard).
 */
export const STATION1_DEMO_TASK: SessionTask = {
  id: STATION1_DEMO_TASK_ID,
  type: 'representation',
  titleHe: 'מכירים את הכלים',
  instructionHe: 'בנו בבית המספרים מספר בעזרת לבני הדינס.',
};

/**
 * "דוגמה לכרטיס החניכה" (owner, 11.10.2026): the exercise the example card is
 * about — the demonstration on the screen, or station 1's tools demonstration.
 * The card itself is the learner's: asked of the engine about this exercise
 * and the board as it is now, with the static card of that board as its
 * fallback (useWorkspaceStore.openDemoCoachingCard).
 */
export function demoCoachingTask(station: 1 | DemoStation, part: TeacherDemoPart | null): SessionTask | undefined {
  if (station === 1 || part === null) return STATION1_DEMO_TASK;
  return demoSessionTask(station, part);
}
