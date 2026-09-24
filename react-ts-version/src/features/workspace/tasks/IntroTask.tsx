import { ChoiceList } from './ChoiceList';
import type { SessionTask } from '@/data/sessionTasks';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { motion } from 'framer-motion';
import { session1Checklist } from '@/core/session1Checklist';

/** משימת הפתיחה של מפגש 1 — שאלת חשיבה או משימת חקר בארגז החול. */
export function IntroTask({ task }: { task: SessionTask }) {
  const counts = useWorkspaceStore((s) => s.counts);
  const blocksAddedCount = useWorkspaceStore((s) => s.blocksAddedCount);
  const hasUngrouped = useWorkspaceStore((s) => s.hasUngrouped);
  const undoCount = useWorkspaceStore((s) => s.undoCount);
  const hasClearedBoard = useWorkspaceStore((s) => s.hasClearedBoard);

  // UDL: the densest text on screen gets audio too — question + all choices in one read.
  const speechText = [task.thoughtQuestionHe, ...(task.choices ?? []).map((c) => `${c.id}. ${c.textHe}`)]
    .filter(Boolean)
    .join('. ');

  // Meeting 1 tool steps (מסמך 03 §3.1): a checklist the learner ticks off by
  // acting — the same rule the store applies to "התקדם".
  const checklist = session1Checklist(task.id, { counts, blocksAddedCount, hasUngrouped, undoCount, hasClearedBoard });
  const allDone = checklist?.every((i) => i.done) ?? false;

  return (
    <div className="flex flex-col gap-6 mt-4">
      {checklist ? (
        <div className="flex flex-col gap-4 bg-ws-surface p-6 rounded-2xl border border-ws-surface2 shadow-sm">
          <h3 className="text-lg font-bold text-ws-ink mb-1">📋 משימות החקר שלך:</h3>

          <div className="flex flex-col gap-3">
            {checklist.map((item) => (
              <div key={item.label} className="flex items-center justify-between p-4 rounded-xl bg-ws-bg border border-ws-surface2 transition-all">
                <div className="flex items-center gap-3">
                  <span className={`text-2xl transition-transform ${item.done ? 'scale-110 text-green-500' : 'text-slate-400'}`}>
                    {item.done ? '✅' : '⏳'}
                  </span>
                  <span className={`text-base font-semibold ${item.done ? 'text-ws-soft line-through' : 'text-ws-ink'}`}>
                    {item.label}
                  </span>
                </div>
                {item.progress ? (
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-ws-accent h-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (item.progress.value / item.progress.of) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-ws-soft">{Math.min(item.progress.value, item.progress.of)}/{item.progress.of}</span>
                  </div>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-ws-soft">
                    {item.done ? 'בוצע!' : 'טרם בוצע'}
                  </span>
                )}
              </div>
            ))}
          </div>

          {allDone && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-2 p-4 bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 rounded-2xl text-center shadow-sm"
            >
              <span className="text-emerald-800 font-black block text-base">
                ✨ מצוין! לחצו על כפתור <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-lg">התקדם ←</span> בסרגל העליון כדי לעבור לשלב הבא!
              </span>
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
