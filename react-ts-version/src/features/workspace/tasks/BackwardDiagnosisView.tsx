import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import type { QMatrixTask } from '@/core/QMatrix';
import type { QMatrixFlowState } from '@/core/qmatrixFlow';
import { getEffectiveChoices, getEffectiveNumber, getEffectiveRange } from '@/core/qmatrixFlow';
import { ChoiceList } from './ChoiceList';
import { NumberLineTask } from './NumberLineTask';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

/**
 * "מעוף הדבורה" — תת-משימת אבחון לאחור: גרסה פשוטה יותר של המשימה שנכשלה.
 * לתלמיד זה נראה כמו עוד משימה רגילה (שקוף לחלוטין, ללא תיוג).
 * Rendering per vanilla renderBackwardDiagnosis (app.js 876–937).
 */
export function BackwardDiagnosisView({ task, qflow, isASD }: { task: QMatrixTask; qflow: QMatrixFlowState; isASD: boolean }) {
  const diag = task.backwardDiagnosis;
  const demoUngroup = useWorkspaceStore((s) => s.demoUngroup);
  const probeAnswer = useWorkspaceStore((s) => s.probeAnswer);
  const setProbeAnswer = useWorkspaceStore((s) => s.setProbeAnswer);

  if (!diag) return null;

  const instruction = diag.subtaskInstructionHe ?? diag.probeInstructionHe ?? '';
  const effNumber = getEffectiveNumber(task, qflow, isASD);
  const effRange = getEffectiveRange(task, qflow, isASD);
  const choices = getEffectiveChoices(task, qflow);

  return (
    <div className="flex flex-col gap-4 mt-2">
      {instruction && (
        <div className="flex items-start gap-3">
          <p className="text-lg font-bold text-ws-ink leading-relaxed flex-1">{instruction}</p>
          {/* UDL: the subtask blanks the top instruction, so audio must live here */}
          <UdlSpeechButton text={instruction} />
        </div>
      )}

      {/* Choice-based subtask (task1: zero as place-holder) */}
      {diag.subtaskChoices && task.type === 'place_value_zero' && (
        <>
          {effNumber !== undefined && (
            <div className="self-center bg-ws-accentSoft rounded-2xl px-8 py-4 border border-ws-accent/30">
              <span className="font-display font-black text-5xl text-ws-accent tabular-nums">{effNumber}</span>
            </div>
          )}
          <ChoiceList choices={choices} />
        </>
      )}

      {/* Shorter number line (task2) */}
      {task.type === 'number_line' && effRange && (
        <NumberLineTask range={effRange} showMarkerValue={false} asdAnchors={isASD ? diag.asdAnchors : undefined} />
      )}

      {/* Guided decomposition demo (task3) */}
      {diag.showAutoUngroup && task.type === 'flexible_decomp' && (
        <div className="flex flex-col items-center gap-4">
          {effNumber !== undefined && (
            <div className="self-center bg-ws-accentSoft rounded-2xl px-8 py-4 border border-ws-accent/30">
              <span className="font-display font-black text-5xl text-ws-accent tabular-nums">{effNumber}</span>
            </div>
          )}
          <button
            onClick={demoUngroup}
            className="h-11 px-6 rounded-full font-display font-bold text-white bg-ws-accent shadow-md hover:brightness-105 active:scale-95 transition-all"
          >
            הדגם פריטה: עשרת ← 10 יחידות
          </button>
          <p className="text-sm text-ws-soft">אחרי ההדגמה, בנו את המספר בדרך חדשה ולחצו "הוסף ייצוג".</p>
        </div>
      )}

      {/* Fact-vs-procedure probe (task4) */}
      {diag.probeA !== undefined && task.type === 'vertical_addition' && (
        <div className="flex flex-col items-center gap-4">
          {isASD && diag.graphicOrganizerASD ? (
            /* ASD: graphic organizer instead of long text — cubes row */
            <div className="flex items-center gap-4 bg-ws-surface2/50 rounded-2xl p-5" dir="ltr" aria-label={`${diag.probeA} ועוד ${diag.probeB}`}>
              <div className="flex gap-1">
                {Array.from({ length: diag.probeA }).map((_, i) => (
                  <span key={i} className="w-6 h-6 rounded bg-block-unit inline-block" />
                ))}
              </div>
              <span className="font-display font-black text-3xl text-ws-ink">+</span>
              <div className="flex gap-1">
                {Array.from({ length: diag.probeB ?? 0 }).map((_, i) => (
                  <span key={i} className="w-6 h-6 rounded bg-block-hundred inline-block" />
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-ws-surface2/50 rounded-2xl px-8 py-4">
              <span className="font-mono font-black text-4xl text-ws-ink tabular-nums" dir="ltr" aria-label={`תרגיל: ${diag.probeA} פלוס ${diag.probeB} שווה כמה`}>
                <InlineMath math={`${diag.probeA} + ${diag.probeB} = ?`} />
              </span>
            </div>
          )}
          <input
            type="text"
            inputMode="numeric"
            maxLength={3}
            value={probeAnswer}
            onChange={(e) => setProbeAnswer(e.target.value.replace(/[^0-9]/g, ''))}
            aria-label="תשובה"
            className="w-24 h-16 rounded-xl border-2 border-ws-accent text-center font-mono font-black text-4xl bg-ws-surface focus:outline-none focus:ring-2"
          />
          {/* UDL Alternative Expression: Upload Draft */}
          <div className="mt-2 flex justify-center w-full">
            <label className="cursor-pointer text-sm font-bold text-ws-accent hover:text-ws-ink transition-colors flex items-center gap-2 bg-ws-surface px-4 py-2 rounded-xl shadow-sm border border-ws-ink/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              העלה פתרון כתוב (תמונה)
              <input type="file" className="hidden" accept="image/*" aria-label="העלה פתרון כתמונה" onChange={() => alert("הפתרון הועלה בהצלחה למורה.")} />
            </label>
          </div>
        </div>
      )}

      {/* Flexibility-trap visual hint (q5) */}
      {diag.visualHint && task.type === 'small_change' && (
        <div className="flex flex-col gap-4">
          <div className="bg-ws-accentSoft/60 border border-ws-accent/25 rounded-2xl p-5">
            <p className="font-bold text-ws-ink leading-relaxed">💡 {diag.hintHe}</p>
          </div>
          {task.givenHe && (
            <div className="self-center bg-ws-surface2/60 rounded-2xl px-8 py-3">
              <span className="font-mono font-black text-3xl tabular-nums" dir="ltr">{task.givenHe}</span>
            </div>
          )}
          {task.questionHe && <p className="text-xl font-bold text-center">{task.questionHe}</p>}
          <ChoiceList choices={task.choices ?? []} />
        </div>
      )}
    </div>
  );
}
