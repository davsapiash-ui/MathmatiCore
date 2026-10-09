import type { CSSProperties } from 'react';
import { digitAt, type Place } from '@/core/placeValue';
import { resultBoxCount } from '@/core/placeCues';
import type { DemoStation, TeacherDemoPart } from '@/data/teacherDemos';
import { AccessibleCard } from '@/presentation/design-system/AccessibleCard';
import { MathText } from './MathText';
import { RepresentationAnswerBox } from './RepresentationTask';
import { TASK_CARD_CELL } from './TaskCard';
import { TaskZoneHeader } from './TaskZone';
import { VerticalAdditionTask } from './VerticalAdditionTask';

/**
 * The task card of the teacher's demonstration (PRD Module 15 §ג): the card as
 * the learners see it — the heading with the topic, the instruction, the
 * exercise (the vertical sheet with its memory circles and result row, or the
 * one result box) — in demo mode (projectorBoard in the workspace store).
 *
 * What the learner's card adds and this one leaves out on purpose: the feedback
 * toast, the steps and their ticks, the done box and "ממשיכים", and every
 * read-aloud button (the teacher's screens have no narration — AGENTS.md,
 * Module 24). Nothing here checks what she writes.
 */
export function DemoTaskCard({ station, part }: { station: DemoStation; part: TeacherDemoPart }) {
  const { body } = part;
  return (
    <AccessibleCard
      className="flex-1 min-w-0 min-h-0 p-fl-12-32 overflow-hidden relative border-none rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/95 dark:bg-slate-900/95"
      style={{ ['--ws-cell']: TASK_CARD_CELL } as CSSProperties}
      data-testid="demo-task-card"
    >
      <div className="relative flex flex-col flex-1 min-h-0 h-full">
        <TaskZoneHeader stationNumber={station} positionLabel="הדגמה" topic={part.topicHe} showStation />
        <div
          className="shrink-0 mb-fl-6-24 rounded-2xl border border-ws-surface2 px-fl-12-16 py-fl-6-16"
          style={{ backgroundColor: 'hsl(var(--ws-blue-soft) / 0.35)' }}
          data-testid="demo-instruction"
        >
          <p className="max-w-[60ch] text-fl-16-20 text-ws-ink font-medium leading-snug">
            <MathText text={part.instructionHe} />
          </p>
        </div>

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
        ) : (
          <RepresentationAnswerBox key={part.id} />
        )}
      </div>
    </AccessibleCard>
  );
}
