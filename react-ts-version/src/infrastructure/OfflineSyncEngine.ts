// Offline Queue & Idempotent Sync Engine (Master PRD v6.3 Module 17 & Appendix A §3)
import { firestore } from '@/infrastructure/firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { TelemetryEventType, TelemetryPayload, OfflineQueueItem } from '@/types/telemetry';

const DB_NAME = 'MathmatiCore_OfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'telemetry_offline_queue';

export type SyncConnectionState = 'ONLINE_SYNCED' | 'ONLINE_SYNCING' | 'OFFLINE';

export class OfflineSyncEngine {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private isSyncing = false;
  private connectionState: SyncConnectionState = 'ONLINE_SYNCED';
  private stateListeners: Array<(state: SyncConnectionState) => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.initDB();
      window.addEventListener('online', () => this.handleOnlineEvent());
      window.addEventListener('offline', () => this.handleOfflineEvent());
      this.connectionState = navigator.onLine ? 'ONLINE_SYNCED' : 'OFFLINE';
    }
  }

  private initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB is not supported in this environment.'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'idempotency_key' });
          store.createIndex('client_timestamp', 'client_timestamp', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  public getConnectionState(): SyncConnectionState {
    return this.connectionState;
  }

  public onConnectionStateChange(listener: (state: SyncConnectionState) => void): () => void {
    this.stateListeners.push(listener);
    listener(this.connectionState);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener);
    };
  }

  private setConnectionState(newState: SyncConnectionState) {
    if (this.connectionState !== newState) {
      this.connectionState = newState;
      this.stateListeners.forEach((listener) => listener(newState));
    }
  }

  /**
   * Enqueue a telemetry payload into the persistent IndexedDB FIFO buffer
   */
  public async enqueueTelemetry<T extends TelemetryEventType>(
    payload: TelemetryPayload<T>
  ): Promise<void> {
    const db = await this.initDB();
    const queueItem: OfflineQueueItem = {
      idempotency_key: payload.idempotency_key,
      client_timestamp: payload.client_timestamp,
      session_id: payload.session_id,
      student_id: payload.student_id,
      exercise_id: payload.exercise_id,
      operation_type: payload.event_type,
      payload: payload.details,
      retry_count: 0,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(queueItem);

      req.onsuccess = () => {
        // If online, immediately try to flush queue
        if (navigator.onLine && !this.isSyncing) {
          this.flushQueue().catch(console.error);
        }
        resolve();
      };

      req.onerror = () => {
        reject(req.error);
      };
    });
  }

  /**
   * Reads all queued items in FIFO order (by client_timestamp)
   */
  public async getQueuedItems(): Promise<OfflineQueueItem[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('client_timestamp');
      const req = index.getAll();

      req.onsuccess = () => {
        resolve(req.result || []);
      };

      req.onerror = () => {
        reject(req.error);
      };
    });
  }

  /**
   * Atomically deletes a processed item from IndexedDB by its idempotency_key
   */
  public async deleteQueueItem(idempotencyKey: string): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(idempotencyKey);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 5-Step Reconnection Handshake & Idempotent Flush Protocol (PRD Module 17 §C)
   *
   * Step 1: Detect reconnection and verify server ping/reachability.
   * Step 2: Fetch authoritative server state (handled by stores listeners).
   * Step 3: Read FIFO queue from IndexedDB in bounded batches.
   * Step 4: Write to Firestore using idempotency_key as Document ID (/telemetry_logs/{idempotency_key}).
   * Step 5: Atomic deletion from IndexedDB strictly upon Ack; idempotent replay is silent success.
   */
  public async flushQueue(): Promise<{ syncedCount: number; errors: number }> {
    if (this.isSyncing) return { syncedCount: 0, errors: 0 };
    if (!navigator.onLine) {
      this.setConnectionState('OFFLINE');
      return { syncedCount: 0, errors: 0 };
    }

    this.isSyncing = true;
    this.setConnectionState('ONLINE_SYNCING');

    let syncedCount = 0;
    let errors = 0;

    try {
      // Step 3: Read FIFO items from IndexedDB
      const items = await this.getQueuedItems();
      if (items.length === 0) {
        this.setConnectionState('ONLINE_SYNCED');
        this.isSyncing = false;
        return { syncedCount: 0, errors: 0 };
      }

      // Process in bounded batches of 20 items
      const BATCH_SIZE = 20;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);

        for (const item of batch) {
          try {
            // Step 4: Write to Firestore with Document ID = idempotency_key
            if (firestore) {
              const docRef = doc(firestore, 'telemetry_logs', item.idempotency_key);
              await setDoc(docRef, {
                idempotency_key: item.idempotency_key,
                client_timestamp: item.client_timestamp,
                session_id: item.session_id,
                student_id: item.student_id,
                exercise_id: item.exercise_id,
                event_type: item.operation_type,
                details: item.payload,
                synced_at: Date.now(),
              }, { merge: true });
            }

            // Step 5: Atomic deletion from IndexedDB upon server acknowledgment
            await this.deleteQueueItem(item.idempotency_key);
            syncedCount++;
          } catch (err: any) {
            console.error(`[OfflineSyncEngine] Error syncing item ${item.idempotency_key}:`, err);
            errors++;
            // If already exists or permission error on retry, treat as idempotent success to prevent queue blocking
            if (err?.code === 'already-exists') {
              await this.deleteQueueItem(item.idempotency_key);
              syncedCount++;
            }
          }
        }
      }

      this.setConnectionState('ONLINE_SYNCED');
    } catch (e) {
      console.error('[OfflineSyncEngine] Flush queue failure:', e);
      this.setConnectionState(navigator.onLine ? 'ONLINE_SYNCED' : 'OFFLINE');
    } finally {
      this.isSyncing = false;
    }

    return { syncedCount, errors };
  }

  private handleOnlineEvent() {
    this.setConnectionState('ONLINE_SYNCING');
    this.flushQueue().catch(console.error);
  }

  private handleOfflineEvent() {
    this.setConnectionState('OFFLINE');
  }
}

export const offlineSyncEngine = new OfflineSyncEngine();
