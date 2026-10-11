import { useState } from 'react';
import { BellRing, ChevronDown, DoorOpen, MessageCircle, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { READ_ONLY_TITLE } from '@/application/useIsReadOnlyStaff';
import { useChatStore } from '@/application/useChatStore';
import { useOpenMediationEvents, useTeacherMediationStore } from '@/application/useTeacherMediationStore';
import { clearHelpRequest } from '@/infrastructure/services/HelpRequestService';
import {
  MEDIATION_ACTIONS,
  MEDIATION_ACTION_HE,
  MEDIATION_HE,
  QUEUE_HE,
  buildActionQueue,
  clockHe,
  type MediationAction,
  type QueueItem,
  type QueueLearner,
} from '@/core/teacherMediation';
import { TEACHER_GATE_HE } from '@/core/routeLabels';
import { ChatThread } from './ChatThread';
import { MediationControls } from './MediationControls';
import { MediationOpenList } from './MediationJournal';

const chip = (pressed: boolean) =>
  `min-h-9 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
    pressed
      ? 'bg-violet-700 border-violet-700 text-white'
      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
  }`;

/**
 * One queue item: the learner, what is waiting, the two questions inline, and
 * the conversation when the teacher opens it. Pressing an action on a help call
 * clears the call (the write "סמנו כטופל" makes) at once; the כן / לא answer
 * then saves the action for every open help and chat event of the learner.
 */
function QueueItemCard({ item, readOnly, teacherId }: { item: QueueItem; readOnly: boolean; teacherId: string }) {
  const expanded = useTeacherMediationStore((s) => s.expandedLearner === item.studentNumber);
  const setExpandedLearner = useTeacherMediationStore((s) => s.setExpandedLearner);
  const action = useTeacherMediationStore((s) => s.pendingAction[item.studentNumber] ?? null) as MediationAction | null;
  const setPendingAction = useTeacherMediationStore((s) => s.setPendingAction);
  const record = useTeacherMediationStore((s) => s.record);
  const [saving, setSaving] = useState(false);
  const title = readOnly ? READ_ONLY_TITLE : undefined;
  const first = item.events[0];

  const onAction = async (a: MediationAction) => {
    if (readOnly) return;
    setPendingAction(item.studentNumber, a);
    if (item.helpRequested) {
      try {
        await clearHelpRequest(`student_user${item.studentNumber}`);
      } catch (err) {
        console.error('Failed to clear help request:', err);
        toast.error('סימון הטיפול נדחה בשרת. נסו שוב.');
      }
    }
  };

  const onDataLed = async (dataLed: boolean) => {
    if (readOnly || action === null || saving || item.events.length === 0) return;
    setSaving(true);
    let ok = true;
    for (const e of item.events) {
      ok = (await record({ event: e, studentNumber: item.studentNumber, action, dataLed })) && ok;
    }
    setSaving(false);
    if (ok) setPendingAction(item.studentNumber, null);
  };

  return (
    <li
      data-testid="queue-item"
      data-learner={item.studentNumber}
      data-kind={item.kind}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col"
    >
      <button
        type="button"
        data-testid="queue-item-toggle"
        aria-expanded={expanded}
        title={expanded ? QUEUE_HE.closeThread : QUEUE_HE.openThread}
        onClick={() => setExpandedLearner(expanded ? null : item.studentNumber)}
        className="w-full flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5 text-right cursor-pointer"
      >
        <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 dark:text-slate-100">
          {item.kind === 'help'
            ? <BellRing className="w-3.5 h-3.5 text-slate-800 dark:text-slate-100 shrink-0" aria-hidden="true" />
            : <MessageCircle className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />}
          <span>{MEDIATION_HE.learner(item.studentNumber)}</span>
          <span className="font-bold text-slate-700 dark:text-slate-300">
            · {item.kind === 'help' ? QUEUE_HE.helpItem : QUEUE_HE.chatItem(item.unreadCount)}
            {first ? ` · ${clockHe(first.at)}` : ''}
          </span>
          {item.kind === 'help' && item.unreadCount > 0 && (
            <span className="ms-1 inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <MessageCircle className="w-3 h-3" aria-hidden="true" />{item.unreadCount}
            </span>
          )}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-500 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {(item.events.length > 0 || item.helpRequested) && (
        <div className="px-3 pb-2.5 flex flex-col gap-1.5">
          <div role="group" aria-label={MEDIATION_HE.whatDidIDo} className="flex flex-wrap items-center gap-1.5">
            {MEDIATION_ACTIONS.map((a) => (
              <button
                key={a}
                type="button"
                data-testid={`queue-action-${a}`}
                aria-pressed={action === a}
                disabled={readOnly || saving}
                title={title}
                onClick={() => { void onAction(a); }}
                className={chip(action === a)}
              >
                {MEDIATION_ACTION_HE[a]}
              </button>
            ))}
          </div>
          {action !== null && item.events.length > 0 && (
            <div role="group" aria-label={MEDIATION_HE.dataLed} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 me-1">{MEDIATION_HE.dataLed}</span>
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  data-testid={`queue-dataled-${v ? 'yes' : 'no'}`}
                  disabled={readOnly || saving}
                  title={title}
                  onClick={() => { void onDataLed(v); }}
                  className={chip(false)}
                >
                  {v ? MEDIATION_HE.yes : MEDIATION_HE.no}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div data-testid="queue-thread" className="border-t border-slate-200 dark:border-slate-700 flex flex-col rounded-b-xl overflow-hidden">
          <ChatThread studentId={`student_user${item.studentNumber}`} teacherId={teacherId} listClassName="max-h-56 overflow-y-auto p-3" />
        </div>
      )}
    </li>
  );
}

/** "ניגשתי בלי קריאה": the learner's number, then כן / לא (the action is ניגשתי). */
function SelfApproach({ readOnly }: { readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [learner, setLearner] = useState<number | null>(null);
  const close = () => { setOpen(false); setLearner(null); };
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid="queue-self-approach"
        aria-expanded={open}
        disabled={readOnly}
        title={readOnly ? READ_ONLY_TITLE : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex items-center justify-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
        {MEDIATION_HE.selfApproach}
      </button>
      {open && !readOnly && (
        <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col gap-2">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{QUEUE_HE.pickLearner}</span>
          <div role="group" aria-label={QUEUE_HE.pickLearner} className="grid grid-cols-6 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                data-testid={`queue-self-learner-${n}`}
                aria-pressed={learner === n}
                onClick={() => setLearner(n)}
                className={chip(learner === n)}
              >
                {n}
              </button>
            ))}
          </div>
          {learner !== null && (
            <MediationControls key={learner} event={null} studentNumber={learner} readOnly={false} testIdPrefix="queue-self" onSaved={close} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The side action queue on the radar tab (owner, 11.10.2026): one item per
 * learner — help call and the learner's chat merged — oldest call first, then
 * unread chat, then (meeting 2) the gate, then the other unrecorded events,
 * folded. It sits beside the grid and never covers it. A read-only account
 * sees it with every button disabled.
 */
export function MediationQueue({
  learners,
  gateLearners,
  onOpenGate,
  readOnly,
  teacherId,
}: {
  learners: QueueLearner[];
  /** Meeting 2 only: learners waiting at the gate. */
  gateLearners: number[];
  onOpenGate: (studentNumber: number) => void;
  readOnly: boolean;
  teacherId: string;
}) {
  const openEvents = useOpenMediationEvents();
  const messages = useChatStore((s) => s.messages);
  const meeting = useTeacherMediationStore((s) => s.meeting);
  const expandedLearner = useTeacherMediationStore((s) => s.expandedLearner);
  const queue = buildActionQueue({ learners, openEvents, chatMessages: messages ?? [], keepOpen: expandedLearner });
  const [toRecordOpen, setToRecordOpen] = useState(false);
  const nothing = queue.items.length === 0 && gateLearners.length === 0;

  return (
    <aside
      data-testid="mediation-queue"
      aria-label={QUEUE_HE.title}
      className="w-full lg:w-80 2xl:w-[25rem] shrink-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7.5rem)] overflow-y-auto custom-scrollbar flex flex-col gap-2.5 p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
      dir="rtl"
    >
      <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{QUEUE_HE.title}</h2>
      {meeting !== null && <SelfApproach readOnly={readOnly} />}

      {nothing && <p className="text-xs text-slate-600 dark:text-slate-400">{QUEUE_HE.empty}</p>}

      {queue.items.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="queue-items">
          {queue.items.map((item) => (
            <QueueItemCard key={item.studentNumber} item={item} readOnly={readOnly} teacherId={teacherId} />
          ))}
        </ul>
      )}

      {gateLearners.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="queue-gate">
          {gateLearners.map((n) => (
            <li key={n} className="rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 px-3 py-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 dark:text-slate-100" title={`ממתין ב${TEACHER_GATE_HE}`}>
                <DoorOpen className="w-3.5 h-3.5 text-violet-700 shrink-0" aria-hidden="true" />
                {MEDIATION_HE.learner(n)} · {QUEUE_HE.gateItem}
              </span>
              <button
                type="button"
                onClick={() => onOpenGate(n)}
                className="min-h-9 px-2.5 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold cursor-pointer"
              >
                {QUEUE_HE.gateOpen}
              </button>
            </li>
          ))}
        </ul>
      )}

      {queue.toRecord.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="queue-to-record-toggle"
            aria-expanded={toRecordOpen}
            onClick={() => setToRecordOpen((v) => !v)}
            className="flex items-center justify-between gap-2 px-1 text-xs font-extrabold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <span>{QUEUE_HE.toRecordList(queue.toRecord.length)}</span>
            <ChevronDown className={`w-3.5 h-3.5 ${toRecordOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {toRecordOpen && <MediationOpenList events={queue.toRecord} readOnly={readOnly} testIdPrefix="queue-to-record" />}
        </div>
      )}
    </aside>
  );
}
