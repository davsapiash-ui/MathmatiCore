import { useEffect, useState } from 'react';
import { Cloud, CloudOff } from 'lucide-react';
import { indexedDBQueue, type QueueSyncState } from '@/infrastructure/services/IndexedDBQueue';

/** מודול 17 §ד: what the cloud says in each sync state (read aloud and on hover). */
const CLOUD_STATUS_LABEL: Record<QueueSyncState, string> = {
  synced: 'יש חיבור לרשת. העבודה שלכם נשמרה.',
  pending: 'יש חיבור לרשת. העבודה שלכם נשמרת ותישלח בעוד רגע.',
  offline: 'אין כרגע חיבור לרשת. העבודה שלכם נשמרת כאן ותישלח מעצמה כשהחיבור יחזור.',
};

/**
 * Module 17 §ד: Silent Cloud Status Icon — "אופליין = אייקון ענן אפור קטן ולא
 * חוסם בפינה. אונליין מסונכרן = ענן ירוק." Green only when synced, grey while
 * offline or while the queue is still being delivered.
 *
 * "אונליין מסונכרן = ענן ירוק". The cloud followed the browser's online flag,
 * so it turned green the moment the network came back, while what was saved
 * offline still sat in the queue. It follows the queue itself: green only once
 * the queue has been delivered.
 */
export function CloudSyncStatus({ className = 'flex items-center mr-1' }: { className?: string }) {
  const [syncState, setSyncState] = useState<QueueSyncState>(() => indexedDBQueue.getSyncState());

  useEffect(() => indexedDBQueue.onSyncStateChange(setSyncState), []);

  return (
    <div
      className={className}
      role="status"
      data-sync-state={syncState}
      aria-label={CLOUD_STATUS_LABEL[syncState]}
      title={CLOUD_STATUS_LABEL[syncState]}
    >
      {syncState === 'synced' ? (
        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-emerald-500" />
          <Cloud className="w-3.5 h-3.5" />
        </span>
      ) : (
        <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full border border-slate-300 dark:border-slate-700">
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-slate-400" />
          {syncState === 'offline' ? <CloudOff className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />}
        </span>
      )}
    </div>
  );
}

/**
 * The same cloud, in the corner of a screen that has no top bar: the meeting-2
 * waiting screen, the meeting-8 reflection and the end-of-station screen. Those
 * are exactly the moments the last work may still wait on the device, and they
 * showed no cloud at all.
 */
export function CornerCloudSyncStatus() {
  return <CloudSyncStatus className="fixed top-3 right-3 z-[60] flex items-center" />;
}
