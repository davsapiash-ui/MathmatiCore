import { motion } from 'framer-motion';
import { useWorkspaceStore, selectStandardTask, effectiveArithmetic } from '@/application/useWorkspaceStore';
import { getCurrentQTask, getEffectiveChoices, getEffectiveNumber, getEffectiveRange, isSubtaskActive } from '@/core/qmatrixFlow';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { AccessibleCard } from '@/presentation/design-system/AccessibleCard';
import { IntroTask } from './IntroTask';
import { ChoiceList } from './ChoiceList';
import { VerticalAdditionTask } from './VerticalAdditionTask';
import { MissingElementTask } from './MissingElementTask';
import { NumberLineTask } from './NumberLineTask';
import { FlexibleDecompTask } from './FlexibleDecompTask';
import { SmallChangeTask } from './SmallChangeTask';
import { BackwardDiagnosisView } from './BackwardDiagnosisView';

/**
 * כרטיס המשימה — כותרת, הוראה (עם הקראה), וגוף דינמי לפי סוג המשימה והשלב.
 * UDL: ריבוי אמצעי ייצוג — טקסט + הקראה + ייצוג חזותי.
 */
export function TaskCard() {
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const isASD = useWorkspaceStore((s) => s.isASD);
  const qflow = useWorkspaceStore((s) => s.qflow);
  const standardTask = useWorkspaceStore(selectStandardTask);
  const standardTaskIdx = useWorkspaceStore((s) => s.standardTaskIdx);
  const numberLineValue = useWorkspaceStore((s) => s.numberLineValue);
  const setNumberLineValue = useWorkspaceStore((s) => s.setNumberLineValue);

  const qTask = sessionNumber === 2 ? getCurrentQTask(qflow) : null;
  const subtask = sessionNumber === 2 && isSubtaskActive(qflow);

  const title = qTask ? qTask.titleHe : standardTask?.titleHe ?? '';
  let instruction = subtask ? '' : qTask ? qTask.instructionHe : standardTask?.instructionHe ?? '';
  
  if (instruction.includes('{{number}}')) {
    const effNum = qTask ? getEffectiveNumber(qTask, qflow, isASD) : (isASD && standardTask?.asdNumberA !== undefined ? standardTask.asdNumberA : standardTask?.numberA);
    if (effNum !== undefined) {
      instruction = instruction.replace('{{number}}', effNum.toString());
    }
  }

  const taskKey = `${sessionNumber}-${qTask?.id ?? standardTask?.id ?? ''}-${subtask ? 'sub' : qflow.subphase}-${standardTaskIdx}`;

  return (
    <AccessibleCard id="tour-task-card" className="flex-1 min-w-0 p-8 overflow-y-auto no-scrollbar relative border-none rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/95">
      {/* Soft decorative corner glow — warmth without noise */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 w-56 h-56 pointer-events-none rounded-full opacity-70"
        style={{ background: 'radial-gradient(closest-side, hsl(var(--ws-blue-soft)), transparent)' }}
      />
      <motion.div key={taskKey} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="relative">
        {qflow.phase !== 'correction' && (
          <span className="inline-flex items-center gap-1.5 text-sm font-display font-extrabold text-ws-accent bg-ws-accentSoft rounded-full px-3.5 py-1.5 mb-3 shadow-[0_2px_6px_-2px_hsl(var(--ws-accent)/0.35)]">
            <span aria-hidden="true">✦</span> מפגש {sessionNumber}
          </span>
        )}
        <h1 className="font-display font-black text-[2.15rem] text-ws-ink mb-4 leading-[1.15]">
          {qflow.phase === 'correction' ? 'משימת צד' : title}
        </h1>

        {instruction && (
          <div
            className="flex items-start gap-3 mb-6 rounded-2xl p-4 pr-5 border-r-4"
            style={{ backgroundColor: 'hsl(var(--ws-blue-soft) / 0.55)', borderColor: 'hsl(var(--ws-blue) / 0.55)' }}
          >
            <p className="text-xl text-ws-ink/85 font-medium leading-relaxed flex-1">{instruction}</p>
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
                return (
                  <VerticalAdditionTask
                    numberA={a}
                    numberB={b}
                    isSubtraction={standardTask.isSubtraction}
                    answerLength={String(Math.abs(target)).length}
                  />
                );
              })()}
            {standardTask.type === 'flexible_decomp' && (
              <FlexibleDecompTask targetNumber={standardTask.numberA ?? 0} />
            )}

            {standardTask.type === 'number_line' && (
              <div className="flex flex-col gap-2">
                <div className="self-center bg-ws-accentSoft rounded-2xl px-8 py-3 border border-ws-accent/30">
                  <span className="font-display font-black text-5xl text-ws-accent tabular-nums">
                    {standardTask.numberA ?? 50}
                  </span>
                </div>
                {sessionNumber === 8 ? (
                  <div className="flex flex-col items-center gap-3 mt-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <label className="text-lg font-bold text-slate-700 dark:text-slate-300">
                      הקלידו את תשובתכם:
                    </label>
                    <input
                      type="number"
                      value={numberLineValue ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        setNumberLineValue(val);
                      }}
                      placeholder="הקלידו מספר..."
                      className="w-48 text-center border-2 border-indigo-500 rounded-xl px-4 py-2 font-display text-2xl font-black focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                ) : (
                  <NumberLineTask
                    range={standardTask.range ?? [0, 100]}
                    showMarkerValue={false}
                  />
                )}
              </div>
            )}

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
                numberA={isASD && standardTask.asdNumberA !== undefined ? standardTask.asdNumberA : standardTask.numberA!}
                numberB={isASD && standardTask.asdNumberB !== undefined ? standardTask.asdNumberB : standardTask.numberB!}
                isSubtraction={standardTask.isSubtraction}
              />
            )}
          </>
        )}

        {sessionNumber === 2 && qTask && (
          <>
            {subtask ? (
              <BackwardDiagnosisView task={qTask} qflow={qflow} isASD={isASD} />
            ) : (
              <>
                {qTask.type === 'place_value_zero' && (
                  <div className="flex flex-col gap-4">
                    <div className="self-center bg-ws-accentSoft rounded-3xl px-10 py-5 border border-ws-accent/30">
                      <span className="font-display font-black text-6xl text-ws-accent tabular-nums">
                        {getEffectiveNumber(qTask, qflow, isASD)}
                      </span>
                    </div>
                    <ChoiceList choices={getEffectiveChoices(qTask, qflow)} />
                  </div>
                )}

                {qTask.type === 'number_line' && (
                  <div className="flex flex-col gap-2">
                    <div className="self-center bg-ws-accentSoft rounded-2xl px-8 py-3 border border-ws-accent/30">
                      <span className="font-display font-black text-5xl text-ws-accent tabular-nums">
                        {getEffectiveNumber(qTask, qflow, isASD)}
                      </span>
                    </div>
                    <NumberLineTask
                      range={getEffectiveRange(qTask, qflow, isASD) ?? [0, 1000]}
                      showMarkerValue={false}
                    />
                  </div>
                )}

                {qTask.type === 'flexible_decomp' && (
                  <FlexibleDecompTask targetNumber={getEffectiveNumber(qTask, qflow, isASD) ?? 0} />
                )}

                {qTask.type === 'vertical_addition' &&
                  (() => {
                    const { a, b, target } = effectiveArithmetic(qTask, isASD);
                    // isSubtraction must flow through — task6 (52−18) rendered "+" without it.
                    return (
                      <VerticalAdditionTask
                        numberA={a}
                        numberB={b}
                        isSubtraction={qTask.isSubtraction}
                        answerLength={String(Math.abs(target)).length}
                      />
                    );
                  })()}

                {qTask.type === 'small_change' && (
                  <SmallChangeTask givenHe={qTask.givenHe ?? ''} questionHe={qTask.questionHe ?? ''} choices={qTask.choices ?? []} />
                )}

                {qTask.type === 'missing_element' && (
                  <MissingElementTask
                    instructionHe={qTask.instructionHe}
                    numberA={isASD && qTask.asdNumberA !== undefined ? qTask.asdNumberA : qTask.numberA!}
                    numberB={isASD && qTask.asdNumberB !== undefined ? qTask.asdNumberB : qTask.numberB!}
                    isSubtraction={qTask.isSubtraction}
                  />
                )}
              </>
            )}
          </>
        )}
      </motion.div>
    </AccessibleCard>
  );
}
