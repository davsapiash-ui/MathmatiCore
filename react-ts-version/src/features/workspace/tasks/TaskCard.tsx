import type { CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore, selectStandardTask, effectiveArithmetic } from '@/application/useWorkspaceStore';
import { currentTaskLabelHe } from '@/application/taskLabel';
import { taskPositionLabelHe } from '@/core/taskPositionLabel';
import { getCurrentQTask, getEffectiveNumber, isSubtaskActive } from '@/core/qmatrixFlow';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
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
import { MathText } from './MathText';

/**
 * כרטיס המשימה — כותרת, הוראה (עם הקראה), וגוף דינמי לפי סוג המשימה והשלב.
 * UDL: ריבוי אמצעי ייצוג — טקסט + הקראה + ייצוג חזותי.
 */
/** An instruction longer than this gets the closer line spacing (one exercise today: s6_r_t7). */
const LONG_INSTRUCTION_CHARS = 300;

export function TaskCard() {
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const isASD = useWorkspaceStore((s) => s.isASD);
  const qflow = useWorkspaceStore((s) => s.qflow);
  const standardTask = useWorkspaceStore(selectStandardTask);
  const standardTaskIdx = useWorkspaceStore((s) => s.standardTaskIdx);
  // The coaching card takes a column of its own, so the task column narrows
  // and the instruction wraps to more lines; in stations 5–6 the result row
  // of the vertical exercise fell below the card (UX audit 1.10.2026: 8px at
  // 1280×585, 38px at 1024×694). While the card is open the notebook squares
  // are a little smaller (--ws-cell, index.css), so the result row stays in view.
  const coachingOpen = useWorkspaceStore((s) => s.helpState === 'socratic');

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

  // Layout (owner, 27.9.2026): the result row is in view without scrolling on
  // a 1024×768, 1280×720, 1366×768 or 1536×864 laptop. Top to bottom: the
  // station and position, the instruction, the number or the exercise, the
  // result row, and only then a checklist or other extra content. The column
  // is a flex column whose paddings, gaps and big number grow and shrink with
  // the window's height (`fl-*` in tailwind.config.js, `--ws-cell`), with no
  // step at any screen size (owner, 28.9.2026). The card itself still scrolls
  // as a last resort, so nothing is ever out of reach. Meeting 2 has no board:
  // its card is the whole screen, centred, with the same sizes.
  return (
    <AccessibleCard id="tour-task-card" className="flex-1 min-w-0 min-h-0 p-fl-12-32 overflow-y-auto relative border-none rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/95 dark:bg-slate-900/95" style={coachingOpen ? ({ ['--ws-cell']: 'clamp(36px, min(6.2vh, 4.4vw), 64px)' } as CSSProperties) : undefined}>
      {/* Soft decorative corner glow — warmth without noise */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 w-56 h-56 pointer-events-none rounded-full opacity-70"
        style={{ background: 'radial-gradient(closest-side, hsl(var(--ws-blue-soft)), transparent)' }}
      />
      {/* The feedback, over this column's heading only: not over the board,
          the coaching card or the exercise (report row 1.15). Meetings 2 and 8
          keep the page's floating one. */}
      {sessionNumber !== 2 && sessionNumber !== 8 && <FeedbackToast placement="inline" />}
      <motion.div key={taskKey} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="relative flex flex-col flex-1 min-h-0" data-testid="task-column">
        {qflow.phase !== 'correction' && (
          <span className="self-start shrink-0 inline-flex items-center gap-1.5 text-sm font-display font-extrabold text-ws-accent bg-ws-accentSoft rounded-full px-3.5 py-fl-4-6 mb-fl-6-12 shadow-[0_2px_6px_-2px_hsl(var(--ws-accent)/0.35)]">
            <span aria-hidden="true">✦</span> תחנה {sessionNumber}
          </span>
        )}
        <h1 className="shrink-0 font-display font-black text-fl-22-34 text-ws-ink mb-fl-6-16 leading-[1.15]">
          {positionLabel}
        </h1>

        {instruction && (
          <div
            className="shrink-0 flex items-start gap-3 mb-fl-6-24 rounded-2xl px-fl-12-16 pr-fl-14-20 py-fl-6-16 border-r-4"
            style={{ backgroundColor: 'hsl(var(--ws-blue-soft) / 0.55)', borderColor: 'hsl(var(--ws-blue) / 0.55)' }}
          >
            {/* The longest instruction (400 − 156, station 6: over 300 characters)
                wraps to nine lines in the task column of a 1024px tablet, and the
                vertical exercise under it fell 12px short of the card (UX audit,
                4.10.2026). Its lines sit a little closer; the size of the text
                and every other instruction are unchanged. */}
            <p className={`text-fl-16-20 text-ws-ink/85 font-medium ${instruction.length > LONG_INSTRUCTION_CHARS ? 'leading-[1.4]' : 'leading-[1.55]'} flex-1 whitespace-pre-line`} data-testid="task-instruction"><MathText text={instruction} /></p>
            <UdlSpeechButton text={instruction} />
          </div>
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
                {/* 1. קריאה וכתיבה של מספר תלת-ספרתי */}
                {qTask.type === 'place_value_zero' && (
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
    </AccessibleCard>
  );
}

