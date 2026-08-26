/**
 * מודול 17: תור FIFO ועמידות במצב לא מקוון (Offline Queue & Sync Engine Spec)
 * אוגר אירועי טלמטריה מוקלדים (TelemetryPayload) ב-IndexedDB בעת ניתוק או כשל ומסנכרן אוטומטית בעת חידוש החיבור.
 * פרוטוקול התאוששות בן 5 שלבים אל מסד הנתונים Firestore (telemetry_logs).
 * קיבולת מקסימלית: 500 פעולות במבנה FIFO קשיח.
 * אפס מידע מזהה (Zero PII).
 */

import { firestore } from '@/infrastructure/firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { TelemetryPayload, TelemetryEventType } from '@/types/telemetry';

export interface QueuedAction {
  id?: number;
  refPath?: string;
  payload: any;
  timestamp: number;
  idempotency_key?: string;
}

const DB_NAME = 'mathmaticore_offline_db';
const STORE_NAME = 'offline_telemetry_queue';
const LEGACY_STORE_NAME = 'offline_actions';
const DB_VERSION = 2;
const MAX_QUEUE_CAPACITY = 500;

export class IndexedDBQueue {
  private static instance: IndexedDBQueue;
  private db: IDBDatabase | null = null;
  private memoryFallback: QueuedAction[] = [];
  private isOnline = true;
  private isFlushing = false;
  private syncCallback: ((refPath: string, payload: any) => Promise<void>) | null = null;

  private constructor() {
    this.initDB();
    this.setupNetworkListeners();
  }

  public static getInstance(): IndexedDBQueue {
    if (!IndexedDBQueue.instance) {
      IndexedDBQueue.instance = new IndexedDBQueue();
    }
    return IndexedDBQueue.instance;
  }

