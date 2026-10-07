import type { CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore, selectStandardTask, effectiveArithmetic, activeSuccessHold } from '@/application/useWorkspaceStore';
import { useSuccessHoldReminder } from '../useSuccessHoldReminder';
import { PROCEED_HE } from '@/core/toolbarNames';
import { currentTaskLabelHe } from '@/application/taskLabel';
import { taskPositionLabelHe } from '@/core/taskPositionLabel';
import { stationNameHe } from '@/core/stationNames';
import { getCurrentQTask, getEffectiveNumber, isSubtaskActive } from '@/core/qmatrixFlow';
import { hasOneDiagnosticAnswerBox } from '@/core/QMatrix';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { AccessibleCard } from '@/presentation/design-system/AccessibleCard';
import { IntroTask } from './IntroTask';
import { IntroStepSheet, hasIntroSheet } from './IntroStepSheet';
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
import { instructionLayout } from '@/core/instructionSteps';
import { isBuildStep, MARK_BUILT_HE, MARK_BUILT_ARIA_HE, MARK_BUILT_MARKED_ARIA_HE } from '@/core/buildStep';

/**
 * כרטיס המשימה — כותרת, הוראה (עם הקראה), וגוף דינמי לפי סוג המשימה והשלב.
 * UDL: ריבוי אמצעי ייצוג — טקסט + הקראה + ייצוג חזותי.
 */
/** An instruction longer than this gets the closer line spacing (one exercise today: s6_r_t7). */
const LONG_INSTRUCTION_CHARS = 300;
/** …instead of the 1.55 of every other instruction. */
const LONG_INSTRUCTION_LEADING = 1.4;

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

  // A solved exercise held on the screen (owner, 7.10.2026): the instruction
  // gives way to why the answer is right, until "ממשיכים".
  const hold = useWorkspaceStore((s) => activeSuccessHold(s));
  const markedSteps = useWorkspaceStore((s) => s.markedSteps);
  const toggleStepMark = useWorkspaceStore((s) => s.toggleStepMark);
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
          <span data-testid="task-station-chip" className="self-start shrink-0 max-w-full inline-flex items-center gap-1.5 text-sm font-display font-extrabold text-ws-accent bg-ws-accentSoft rounded-full px-3.5 py-fl-4-6 mb-fl-6-12 shadow-[0_2px_6px_-2px_hsl(var(--ws-accent)/0.35)]">
            {/* The station always with its name (owner, 7.10.2026): the name
                the child met on the lobby card, the one the teacher says. */}
            <span aria-hidden="true">✦</span> {stationNameHe(sessionNumber) ? `תחנה ${sessionNumber}: ${stationNameHe(sessionNumber)}` : `תחנה ${sessionNumber}`}
          </span>
        )}
        <h1 className="shrink-0 font-display font-black text-fl-22-34 text-ws-ink mb-fl-6-16 leading-[1.15]">
          {positionLabel}
        </h1>

        {hold && <SuccessPanel explanationHe={hold.explanationHe} />}
        {/* Meeting 1's tool steps have a sheet of their own (IntroStepSheet):
            a welcome, one explanation, one instruction and a picture of the
            move — not the exercise sheet's task-and-steps shape. */}
        {standardTask && hasIntroSheet(standardTask.id) && !hold && (
          <IntroStepSheet taskId={standardTask.id} instructionHe={instruction} />
        )}
        {instruction && !hold && !(standardTask && hasIntroSheet(standardTask.id)) && (() => {
          // The task, then its steps (core/instructionSteps.ts; owner,
          // 7.10.2026): the same agreed words, shaped so a third grader can
          // hold them — the first sentence is what the exercise is, the rest
          // are numbered in the order they are done, with air between them.
          // One sentence stays one sentence. The read-aloud reads it all.
          const { lead, steps } = instructionLayout(instruction);
          // The mark beside a build sentence (core/buildStep.ts): index 0 is
          // the lead, 1… the steps. The child's own "בניתי", never checked.
          const markButton = (index: number, text: string) => {
            const marked = markedSteps.includes(index);
            return (
              <button
                type="button"
                onClick={() => toggleStepMark(index, text)}
                aria-pressed={marked}
                aria-label={marked ? MARK_BUILT_MARKED_ARIA_HE : MARK_BUILT_ARIA_HE}
                data-testid={`mark-step-${index}`}
                className={`shrink-0 mt-[0.1em] inline-flex items-center gap-1.5 rounded-xl border-2 px-2.5 py-1 text-sm font-bold transition-colors cursor-pointer ${
                  marked ? 'border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100' : 'border-slate-300 bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <span aria-hidden="true">{MARK_BUILT_HE}</span>
                <span aria-hidden="true" className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] leading-none ${marked ? 'bg-slate-500 border-slate-500 text-white' : 'border-slate-400'}`}>{marked ? '✓' : ''}</span>
              </button>
            );
          };
          return (
          <div
            className="shrink-0 flex items-start gap-3 mb-fl-6-24 rounded-2xl px-fl-12-16 pr-fl-14-20 py-fl-6-16 border-r-4"
            data-testid="task-instruction"
            // The longest instruction (400 − 156, station 6: over 300 characters)
            // wraps to nine lines in the task column of a 1024px tablet, and the
            // vertical exercise under it fell 12px short of the card (UX audit,
            // 4.10.2026). Its lines sit a little closer (--instruction-leading,
            // read by the paragraphs below); the size of the text and every
            // other instruction are unchanged.
            style={{
              backgroundColor: 'hsl(var(--ws-blue-soft) / 0.55)',
              borderColor: 'hsl(var(--ws-blue) / 0.55)',
              ...(instruction.length > LONG_INSTRUCTION_CHARS ? { ['--instruction-leading']: LONG_INSTRUCTION_LEADING } : {}),
            } as CSSProperties}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2.5">
                <p className={`flex-1 min-w-0 text-fl-16-20 text-ws-ink/85 font-medium leading-[var(--instruction-leading,1.55)] whitespace-pre-line ${steps.length ? 'font-bold text-ws-ink' : ''}`} data-testid="instruction-lead">
                  <MathText text={lead} />
                </p>
                {isBuildStep(lead) && !hold && markButton(0, lead)}
              </div>
              {steps.length > 0 && (
                <ol className="mt-fl-6-12 flex flex-col gap-fl-4-12" data-testid="instruction-steps">
                  {steps.map((step, i) => {
                    // The mark beside a build step only (core/buildStep.ts):
                    // the child's own "I am done", never checked, never a gate.
                    const build = isBuildStep(step) && !hold;
                    return (
                    <li key={i} className="flex items-start gap-2.5 text-fl-16-20 text-ws-ink/85 font-medium leading-[var(--instruction-leading,1.55)]">
                      <span aria-hidden="true" className="shrink-0 mt-[0.2em] w-6 h-6 rounded-full bg-white dark:bg-slate-800 border-2 border-ws-blue/50 text-ws-blue font-display font-black text-sm leading-none flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 whitespace-pre-line"><MathText text={step} /></span>
                      {build && markButton(i + 1, step)}
                    </li>
                    );
                  })}
                </ol>
              )}
            </div>
            <UdlSpeechButton text={instruction} />
          </div>
          );
        })()}

        {/* ── Body ── */}
        {sessionNumber !== 2 && standardTask && (
          <>
            {standardTask.type === 'session1_intro' && !hasIntroSheet(standardTask.id) && <IntroTask task={standardTask} />}
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
    </AccessibleCard>
  );
}

