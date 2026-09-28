/**
 * A small in-memory IndexedDB, enough for the real IndexedDBQueue to run on it
 * in tests: open/upgrade, object stores with autoIncrement keys, add/put/get/
 * delete/clear/count/getAll, cursors (continue/update) with a lowerBound range,
 * transactions with oncomplete. Transactions run one at a time, in the order
 * they were created — a legal (strict) IndexedDB schedule. Every step runs on
 * a microtask, so tests can use fake timers for the queue's own timeouts.
 *
 * Values are structured-cloned on the way in and out, as IndexedDB does.
 */

type Handler = ((event: { target: FakeRequest }) => void) | null;

class FakeRequest {
  result: any = undefined;
  error: any = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
  succeed(result: any) {
    this.result = result;
    this.onsuccess?.({ target: this });
  }
}

interface KeyRange { lower: number; lowerOpen: boolean }

export class FakeStoreData {
  records = new Map<number, any>();
  nextKey = 1;
  keyPath: string;
  autoIncrement: boolean;
  constructor(keyPath: string, autoIncrement: boolean) {
    this.keyPath = keyPath;
    this.autoIncrement = autoIncrement;
  }
  sortedKeys(): number[] {
    return [...this.records.keys()].sort((a, b) => a - b);
  }
}

export class FakeDatabase {
  stores = new Map<string, FakeStoreData>();
  version = 0;
  get objectStoreNames() {
    const names = [...this.stores.keys()];
    return { contains: (n: string) => this.stores.has(n), length: names.length };
  }
  createObjectStore(name: string, opts: { keyPath: string; autoIncrement?: boolean }) {
    const s = new FakeStoreData(opts.keyPath, !!opts.autoIncrement);
    this.stores.set(name, s);
    return s;
  }
  transaction(names: string[] | string, _mode?: string) {
    const list = Array.isArray(names) ? names : [names];
    for (const n of list) if (!this.stores.has(n)) throw new Error(`NotFoundError: ${n}`);
    const tx = new FakeTransaction(this);
    scheduler.add(tx);
    return tx;
  }
  close() {}
}

class FakeTransaction {
  ops: Array<() => void> = [];
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private db: FakeDatabase;
  constructor(db: FakeDatabase) {
    this.db = db;
  }
  objectStore(name: string) {
    const data = this.db.stores.get(name);
    if (!data) throw new Error(`NotFoundError: ${name}`);
    return new FakeObjectStore(this, data);
  }
  request(fn: (req: FakeRequest) => void): FakeRequest {
    const req = new FakeRequest();
    this.ops.push(() => fn(req));
    return req;
  }
  run() {
    while (this.ops.length > 0) {
      const op = this.ops.shift()!;
      op();
    }
  }
}

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

class FakeObjectStore {
  private tx: FakeTransaction;
  private data: FakeStoreData;
  constructor(tx: FakeTransaction, data: FakeStoreData) {
    this.tx = tx;
    this.data = data;
  }
  private keyOf(value: any): number {
    const existing = value?.[this.data.keyPath];
    if (typeof existing === 'number') {
      if (existing >= this.data.nextKey) this.data.nextKey = existing + 1;
      return existing;
    }
    return this.data.nextKey++;
  }
  add(value: any) {
    return this.tx.request((req) => {
      const key = this.keyOf(value);
      this.data.records.set(key, { ...clone(value), [this.data.keyPath]: key });
      req.succeed(key);
    });
  }
  put(value: any) {
    return this.add(value);
  }
  get(key: number) {
    return this.tx.request((req) => req.succeed(clone(this.data.records.get(key))));
  }
  delete(key: number) {
    return this.tx.request((req) => {
      this.data.records.delete(key);
      req.succeed(undefined);
    });
  }
  clear() {
    return this.tx.request((req) => {
      this.data.records.clear();
      req.succeed(undefined);
    });
  }
  count() {
    return this.tx.request((req) => req.succeed(this.data.records.size));
  }
  getAll() {
    return this.tx.request((req) => req.succeed(this.data.sortedKeys().map((k) => clone(this.data.records.get(k)))));
  }
  openCursor(range?: KeyRange) {
    const inRange = (k: number) => !range || (range.lowerOpen ? k > range.lower : k >= range.lower);
    let last: number | null = null;
    const advance = (req: FakeRequest) => {
      const next = this.data.sortedKeys().find((k) => inRange(k) && (last === null || k > last));
      if (next === undefined) {
        req.succeed(null);
        return;
      }
      last = next;
      const cursor = {
        primaryKey: next,
        key: next,
        value: clone(this.data.records.get(next)),
        continue: () => { this.tx.ops.push(() => advance(req)); },
        update: (value: any) => {
          this.data.records.set(next, { ...clone(value), [this.data.keyPath]: next });
          return new FakeRequest();
        },
        delete: () => { this.data.records.delete(next); return new FakeRequest(); },
      };
      req.succeed(cursor);
    };
    return this.tx.request((req) => advance(req));
  }
}

/** Runs transactions one after another, each on its own microtask. */
const scheduler = {
  queue: [] as FakeTransaction[],
  running: false,
  add(tx: FakeTransaction) {
    this.queue.push(tx);
    this.pump();
  },
  pump() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    const tx = this.queue.shift()!;
    queueMicrotask(() => {
      tx.run();
      queueMicrotask(() => {
        tx.oncomplete?.();
        this.running = false;
        this.pump();
      });
    });
  },
};

export class FakeIndexedDB {
  databases = new Map<string, FakeDatabase>();
  open(name: string, version = 1) {
    const req = new FakeRequest();
    queueMicrotask(() => {
      let db = this.databases.get(name);
      const isNew = !db;
      if (!db) {
        db = new FakeDatabase();
        this.databases.set(name, db);
      }
      req.result = db;
      if (isNew || version > db.version) {
        db.version = version;
        req.onupgradeneeded?.({ target: req });
      }
      req.succeed(db);
    });
    return req;
  }
  /** Direct access for a test that plays "another tab". */
  store(dbName: string, storeName: string): FakeStoreData {
    const s = this.databases.get(dbName)?.stores.get(storeName);
    if (!s) throw new Error(`no store ${dbName}/${storeName}`);
    return s;
  }
}

export const fakeKeyRange = {
  lowerBound: (lower: number, lowerOpen = false): KeyRange => ({ lower, lowerOpen }),
};
