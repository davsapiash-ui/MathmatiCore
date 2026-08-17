/**
 * מודול 17: תור FIFO ועמידות במצב לא מקוון (Offline Resilience & IndexedDB FIFO Queue)
 * שומר ומנהל תור פעולות מקומי ב-IndexedDB בעת ניתוק מהרשת ומסנכרן אוטומטית בעת חזרת החיבור.
 * קיבולת מקסימלית: 500 פעולות (הוצאת הישן ביותר במקרה של חריגה).
 * אפס איסוף מידע מזהה (Zero PII).
 */

export interface QueuedAction {
  id?: number;
  refPath: string;
  payload: any;
  timestamp: number;
}

const DB_NAME = 'mathmaticore_offline_db';
const STORE_NAME = 'offline_actions';
const DB_VERSION = 1;
const MAX_QUEUE_CAPACITY = 500;

export class IndexedDBQueue {
  private static instance: IndexedDBQueue;
  private db: IDBDatabase | null = null;
  private memoryFallback: QueuedAction[] = [];
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
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
        };

        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          resolve(this.db);
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
      this.flushQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  public registerSyncHandler(handler: (refPath: string, payload: any) => Promise<void>) {
    this.syncCallback = handler;
  }

  public async enqueue(refPath: string, payload: any): Promise<void> {
    const item: QueuedAction = {
      refPath,
      payload,
      timestamp: Date.now(),
    };

    if (!this.db) {
      await this.initDB();
    }

    if (this.db) {
      return new Promise((resolve) => {
        try {
          const tx = this.db!.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const countReq = store.count();

          countReq.onsuccess = () => {
            if (countReq.result >= MAX_QUEUE_CAPACITY) {
              // Delete oldest items to maintain FIFO cap
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
          const tx = this.db!.transaction([STORE_NAME], 'readonly');
          const store = tx.objectStore(STORE_NAME);
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
        const tx = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  public async flushQueue(): Promise<void> {
    if (!this.syncCallback) return;

    const items = await this.getAll();
    if (items.length === 0) return;

    await this.clear();

    for (const item of items) {
      try {
        await this.syncCallback(item.refPath, item.payload);
      } catch (err) {
        console.error('[IndexedDBQueue] Sync failed for item, re-queuing:', err);
        await this.enqueue(item.refPath, item.payload);
      }
    }
  }

  public getOnlineStatus(): boolean {
    return this.isOnline;
  }
}

export const indexedDBQueue = IndexedDBQueue.getInstance();
