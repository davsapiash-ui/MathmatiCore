import type { CSSProperties, ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotionConfig } from 'framer-motion';
import { useWorkspaceStore, selectStandardTask, effectiveArithmetic } from '@/application/useWorkspaceStore';
import { currentTaskLabelHe } from '@/application/taskLabel';
import { taskPositionLabelHe } from '@/core/taskPositionLabel';
import { getCurrentQTask, getEffectiveNumber, isSubtaskActive } from '@/core/qmatrixFlow';
import { hasOneDiagnosticAnswerBox } from '@/core/QMatrix';
import { AccessibleCard } from '@/presentation/design-system/AccessibleCard';
import { IntroTask } from './IntroTask';
import { VerticalAdditionTask } from './VerticalAdditionTask';
import { MissingElementTask } from './MissingElementTask';
import { FlexibleDecompTask } from './FlexibleDecompTask';
import { RepresentationTask } from './RepresentationTask';
import { digitAt, type Place } from '@/core/placeValue';
import { resultBoxCount } from '@/core/placeCues';
import { SmallChangeTask } from './SmallChangeTask';
import { BackwardDiagnosisView } from './BackwardDiagnosisView';

import { PlaceValueInputBoxes } from './PlaceValueInputBoxes';
import { UnitBlocksPicture } from './UnitBlocksPicture';
import { FeedbackToast } from '../overlays/FeedbackToast';
import { InstructionBlock, TaskZoneHeader } from './TaskZone';
import { TaskGuideBlock } from './TaskGuideBlock';
import { taskGuide } from '@/core/taskGuide';

/**
 * כרטיס המשימה — כותרת, הוראה (עם הקראה), וגוף דינמי לפי סוג המשימה והשלב.
 * UDL: ריבוי אמצעי ייצוג — טקסט + הקראה + ייצוג חזותי.
 */
/** The notebook square inside the task card (design spec §2.5). */
// …and no wider than 1/8.2 of the task zone after the card's paddings (a
// 4-digit sheet is seven squares across, with room to spare): the zone is a size
// container (.task-zone-cells, StudentWorkspacePage), so 100cqi is the zone's
// width; with no container (stations 2 and 8) it is the window's, and never binds.
// Station 1's vertical exercises (61 − 24, 806 − 351) under their guide block
// needed 13-17px more at 1280x585 and 1024x694 in the 40% zone: the square
// goes down to 32px there (UX audit, 9.10.2026).
export const TASK_CARD_CELL = 'clamp(32px, min(5.8vh, 4.4vw, calc((100cqi - 96px) / 8.2)), 64px)';

/** The column inside the card: heading, guide, work area, top to bottom. */
export const TASK_COLUMN_CLASS = 'relative flex flex-col flex-1 min-h-0';

/**
 * The task card itself — its surface, radius, shadow, paddings and notebook
 * square. One frame for the learner's card and for the teacher's
 * demonstration (DemoTaskCard, PRD Module 15 §ג: "כמו שהלומדים רואים אותו"),
 * so a design change here reaches both.
 */
export function TaskCardFrame({ children, id, testId }: { children: ReactNode; id?: string; testId?: string }) {
  return (
    <AccessibleCard
      id={id}
      data-testid={testId}
      className="flex-1 min-w-0 min-h-0 p-fl-12-32 overflow-y-auto relative border-none rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/95 dark:bg-slate-900/95"
      style={{ ['--ws-cell']: TASK_CARD_CELL } as CSSProperties}
    >
      {children}
    </AccessibleCard>
  );
}