  private initDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
            db.createObjectStore(LEGACY_STORE_NAME, { keyPath: 'id', autoIncrement: true });
          }
        };

        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          resolve(this.db);
          if (this.isOnline) {
            this.flushQueue().catch(console.error);
          }
        };

        request.onerror = () => {
          console.warn('[IndexedDBQueue] IndexedDB open error, falling back to memory/storage.');
          resolve(null);
        };
      } catch (e) {
        console.warn('[IndexedDBQueue] IndexedDB initialization failed:', e);
        resolve(null);
      }
    });
  }

  private setupNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushQueue().catch(console.error);
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  public registerSyncHandler(handler: (refPath: string, payload: any) => Promise<void>) {
    this.syncCallback = handler;
  }

  /**
   * Enqueues a typed telemetry payload (or legacy refPath+payload) into the FIFO queue.
   */
  public async enqueue(arg1: any, arg2?: any): Promise<void> {
    let item: QueuedAction;

    if (typeof arg1 === 'string') {
      // Legacy signature: enqueue(refPath, payload)
      item = {
        refPath: arg1,
        payload: arg2,
        timestamp: Date.now(),
        idempotency_key: arg2?.idempotency_key || `legacy_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      };
    } else {
      // Typed TelemetryPayload signature: enqueue(payload)
      const payload = arg1 as TelemetryPayload<TelemetryEventType>;
      item = {
        payload,
        timestamp: payload.client_timestamp || Date.now(),
        idempotency_key: payload.idempotency_key,
      };
    }

    if (!this.db) {
      await this.initDB();
    }

    if (this.db) {
      await new Promise<void>((resolve) => {
        try {
          const targetStore = this.db!.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;
          const tx = this.db!.transaction([targetStore], 'readwrite');
          const store = tx.objectStore(targetStore);
          const countReq = store.count();

          countReq.onsuccess = () => {
            if (countReq.result >= MAX_QUEUE_CAPACITY) {
              const cursorReq = store.openCursor();
              cursorReq.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                  store.delete(cursor.primaryKey);
                }
              };
            }
            store.add(item);
          };

          tx.oncomplete = () => resolve();
          tx.onerror = () => {
            this.memoryFallback.push(item);
            if (this.memoryFallback.length > MAX_QUEUE_CAPACITY) this.memoryFallback.shift();
            resolve();
          };
        } catch {
          this.memoryFallback.push(item);
          if (this.memoryFallback.length > MAX_QUEUE_CAPACITY) this.memoryFallback.shift();
          resolve();
        }
      });
    } else {
      this.memoryFallback.push(item);
      if (this.memoryFallback.length > MAX_QUEUE_CAPACITY) this.memoryFallback.shift();
    }
  }

  public async getAll(): Promise<QueuedAction[]> {
    if (!this.db) {
      await this.initDB();
    }

    if (this.db) {
      return new Promise((resolve) => {
        try {
          const targetStore = this.db!.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;
          const tx = this.db!.transaction([targetStore], 'readonly');
          const store = tx.objectStore(targetStore);
          const req = store.getAll();

          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([...this.memoryFallback]);
        } catch {
          resolve([...this.memoryFallback]);
        }
      });
    }

    return [...this.memoryFallback];
  }

  public async clear(): Promise<void> {
    this.memoryFallback = [];
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const targetStore = this.db!.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;
        const tx = this.db!.transaction([targetStore], 'readwrite');
        const store = tx.objectStore(targetStore);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Module 17: 5-step recovery & synchronization protocol
   * 1. Detect online connectivity & verify Firestore reachability.
   * 2. Read FIFO items in bounded batches.
   * 3. Send to Firestore collection `telemetry_logs` with document ID = `idempotency_key`.
   * 4. Atomic delete from IndexedDB strictly upon server acknowledgment (`setDoc` resolved).
   * 5. Server enforces idempotent execution via `idempotency_key`.
   */
  public async flushQueue(): Promise<void> {
    if (this.isFlushing || !this.isOnline) return;
    this.isFlushing = true;

    try {
      if (!this.db) {
        await this.initDB();
      }

      // Step 1 & 2: Process memory fallback items if any
      if (this.memoryFallback.length > 0) {
        const fallbackItems = [...this.memoryFallback];
        for (const item of fallbackItems) {
          try {
            if (item.payload && item.payload.event_type && item.idempotency_key) {
              await setDoc(doc(firestore, 'telemetry_logs', item.idempotency_key), {
                ...item.payload,
                synced_at: Date.now(),
              });
            } else if (this.syncCallback && item.refPath) {
              await this.syncCallback(item.refPath, item.payload);
            }
            this.memoryFallback = this.memoryFallback.filter((i) => i.idempotency_key !== item.idempotency_key);
          } catch (err) {
            console.error('[IndexedDBQueue] Sync failed for memory item:', err);
            break;
          }
        }
      }

      if (!this.db) {
        this.isFlushing = false;
        return;
      }

      const targetStore = this.db.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : LEGACY_STORE_NAME;

      // Step 2: Read FIFO items in bounded batches of 20 items
      const BATCH_SIZE = 20;
      let hasMore = true;

      while (hasMore && this.isOnline) {
        const batchItems = await new Promise<QueuedAction[]>((resolve) => {
          try {
            const tx = this.db!.transaction([targetStore], 'readonly');
            const store = tx.objectStore(targetStore);
            const req = store.openCursor();
            const items: QueuedAction[] = [];

            req.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
              if (cursor && items.length < BATCH_SIZE) {
                items.push({ ...cursor.value, id: cursor.primaryKey as number });
                cursor.continue();
              } else {
                resolve(items);
              }
            };
            req.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        });

        if (batchItems.length === 0) {
          hasMore = false;
          break;
        }

        // Step 3, 4, 5: Write to Firestore telemetry_logs and delete on server Ack
        for (const item of batchItems) {
          try {
            if (item.payload && item.payload.event_type && item.idempotency_key) {
              // Firestore Canonical Telemetry Write
              await setDoc(doc(firestore, 'telemetry_logs', item.idempotency_key), {
                ...item.payload,
                synced_at: Date.now(),
              });
            } else if (this.syncCallback && item.refPath) {
              await this.syncCallback(item.refPath, item.payload);
            }

            // Step 4: Atomic delete from IndexedDB upon server Ack
            if (item.id !== undefined && this.db) {
              await new Promise<void>((resolve) => {
                try {
                  const delTx = this.db!.transaction([targetStore], 'readwrite');
                  delTx.objectStore(targetStore).delete(item.id!);
                  delTx.oncomplete = () => resolve();
                  delTx.onerror = () => resolve();
                } catch {
                  resolve();
                }
              });
            }
          } catch (err) {
            console.error('[IndexedDBQueue] Firestore sync failed for item:', item.idempotency_key, err);
            hasMore = false;
            break;
          }
        }

        if (batchItems.length < BATCH_SIZE) {
          hasMore = false;
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  public getOnlineStatus(): boolean {
    return this.isOnline;
  }
}

export const indexedDBQueue = IndexedDBQueue.getInstance();
