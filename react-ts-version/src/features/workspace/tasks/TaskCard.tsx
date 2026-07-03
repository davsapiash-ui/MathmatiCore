import { motion } from 'framer-motion';
import { useWorkspaceStore, selectStandardTask, effectiveArithmetic } from '@/application/useWorkspaceStore';
import { getCurrentQTask, getEffectiveChoices, getEffectiveNumber, getEffectiveRange, isSubtaskActive } from '@/core/qmatrixFlow';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { IntroTask } from './IntroTask';
import { ChoiceList } from './ChoiceList';
import { VerticalAdditionTask } from './VerticalAdditionTask';
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

  const qTask = sessionNumber === 2 ? getCurrentQTask(qflow) : null;
  const subtask = sessionNumber === 2 && isSubtaskActive(qflow);

  const title = qTask ? qTask.titleHe : standardTask?.titleHe ?? '';
  const instruction = subtask ? '' : qTask ? qTask.instructionHe : standardTask?.instructionHe ?? '';
  const taskKey = `${sessionNumber}-${qTask?.id ?? standardTask?.id ?? ''}-${subtask ? 'sub' : qflow.subphase}-${standardTaskIdx}`;

  return (
    <section id="tour-task-card" className="flex-1 min-w-0 ws-card p-8 overflow-y-auto relative">
      {/* Soft decorative corner glow — warmth without noise */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 w-56 h-56 pointer-events-none rounded-full opacity-70"
        style={{ background: 'radial-gradient(closest-side, hsl(var(--ws-blue-soft)), transparent)' }}
      />
      <motion.div key={taskKey} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="relative">
        <span className="inline-flex items-center gap-1.5 text-sm font-display font-extrabold text-ws-accent bg-ws-accentSoft rounded-full px-3.5 py-1.5 mb-3 shadow-[0_2px_6px_-2px_hsl(var(--ws-accent)/0.35)]">
          <span aria-hidden="true">✦</span> מפגש {sessionNumber}
        </span>
        <h1 className="font-display font-black text-[2.15rem] text-ws-ink mb-4 leading-[1.15]">{title}</h1>

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
                <NumberLineTask
                  range={[0, 100]}
                  showMarkerValue={false}
                />
              </div>
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
                    return <VerticalAdditionTask numberA={a} numberB={b} answerLength={String(Math.abs(target)).length} />;
                  })()}

                {qTask.type === 'small_change' && (
                  <SmallChangeTask givenHe={qTask.givenHe ?? ''} questionHe={qTask.questionHe ?? ''} choices={qTask.choices ?? []} />
                )}
              </>
            )}
          </>
        )}
      </motion.div>
    </section>
  );
}
