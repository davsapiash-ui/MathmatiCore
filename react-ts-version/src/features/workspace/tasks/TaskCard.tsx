import { motion } from 'framer-motion';
import { useWorkspaceStore, selectStandardTask } from '@/application/useWorkspaceStore';
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
    <section className="flex-1 min-w-0 bg-ws-surface rounded-3xl shadow-lg border border-ws-surface2 p-8 overflow-y-auto relative">
      <motion.div key={taskKey} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <p className="text-xs font-bold text-ws-accent uppercase tracking-widest mb-2">מפגש {sessionNumber}</p>
        <h1 className="font-display font-black text-3xl text-ws-ink mb-3 leading-snug">{title}</h1>

        {instruction && (
          <div className="flex items-start gap-2 mb-4">
            <p className="text-xl text-ws-soft font-medium leading-relaxed flex-1">{instruction}</p>
            <UdlSpeechButton text={instruction} />
          </div>
        )}

        {/* ── Body ── */}
        {sessionNumber !== 2 && standardTask && (
          <>
            {standardTask.type === 'session1_intro' && <IntroTask task={standardTask} />}
            {(standardTask.type === 'addition_simple' || standardTask.type === 'vertical_addition') && (
              <VerticalAdditionTask
                numberA={(isASD && standardTask.asdNumberA) || standardTask.numberA!}
                numberB={(isASD && standardTask.asdNumberB) || standardTask.numberB!}
                isSubtraction={standardTask.isSubtraction}
                answerLength={String(standardTask.correctAnswer).length}
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

                {qTask.type === 'vertical_addition' && (
                  <VerticalAdditionTask
                    numberA={(isASD && qTask.asdNumberA) || qTask.numberA!}
                    numberB={(isASD && qTask.asdNumberB) || qTask.numberB!}
                    answerLength={String(isASD && qTask.asdCorrectAnswer !== undefined ? qTask.asdCorrectAnswer : qTask.correctAnswer).length}
                  />
                )}

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
