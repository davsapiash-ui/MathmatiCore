/**
 * A small in-memory Realtime Database for tests that mount real pages: a tree,
 * value listeners, set / update / get / push, the `.info` nodes, and the
 * server-value sentinels resolved against a server clock the test controls.
 * It stands in for the transport only; every caller is the app's own code.
 *
 * Usage, in the test file:
 *   const fake = vi.hoisted(() => ({ db: null as any }));
 *   vi.mock('firebase/database', async () => (await import('./fakeRealtimeDatabase')).firebaseDatabaseModule(() => fake.db));
 */
type Listener = { path: string; cb: (snap: FakeSnapshot) => void };

export interface FakeSnapshot {
  key: string | null;
  exists(): boolean;
  val(): any;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const norm = (path: string) => path.split('/').filter(Boolean).join('/');
const related = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || a === '' || b === '';

export class FakeRealtimeDatabase {
  tree: Record<string, any> = {};
  /** Server clock minus this device's clock, in ms (what `.info/serverTimeOffset` reports). */
  serverOffsetMs = 0;
  connected = true;
  /** Every update() and set() the app made, in order, with the device time it was made at. */
  writes: Array<{ op: 'update' | 'set'; path: string; value: any; at: number }> = [];
  private listeners = new Set<Listener>();
  private pushCount = 0;

  /** Empties the database between tests; listeners stay attached, as the app's own would. */
  reset() {
    this.tree = {};
    this.writes = [];
    this.serverOffsetMs = 0;
    this.connected = true;
    this.pushCount = 0;
  }

  serverTime(): number {
    return Date.now() + this.serverOffsetMs;
  }

  read(path: string): any {
    const p = norm(path);
    if (p === '.info/connected') return this.connected;
    if (p === '.info/serverTimeOffset') return this.serverOffsetMs;
    let node: any = this.tree;
    for (const seg of p ? p.split('/') : []) {
      if (node === null || typeof node !== 'object') return null;
      node = node[seg];
      if (node === undefined) return null;
    }
    return node;
  }

  private resolve(value: any, current: any): any {
    if (value && typeof value === 'object') {
      const sv = value['.sv'];
      if (sv === 'timestamp') return this.serverTime();
      if (sv && typeof sv === 'object' && typeof sv.increment === 'number') return (Number(current) || 0) + sv.increment;
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) out[k] = this.resolve(v, current?.[k]);
      return out;
    }
    return value;
  }

  private writeAt(path: string, value: any) {
    const segs = norm(path).split('/');
    const last = segs.pop()!;
    let node: any = this.tree;
    for (const seg of segs) {
      if (node[seg] === null || typeof node[seg] !== 'object') node[seg] = {};
      node = node[seg];
    }
    const resolved = this.resolve(value, node[last]);
    if (resolved === null || resolved === undefined) delete node[last];
    else node[last] = clone(resolved);
  }

  private notify(path: string) {
    for (const l of [...this.listeners]) {
      if (this.listeners.has(l) && related(norm(l.path), norm(path))) l.cb(this.snapshot(l.path));
    }
  }

  snapshot(path: string): FakeSnapshot {
    const v = clone(this.read(path));
    const segs = norm(path).split('/');
    return { key: segs[segs.length - 1] || null, exists: () => v !== null && v !== undefined, val: () => (v === undefined ? null : v) };
  }

  set(path: string, value: any) {
    this.writes.push({ op: 'set', path: norm(path), value: clone(value), at: Date.now() });
    this.writeAt(path, value);
    this.notify(path);
  }

  update(path: string, fields: Record<string, any>) {
    this.writes.push({ op: 'update', path: norm(path), value: clone(fields), at: Date.now() });
    for (const [k, v] of Object.entries(fields)) this.writeAt(`${norm(path)}/${k}`, v);
    this.notify(path);
  }

  onValue(path: string, cb: (snap: FakeSnapshot) => void): () => void {
    const l = { path, cb };
    this.listeners.add(l);
    cb(this.snapshot(path));
    return () => { this.listeners.delete(l); };
  }

  pushKey(): string {
    return `-K${String(++this.pushCount).padStart(6, '0')}`;
  }

  /** Writes made by the app to exactly this path. */
  writesTo(path: string) {
    return this.writes.filter((w) => w.path === norm(path));
  }
}

type RefLike = { path: string; key: string | null };

/** The `firebase/database` module, backed by the fake returned by `getDb`. */
export function firebaseDatabaseModule(getDb: () => FakeRealtimeDatabase) {
  const ref = (_db: unknown, path = ''): RefLike => {
    const p = norm(path);
    const segs = p.split('/');
    return { path: p, key: segs[segs.length - 1] || null };
  };
  return {
    getDatabase: () => ({}),
    ref,
    child: (r: RefLike, path: string) => ref(null, `${r.path}/${path}`),
    set: async (r: RefLike, value: any) => getDb().set(r.path, value),
    update: async (r: RefLike, fields: Record<string, any>) => getDb().update(r.path, fields),
    remove: async (r: RefLike) => getDb().set(r.path, null),
    get: async (r: RefLike) => getDb().snapshot(r.path),
    onValue: (r: RefLike, cb: (snap: FakeSnapshot) => void) => getDb().onValue(r.path, cb),
    off: () => {},
    push: (r: RefLike, value?: any) => {
      const key = getDb().pushKey();
      const child = ref(null, `${r.path}/${key}`);
      if (value !== undefined) getDb().set(child.path, value);
      return Object.assign(Promise.resolve(child), child);
    },
    query: (r: RefLike) => r,
    orderByChild: () => ({}),
    orderByKey: () => ({}),
    limitToLast: () => ({}),
    limitToFirst: () => ({}),
    equalTo: () => ({}),
    startAt: () => ({}),
    endAt: () => ({}),
    onChildAdded: () => () => {},
    onChildChanged: () => () => {},
    onChildRemoved: () => () => {},
    runTransaction: async (r: RefLike, fn: (v: any) => any) => {
      const next = fn(getDb().read(r.path));
      if (next !== undefined) getDb().set(r.path, next);
      return { committed: next !== undefined, snapshot: getDb().snapshot(r.path) };
    },
    serverTimestamp: () => ({ '.sv': 'timestamp' }),
    increment: (delta: number) => ({ '.sv': { increment: delta } }),
    onDisconnect: () => ({ set: async () => {}, update: async () => {}, remove: async () => {}, cancel: async () => {} }),
    goOffline: () => {},
    goOnline: () => {},
    connectDatabaseEmulator: () => {},
  };
}