/**
 * After a correct answer (owner, 7.10.2026): "נכון!" and why — what the child
 * did and what the number house now holds (core/successExplanation.ts) — in
 * the instruction's place, while the solved board and its digits stay on the
 * screen. Read aloud only on the child's click (PRD Module 24). Ten seconds
 * on, one quiet sentence says how to go on; the button itself keeps its
 * fixed place at the top (מסמך 04, עקביות) and gets a ring there.
 */
function SuccessPanel({ explanationHe }: { explanationHe: string }) {
  const reminded = useSuccessHoldReminder();
  const reminderHe = `כשתהיו מוכנים, לחצו על "${PROCEED_HE}".`;
  return (
    <div
      role="status"
      data-testid="success-panel"
      className="shrink-0 mb-fl-6-24 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-fl-12-16 py-fl-6-16 flex items-start gap-3"
    >
      <span aria-hidden="true" className="shrink-0 w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg font-black">✓</span>
      <div className="flex-1 min-w-0">
        <p className="font-display font-black text-fl-16-24 text-emerald-900 dark:text-emerald-100">נכון!</p>
        <p className="text-fl-16-20 text-emerald-950 dark:text-emerald-50 font-medium leading-snug" data-testid="success-explanation">
          <MathText text={explanationHe} />
        </p>
        {reminded && (
          <p className="mt-2 text-sm font-bold text-emerald-800 dark:text-emerald-200" data-testid="success-reminder">
            {reminderHe}
          </p>
        )}
      </div>
      <UdlSpeechButton text={`נכון! ${explanationHe}${reminded ? ` ${reminderHe}` : ''}`} />
    </div>
  );
}
