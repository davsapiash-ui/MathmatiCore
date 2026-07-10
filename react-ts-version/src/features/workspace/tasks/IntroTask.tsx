import { ChoiceList } from './ChoiceList';
import type { SessionTask } from '@/data/sessionTasks';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { motion } from 'framer-motion';

/** משימת הפתיחה של מפגש 1 — שאלת חשיבה או משימת חקר בארגז החול. */
export function IntroTask({ task }: { task: SessionTask }) {
  const blocksAddedCount = useWorkspaceStore((s) => s.blocksAddedCount);
  const hasDeletedBlock = useWorkspaceStore((s) => s.hasDeletedBlock);

  // UDL: the densest text on screen gets audio too — question + all choices in one read.
  const speechText = [task.thoughtQuestionHe, ...(task.choices ?? []).map((c) => `${c.id}. ${c.textHe}`)]
    .filter(Boolean)
    .join('. ');

  const isSandbox = task.id === 's1_sandbox_controlled';

  return (
    <div className="flex flex-col gap-6 mt-4">
      {isSandbox ? (
        <div className="flex flex-col gap-4 bg-ws-surface p-6 rounded-2xl border border-ws-surface2 shadow-sm">
          <h3 className="text-lg font-bold text-ws-ink mb-1">📋 משימות החקר שלך:</h3>
          
          <div className="flex flex-col gap-3">
            {/* Task 1 */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-ws-bg border border-ws-surface2 transition-all">
              <div className="flex items-center gap-3">
                <span className={`text-2xl transition-transform ${blocksAddedCount >= 5 ? 'scale-110 text-green-500' : 'text-slate-400'}`}>
                  {blocksAddedCount >= 5 ? '✅' : '⏳'}
                </span>
                <span className={`text-base font-semibold ${blocksAddedCount >= 5 ? 'text-ws-soft line-through' : 'text-ws-ink'}`}>
                  גררו לפחות 5 פריטים לבית המספרים
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-ws-accent h-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (blocksAddedCount / 5) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-mono font-bold text-ws-soft">{blocksAddedCount}/5</span>
              </div>
            </div>

            {/* Task 2 */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-ws-bg border border-ws-surface2 transition-all">
              <div className="flex items-center gap-3">
                <span className={`text-2xl transition-transform ${hasDeletedBlock ? 'scale-110 text-green-500' : 'text-slate-400'}`}>
                  {hasDeletedBlock ? '✅' : '⏳'}
                </span>
                <span className={`text-base font-semibold ${hasDeletedBlock ? 'text-ws-soft line-through' : 'text-ws-ink'}`}>
                  מחקו לפחות פריט אחד (לפח או מחוץ ללוח)
                </span>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-ws-soft">
                {hasDeletedBlock ? 'בוצע!' : 'טרם בוצע'}
              </span>
            </div>
          </div>

          {(blocksAddedCount >= 5 && hasDeletedBlock) && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-2 p-4 bg-green-50 border border-green-200 rounded-xl text-center"
            >
              <span className="text-green-700 font-bold block text-sm">🎉 כל המשימות הושלמו! לחצו על "המשך" למעלה כדי להתקדם.</span>
            </motion.div>
          )}
        </div>
      ) : (
        <>
          {task.thoughtQuestionHe && (
            <div className="bg-ws-accentSoft/60 border border-ws-accent/25 rounded-2xl p-5 flex items-start gap-3">
              <p className="text-lg font-bold text-ws-ink leading-relaxed flex-1">💭 {task.thoughtQuestionHe}</p>
              <UdlSpeechButton text={speechText} />
            </div>
          )}
          {task.choices && <ChoiceList choices={task.choices} />}
        </>
      )}
    </div>
  );
}
