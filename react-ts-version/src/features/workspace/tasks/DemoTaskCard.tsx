import { digitAt, type Place } from '@/core/placeValue';
import { resultBoxCount } from '@/core/placeCues';
import { taskGuide, type TaskGuide } from '@/core/taskGuide';
import { demoSessionTask } from '@/application/teacherDemoTasks';
import type { DemoStation, TeacherDemoPart } from '@/data/teacherDemos';
import { RepresentationAnswerBox, ResultRowBoxes } from './RepresentationTask';
import { SmallChangeTask } from './SmallChangeTask';
import { TASK_COLUMN_CLASS, TaskCardFrame } from './TaskCard';
import { GuideBlock, TaskZoneHeader, type StepView } from './TaskZone';
import { VerticalAdditionTask } from './VerticalAdditionTask';

/**
 * The demonstration as the learners' task zone reads an exercise: its
 * instruction laid out by the learners' own guide (core/taskGuide.ts) — the
 * goal line, "מה עושים:" and the steps with their condition lines — under the
 * demonstration's topic. The words are the demonstration's instruction,
 * unchanged; only their layout is the learners'.
 */
export function demoGuide(station: DemoStation, part: TeacherDemoPart): TaskGuide | null {
  const guide = taskGuide(demoSessionTask(station, part), station);
  return guide && { ...guide, topicHe: part.topicHe };
}

/**
 * The task card of the teacher's demonstration (PRD Module 15 §ג): "אגף המשימה
 * והמענה כמו שהלומדים רואים אותו". It is built from the learner's own parts —
 * the card's frame (TaskCardFrame), the topic heading, the guide block with
 * its steps, the vertical sheet with its memory circles and result row, the
 * one result box, the choice exercise — so a design change to the learner's
 * screen reaches it.
 *
 * In demo mode (projectorBoard in the workspace store) the learner's card
 * loses what judges or narrates, and nothing takes its place: no "משימה N
 * מתוך M" (the heading is the topic alone), no step marking (every step is
 * drawn as one still to do), no done box and no "ממשיכים", no feedback, and
 * no read-aloud button (the page turns narration off — NarrationContext;
 * AGENTS.md, Module 24). Nothing here checks what she writes.
 *
 * The id is the learner card's, so the coaching card's drawer
 * (TaskZoneDrawerSlot) finds the card the same way on both screens.
 */
export function DemoTaskCard({ station, part }: { station: DemoStation; part: TeacherDemoPart }) {
  const { body } = part;
  const guide = demoGuide(station, part);
  const steps: StepView[] = (guide?.steps ?? []).map((s) => ({ label: s.label, subs: s.subs, state: 'todo' }));
  return (
    <TaskCardFrame id="tour-task-card" testId="demo-task-card">
      <div className={TASK_COLUMN_CLASS} data-testid="task-column">
        <TaskZoneHeader stationNumber={station} positionLabel={null} topic={part.topicHe} showStation />
        <GuideBlock goal={guide?.goalHe ?? null} steps={steps} speech={null} done={false} doneNote={null} lockHeight noDoneBox />

        {body.kind === 'vertical' ? (
          <VerticalAdditionTask
            key={part.id}
            numberA={body.a}
            numberB={body.b}
            isSubtraction={body.isSubtraction}
            answerLength={resultBoxCount(station, body.a, body.b, body.answer)}
            hiddenA={body.hiddenA}
            revealedResult={Object.fromEntries(
              (body.revealedResult ?? []).map((p: Place) => [p, String(digitAt(body.answer, p))])
            )}
          />
        ) : body.kind === 'choice' ? (
          <SmallChangeTask key={part.id} givenHe={body.givenHe} questionHe={body.questionHe} choices={body.choices} />
        ) : (
          <RepresentationAnswerBox key={part.id} />
        )}
      </div>
    </TaskCardFrame>
  );
}

/** Station 1 in the 1,000 range: hundreds, tens, units. */
const STATION1_PLACES: Place[] = ['hundreds', 'tens', 'units'];

/**
 * Station 1's demonstration (owner, 9.10.2026): the tools, beside an empty
 * number house — the learner's task card with the station tag and the result
 * row as station 1 draws it (a box per column, in its colour and with its
 * name), so the teacher points at the row itself. No exercise, no
 * instruction: the teacher says what to do.
 */
export function DemoStation1Card() {
  return (
    <TaskCardFrame id="tour-task-card" testId="demo-task-card">
      <div className={TASK_COLUMN_CLASS} data-testid="task-column">
        <TaskZoneHeader stationNumber={1} positionLabel={null} topic={null} showStation />
        <ResultRowBoxes places={STATION1_PLACES} />
      </div>
    </TaskCardFrame>
  );
}