export function TaskCard() {
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const isASD = useWorkspaceStore((s) => s.isASD);
  const qflow = useWorkspaceStore((s) => s.qflow);
  const standardTask = useWorkspaceStore(selectStandardTask);
  const standardTaskIdx = useWorkspaceStore((s) => s.standardTaskIdx);
  // The notebook squares of the task card (--ws-cell, index.css) are a little
  // smaller than the board's: the guide (goal and steps) sits above the
  // exercise, and the result row stays in view at 1280×585 and 1024×694
  // (design spec §2.5, owner 8.10.2026; until then only while the coaching
  // card was open — UX audit 1.10.2026).
  const reduceMotion = useReducedMotionConfig();

  const qTask = sessionNumber === 2 ? getCurrentQTask(qflow) : null;
  const subtask = sessionNumber === 2 && isSubtaskActive(qflow);

  // The child reads where it is in the meeting, never the exercise's title —
  // the titles are the teacher's professional names (owner, 27.9.2026).
  // Read, not subscribed: getActiveTasks builds a new list on every call, and
  // the card already re-renders whenever the exercise (standardTask) changes.
  // The chat's help messages name the exercise with the same label.
  const positionLabel = currentTaskLabelHe(useWorkspaceStore.getState()) ?? taskPositionLabelHe({ sessionNumber, position: null, total: 0 });
  let instruction = subtask
    ? ''
    : qTask
      ? (qflow.phase === 'correction' && qTask.retryInstructionHe) || qTask.instructionHe
      : standardTask?.instructionHe ?? '';
  
  if (instruction.includes('{{number}}')) {
    const effNum = qTask ? getEffectiveNumber(qTask, qflow, isASD) : (isASD && standardTask?.asdNumberA !== undefined ? standardTask.asdNumberA : standardTask?.numberA);
    if (effNum !== undefined) {
      instruction = instruction.replace('{{number}}', effNum.toString());
    }
  }

  const taskKey = `${sessionNumber}-${qTask?.id ?? standardTask?.id ?? ''}-${subtask ? 'sub' : qflow.subphase}-${standardTaskIdx}`;

  // The task zone (design-task-zone; owner, 8.10.2026): one heading line —
  // the position and, in stations 1 and 3–7, the topic — then the guide (goal,
  // steps, done box) and the work area under it (TaskZone.tsx). Stations 2 and
  // 8 keep the PRD instruction as it is. Sizes grow and shrink with the
  // window's height (`fl-*` in tailwind.config.js, `--ws-cell`), with no step
  // at any screen size (owner, 28.9.2026); the card still scrolls as a last
  // resort, so nothing is ever out of reach.
  const guide = qTask ? null : taskGuide(standardTask, sessionNumber);
  const heading = guide?.topicHe ? `${positionLabel}: ${guide.topicHe}` : positionLabel;
  return (
    <TaskCardFrame id="tour-task-card">
      {/* The feedback, over this column's heading only: not over the board,
          the coaching card or the exercise (report row 1.15). Meetings 2 and 8
          keep the page's floating one. */}
      {sessionNumber !== 2 && sessionNumber !== 8 && <FeedbackToast placement="inline" />}
      {/* A new exercise fades in (opacity only, 200 ms; none in quiet mode): no slide, no scale (DESIGN_SYSTEM_RULES 1.3). */}
      <motion.div key={taskKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className={TASK_COLUMN_CLASS} data-testid="task-column">
        <TaskZoneHeader stationNumber={sessionNumber} positionLabel={positionLabel} topic={guide?.topicHe ?? null} showStation={qflow.phase !== 'correction'} />

        {guide && standardTask ? (
          <TaskGuideBlock task={standardTask} guide={guide} positionHeading={heading} />
        ) : instruction && (
          <InstructionBlock
            text={instruction}
          />
        )}

        {/* ── Body ── */}
        {sessionNumber !== 2 && standardTask && (
          <>
            {standardTask.type === 'session1_intro' && <IntroTask task={standardTask} />}
            {(standardTask.type === 'addition_simple' || standardTask.type === 'vertical_addition') &&
              (() => {
                const { a, b, target } = effectiveArithmetic(standardTask, isASD);
                // Skeleton exercises (מסמך 03): result digits the exercise reveals are shown fixed.
                const revealedResult: Partial<Record<Place, string>> = {};
                for (const place of standardTask.revealedResultDigits ?? []) {
                  revealedResult[place] = String(digitAt(target, place));
                }
                return (
                  <VerticalAdditionTask
                    numberA={a}
                    numberB={b}
                    isSubtraction={standardTask.isSubtraction}
                    // Stations 3–7 (owner, 30.9.2026): as many boxes as the longest
                    // number of the exercise, so the row does not tell in advance
                    // that a place vanishes (2,045 − 1,128 = 917 still shows a
                    // thousands box). The board's column focus counts the same boxes.
                    answerLength={resultBoxCount(sessionNumber, a, b, target)}
                    hiddenA={standardTask.hiddenDigits?.a}
                    hiddenB={standardTask.hiddenDigits?.b}
                    revealedResult={revealedResult}
                  />
                );
              })()}
            {standardTask.type === 'flexible_decomp' && (
              <FlexibleDecompTask targetNumber={standardTask.numberA ?? 0} />
            )}
            {standardTask.type === 'representation' && <RepresentationTask task={standardTask} />}

            {standardTask.type === 'small_change' && (
              <SmallChangeTask
                givenHe={standardTask.givenHe ?? ''}
                questionHe={standardTask.questionHe ?? ''}
                choices={standardTask.choices ?? []}
              />
            )}
            {standardTask.type === 'missing_element' && (
              <MissingElementTask
                instructionHe={standardTask.instructionHe}
                numberA={isASD && standardTask.asdNumberA !== undefined ? standardTask.asdNumberA : (standardTask.numberA ?? 0)}
                numberB={isASD && standardTask.asdNumberB !== undefined ? standardTask.asdNumberB : (standardTask.numberB ?? 0)}
                isSubtraction={standardTask.isSubtraction}
              />
            )}
          </>
        )}

        {sessionNumber === 2 && qTask && (
          <AnimatePresence mode="wait">
            {subtask ? (
              <motion.div
                key="subtask-view"
                initial={{ opacity: 0, scale: 0.9, rotateX: 20 }}
                animate={{ opacity: 1, scale: 1, rotateX: 0 }}
                exit={{ opacity: 0, scale: 0.9, rotateX: -20 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="bg-amber-50 dark:bg-amber-900/20 border-4 border-amber-300 rounded-[2rem] p-[clamp(12px,calc(3.4286vh-8.57px),24px)] shadow-xl"
              >
                <BackwardDiagnosisView task={qTask} qflow={qflow} isASD={isASD} />
              </motion.div>
            ) : (
              <motion.div
                key="primary-view"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-4"
              >
                {/* 1. קריאה וכתיבה של מספר תלת-ספרתי — one free answer box for
                    every learner, like task 2 (owner, 4.10.2026): no headings,
                    no place colours, no box per digit. Three boxes prevented
                    the errors the task is there to catch (65, 6005). */}
                {qTask.type !== 'digit_value' && hasOneDiagnosticAnswerBox(qTask) && (
                  <PlaceValueInputBoxes mode="single_value" givenText={qTask.givenHe} />
                )}
                {qTask.type === 'place_value_zero' && !hasOneDiagnosticAnswerBox(qTask) && (
                  <PlaceValueInputBoxes
                    mode="three_digits"
                    givenText={qTask.givenHe}
                    labels={{ hundreds: 'מאות', tens: 'עשרות', units: 'יחידות' }}
                  />
                )}

                {/* 2. זיהוי וייצוג ערך ספרה */}
                {qTask.type === 'digit_value' && (
                  <PlaceValueInputBoxes
                    mode="single_value"
                    highlightNumber={String(qTask.number ?? 742)}
                    highlightIndex={qTask.highlightIndex ?? 1}
                  />
                )}

                {/* 4. פירוק מספר תלת-ספרתי לרכיביו */}
                {qTask.type === 'number_breakdown' && (
                  <PlaceValueInputBoxes
                    mode="three_digits"
                    givenText={qTask.givenHe}
                    labels={{ hundreds: 'מאות', tens: 'עשרות', units: 'יחידות' }}
                  />
                )}

                {/* 5. המרה עצמאית בין עזרים וירטואליים — the blocks are the
                    question: a still picture for every learner (owner, 27.9.2026). */}
                {qTask.type === 'conversion' && (
                  <PlaceValueInputBoxes
                    mode="two_digits"
                    givenText={qTask.pictureUnitBlocks === undefined ? qTask.givenHe : undefined}
                    labels={{ tens: 'עשרות', units: 'יחידות' }}
                  >
                    {qTask.pictureUnitBlocks !== undefined && (
                      <UnitBlocksPicture count={qTask.pictureUnitBlocks} />
                    )}
                  </PlaceValueInputBoxes>
                )}

                {/* 3, 6, 7. חישוב במאונך (חיבור או חיסור) */}
                {qTask.type === 'vertical_addition' && (
                  <VerticalAdditionTask
                    numberA={qTask.numberA ?? 0}
                    numberB={qTask.numberB ?? 0}
                    isSubtraction={qTask.isSubtraction}
                    answerLength={String(Math.abs(qTask.correctAnswer ?? 0)).length}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </TaskCardFrame>
  );
}

