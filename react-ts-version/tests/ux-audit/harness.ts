import type { Browser, BrowserContext, Page, WebSocketRoute } from '@playwright/test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { measurePage, type Finding, type Measurement } from './measure';
import type { Viewport } from './viewports';

/**
 * How the audit reaches every student screen without a teacher, a server or
 * the live database:
 *
 *  - Authentication is injected the way Login.tsx stores it (mc_auth_* keys),
 *    for the pilot's test learner, student 12.
 *  - Every HTTP request to Firebase (Auth, Firestore, Functions) is blocked.
 *    The Realtime Database's WebSocket is answered by a small in-process fake
 *    (FakeRtdb below) that speaks the client's wire protocol: it serves the
 *    learner's record, the class, and — most importantly — the teacher's
 *    `active_class_session`, so the audit can open a meeting, pause it, close
 *    it and switch on the projector exactly as the teacher's dashboard would.
 *    Nothing is written to the live project, and every run is identical.
 *  - Screens are then driven through `window.__wsStore` (useWorkspaceStore's
 *    dev hook): the same actions the real UI calls — initSession, selectBranch,
 *    openSocraticCard, showFeedback, toggleBoard … — never a fake DOM.
 *
 * Because it relies on the dev hooks, the audit runs against `vite` (dev), never
 * against a production build.
 */

export const STUDENT_NUMBER = 12;
export const STUDENT_UID = `student_user${STUDENT_NUMBER}`;
export const TEACHER_ID = '1002220159';

export type Mode = 'default' | 'asd' | 'enhanced';
export type LearningPath = 'green_path' | 'remediation_path';

export interface ClassSessionRecord {
  active: boolean;
  status: 'active' | 'paused' | 'closed';
  sessionNumber: number | null;
  startedAt: number | null;
  pausedAt?: number | null;
  endedAt?: number | null;
  teacherId: string;
  teacherDisconnectedAt: null;
}

/** The teacher opened meeting `n` a minute ago (core/classSession.ts: live, inside the 45-minute cap). */
export function liveSession(n: number, status: 'active' | 'paused' = 'active'): ClassSessionRecord {
  return {
    active: true,
    status,
    sessionNumber: n,
    startedAt: Date.now() - 60_000,
    pausedAt: status === 'paused' ? Date.now() : null,
    teacherId: TEACHER_ID,
    teacherDisconnectedAt: null,
  };
}

export function closedSession(): ClassSessionRecord {
  return { active: false, status: 'closed', sessionNumber: null, startedAt: null, endedAt: Date.now(), teacherId: TEACHER_ID, teacherDisconnectedAt: null };
}

export interface ContextOptions {
  mode: Mode;
  path: LearningPath;
  /** Gate approval for meeting 3 (Module 20). false = the bee-flight waiting screen. */
  approved: boolean;
  /** false = the diagnostic was never finished: no path to approve, no meeting 3 (PR #139's quiet wait). Default true. */
  meeting2Done?: boolean;
  /** false = no learner signed in (login / landing screens). */
  auth?: boolean;
  /** The class session at start; the default is meeting 1 open. gotoWorkspace() re-points it. */
  classSession?: ClassSessionRecord;
}

export interface StateResult {
  viewport: string;
  tier: 'A' | 'B';
  mode: Mode;
  path: LearningPath;
  meeting: number | null;
  state: string;
  note?: string;
  url: string;
  fonts: Measurement['fonts'];
  findings: Finding[];
  consoleErrors: string[];
  screenshot?: string;
  /** The state could not be reached (exception while driving the store). */
  error?: string;
}

export const OUT_DIR = path.resolve(process.cwd(), 'test-results', 'ux-audit');
export const REPORT_JSON = path.join(OUT_DIR, 'report.json');
export const REPORT_MD = path.join(OUT_DIR, 'report.md');

// ── the fake Realtime Database ─────────────────────────────────────────────

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const norm = (p: unknown): string => String(p ?? '').replace(/^\/+|\/+$/g, '');
const segs = (p: string): string[] => (p ? p.split('/').filter(Boolean) : []);

/** Writes the client sends that the fake acknowledges but does not keep (large, irrelevant to layout). */
const DISCARDED_WRITES = /(^|\/)(telemetry_sessions|chunks|replays|radar_alerts|sessions|semantic_trace|events)(\/|$)/;

/**
 * Enough of the RTDB wire protocol (v5) for the Firebase JS client to believe
 * it is connected: the handshake, listens (with an immediate data push),
 * gets, puts/merges (reflected to listeners), auth, stats and unlistens.
 */
export class FakeRtdb {
  private root: Json = {};
  private sockets = new Map<WebSocketRoute, Set<string>>();
  private sessionCounter = 0;

  constructor(seed: Record<string, Json>) {
    for (const [p, v] of Object.entries(seed)) this.write(norm(p), v);
  }

  attach(context: BrowserContext): Promise<void> {
    return context.routeWebSocket(/firebaseio\.com|firebasedatabase\.app/, (ws) => this.serve(ws));
  }

  get(p: string): Json {
    let node: Json = this.root;
    for (const s of segs(norm(p))) {
      if (node === null || typeof node !== 'object' || Array.isArray(node)) return null;
      node = (node as Record<string, Json>)[s] ?? null;
    }
    return node ?? null;
  }

  /** Change a value the way the teacher's dashboard would, and notify every listener. */
  set(p: string, value: Json): void {
    const clean = norm(p);
    this.write(clean, value);
    this.broadcast(clean);
  }

  /** Server values the client sends as placeholders ({".sv":"timestamp"}) become real ones. */
  private resolve(value: Json): Json {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const o = value as Record<string, Json>;
      if (o['.sv'] === 'timestamp' && Object.keys(o).length === 1) return Date.now();
      const out: Record<string, Json> = {};
      for (const [k, v] of Object.entries(o)) out[k] = this.resolve(v);
      return out;
    }
    return value;
  }

  private write(p: string, raw: Json): void {
    const value = this.resolve(raw);
    const parts = segs(p);
    if (parts.length === 0) {
      this.root = value ?? {};
      return;
    }
    if (this.root === null || typeof this.root !== 'object' || Array.isArray(this.root)) this.root = {};
    let node = this.root as Record<string, Json>;
    for (const s of parts.slice(0, -1)) {
      const next = node[s];
      if (next === null || next === undefined || typeof next !== 'object' || Array.isArray(next)) node[s] = {};
      node = node[s] as Record<string, Json>;
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = value;
  }

  private related(a: string, b: string): boolean {
    return a === b || a === '' || b === '' || a.startsWith(b + '/') || b.startsWith(a + '/');
  }

  private broadcast(changed: string): void {
    for (const [ws, listened] of this.sockets) {
      for (const p of listened) {
        if (this.related(p, changed)) this.push(ws, p);
      }
    }
  }

  private push(ws: WebSocketRoute, p: string): void {
    this.send(ws, { t: 'd', d: { a: 'd', b: { p, d: this.get(p) } } });
  }

  private send(ws: WebSocketRoute, frame: unknown): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      this.sockets.delete(ws);
    }
  }

  private serve(ws: WebSocketRoute): void {
    const listened = new Set<string>();
    this.sockets.set(ws, listened);
    const host = (() => {
      try {
        return new URL(ws.url()).host;
      } catch {
        return 'localhost';
      }
    })();
    this.sessionCounter += 1;
    // The server speaks first: the handshake carries the server clock the client
    // uses for `.info/serverTimeOffset` (so serverNow() ≈ Date.now()). The client
    // sends nothing until it has one, so if the first frame raced the socket's
    // opening it is sent again — a repeated handshake is ignored once connected.
    const handshake = () =>
      this.send(ws, { t: 'c', d: { t: 'h', d: { ts: Date.now(), v: '5', h: host, s: `ux-audit-${this.sessionCounter}` } } });
    let heard = false;
    handshake();
    for (const delay of [400, 1500, 4000]) {
      setTimeout(() => {
        if (!heard) handshake();
      }, delay);
    }

    ws.onMessage((raw) => {
      heard = true;
      if (typeof raw !== 'string') return;
      const text = raw.trim();
      if (!text || text === '0') return; // keep-alive
      let msg: { t?: string; d?: { r?: number; a?: string; b?: Record<string, Json> } };
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (msg?.t !== 'd' || !msg.d) return;
      const { r, a, b } = msg.d;
      const reply = (d: Json) => this.send(ws, { t: 'd', d: { r, b: { s: 'ok', d } } });
      const p = norm(b?.p);
      switch (a) {
        case 'q': {
          listened.add(p);
          reply('');
          this.push(ws, p);
          return;
        }
        case 'n':
          listened.delete(p);
          reply('');
          return;
        case 'g':
          reply(this.get(p));
          return;
        case 'p': {
          if (!DISCARDED_WRITES.test(p)) {
            this.write(p, (b?.d ?? null) as Json);
            this.broadcast(p);
          }
          reply('');
          return;
        }
        case 'm': {
          if (!DISCARDED_WRITES.test(p) && b?.d && typeof b.d === 'object' && !Array.isArray(b.d)) {
            for (const [k, v] of Object.entries(b.d as Record<string, Json>)) this.write(`${p}/${k}`, v);
            this.broadcast(p);
          }
          reply('');
          return;
        }
        case 'auth':
        case 'gauth':
          reply({ auth: { uid: 'ux-audit', provider: 'anonymous' }, expires: Math.floor(Date.now() / 1000) + 3600 });
          return;
        default:
          // stats ('s'), onDisconnect ('o'/'om'/'oc'), unauth, appcheck …
          if (r !== undefined) reply('');
      }
    });
    ws.onClose(() => this.sockets.delete(ws));
  }
}

// ── network: everything else is blocked ────────────────────────────────────

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const EMULATOR = /^https?:\/\/(localhost|127\.0\.0\.1):5001\//;

export async function blockRemote(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (EMULATOR.test(url)) return route.abort('connectionrefused');
    if (LOCAL.test(url) || FONTS.test(url)) return route.continue();
    return route.abort('blockedbyclient');
  });
}

// ── console noise the blocked network is expected to produce ───────────────

const EXPECTED_OFFLINE_NOISE = [
  /firebase/i,
  /firestore/i,
  /identitytoolkit|securetoken|googleapis\.com|cloudfunctions|firebaseio|firebaseapp/i,
  /net::ERR_|ERR_BLOCKED_BY_CLIENT|ERR_CONNECTION_REFUSED|ERR_FAILED/i,
  /Failed to fetch|NetworkError|Load failed|network-request-failed/i,
  /Could not reach Cloud Firestore|backend didn't respond|client is offline/i,
  /permission[-_ ]denied|unavailable|deadline-exceeded|functions\//i,
  /localhost:5001|emulator/i,
  /Anonymous sign-in unavailable|clock offset|serverTimeOffset/i,
  /Socratic Hint failed|LLM/i,
  /Failed to load resource/i,
];

export function isExpectedNoise(message: string): boolean {
  return EXPECTED_OFFLINE_NOISE.some((re) => re.test(message));
}

// ── context ────────────────────────────────────────────────────────────────

export function studentRecord(opts: ContextOptions): Record<string, Json> {
  const done = opts.meeting2Done !== false;
  return {
    studentId: STUDENT_UID,
    student_anonymous_id: STUDENT_NUMBER,
    classId: 'class_1',
    name: `תלמיד ${STUDENT_NUMBER}`,
    completedMeeting2: done,
    session_2_completed: done,
    highestCompletedMeeting: done ? 2 : 1,
    teacher_gate_approved: done && opts.approved,
    routeStatus: !done ? null : opts.approved ? 'APPROVED' : 'PENDING',
    routeRecommendation: null,
    pedagogicalPath: done && opts.approved ? opts.path : null,
    isASD: opts.mode === 'asd',
    support_profile_id: opts.mode === 'enhanced' ? 'enhanced_cognitive_support' : null,
    enhanced_support_profile: opts.mode === 'enhanced',
  };
}

function seedDatabase(opts: ContextOptions): Record<string, Json> {
  return {
    [`users/students/${STUDENT_UID}`]: studentRecord(opts),
    schools: { school_bikorot: { id: 'school_bikorot', name: 'בית ספר הביקורות', city: '', classes: ['class_1'] } },
    classes: { class_1: { id: 'class_1', name: 'המבקרים', schoolId: 'school_bikorot', teacherId: TEACHER_ID, students: [] } },
    public_classes: { class_1: { id: 'class_1', name: 'המבקרים', schoolId: 'school_bikorot' } },
    'users/teachers': { [TEACHER_ID]: { id: TEACHER_ID, name: 'המורה', schoolId: 'school_bikorot', classes: ['class_1'], licenseActive: true } },
    'system_control/globalStudentLimit': 12,
    'system_control/globalChatEnabled': true,
    'system_control/projector_mode': { active: false, projector_mode: false, projector_mode_updated_at: 1 },
    active_class_session: (opts.classSession ?? liveSession(1)) as unknown as Json,
  };
}

export interface AuditContext {
  context: BrowserContext;
  page: Page;
  opts: ContextOptions;
  rtdb: FakeRtdb;
  /** Console errors since the last `drainConsole()`. */
  drainConsole: () => string[];
  /** The id of the state being measured, for the console log. */
  setState: (id: string) => void;
}

export async function openContext(browser: Browser, viewport: Viewport, opts: ContextOptions): Promise<AuditContext> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    hasTouch: viewport.width < 1100,
  });
  await blockRemote(context);
  const rtdb = new FakeRtdb(seedDatabase(opts));
  await rtdb.attach(context);

  const auth = opts.auth !== false;
  const record = studentRecord(opts);
  await context.addInitScript(
    ({ auth, record, uid, num }) => {
      const now = Date.now();
      // The learner, exactly as Login.tsx stores them after a successful handshake.
      if (auth) {
        const user = {
          uid,
          id: uid,
          student_id: num,
          role: 'student',
          school_id: 'school_bikorot',
          class_name: 'המבקרים',
          class_type: 'כיתת ביקורת',
          displayName: `תלמיד ${num}`,
          authTimestamp: now,
        };
        for (const store of [localStorage, sessionStorage]) {
          store.setItem('mc_auth_user', JSON.stringify(user));
          store.setItem('mc_auth_role', 'student');
          store.setItem('mc_auth_time', String(now));
        }
        localStorage.setItem('mc_student_last_active', String(now));
        localStorage.removeItem('mc_student_window_closed');
      } else {
        for (const store of [localStorage, sessionStorage]) {
          ['mc_auth_user', 'mc_auth_role', 'mc_auth_time'].forEach((k) => store.removeItem(k));
        }
      }
      // A fresh meeting every time: no cached progress, no old deadline, no tour,
      // and no memory of a failed WebSocket (the SDK would fall back to long-polling).
      Object.keys(localStorage)
        .filter((k) => k.startsWith('mathmaticore_session_') || k.startsWith('mathmaticore_deadline_notice_') || k.includes('previous_websocket_failure'))
        .forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      (window as unknown as Record<string, unknown>).__E2E_BYPASS_TOUR__ = true;

      // The learner's record on the dev-only store hook as well, so the workspace
      // does not wait for the (fake) database's first push.
      if (auth) {
        const timer = setInterval(() => {
          const s = (window as unknown as { useStore?: { setState: (fn: (p: { students: Record<string, unknown> }) => unknown) => void } }).useStore;
          if (s && typeof s.setState === 'function') {
            s.setState((prev) => ({ firebaseLoaded: true, students: { ...(prev.students || {}), [uid]: record } }));
            clearInterval(timer);
          }
        }, 5);
        setTimeout(() => clearInterval(timer), 20_000);
      }
    },
    { auth, record, uid: STUDENT_UID, num: STUDENT_NUMBER }
  );

  // Silent by default: the audit presses read-aloud buttons on the way (the
  // reflection board's first button is one), and on the owner's PC the
  // browser spoke them aloud. Nothing here measures speech. Each read still
  // "ends" at once, so a speaker button does not stay in its playing state.
  // UX_AUDIT_SPEECH=1 lets the browser speak.
  if (process.env.UX_AUDIT_SPEECH !== '1') {
    await context.addInitScript(() => {
      const synth = window.speechSynthesis as SpeechSynthesis | undefined;
      if (!synth) return;
      synth.speak = (utterance: SpeechSynthesisUtterance) => {
        setTimeout(() => utterance.onend?.call(utterance, new Event('end') as SpeechSynthesisEvent), 0);
      };
    });
  }

  const page = await context.newPage();
  let stateId = 'init';
  let buffer: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') buffer.push(`[${stateId}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    buffer.push(`[${stateId}] UNCAUGHT ${err.message}`);
  });

  return {
    context,
    page,
    opts,
    rtdb,
    drainConsole: () => {
      const out = buffer;
      buffer = [];
      return out;
    },
    setState: (id) => {
      stateId = id;
    },
  };
}

// ── driving ────────────────────────────────────────────────────────────────

/** Loading texts of the workspace; the screen is ready once none of them is visible. */
const LOADING_TEXTS = ['טוען את המשימות', 'מתחברים…', 'טוען…', 'עוברים לתחנה'];

/** Open meeting `meeting` as the teacher would (active_class_session) and enter it as the learner. */
export async function gotoWorkspace(c: AuditContext, meeting: number): Promise<void> {
  // A fresh learner record for every meeting: no saved workspace, and the gate
  // approval exactly as the context declares it (a state may have revoked it).
  c.rtdb.set(`users/students/${STUDENT_UID}`, studentRecord(c.opts));
  c.rtdb.set('active_class_session', liveSession(meeting) as unknown as Json);
  c.rtdb.set('system_control/projector_mode', { active: false, projector_mode: false, projector_mode_updated_at: Date.now() });
  const ready = (timeout: number) =>
    c.page.waitForFunction(
      (texts) => {
        const w = window as unknown as { __wsStore?: unknown };
        if (!w.__wsStore) return false;
        const body = document.body.innerText || '';
        return !texts.some((t) => body.includes(t));
      },
      LOADING_TEXTS,
      { timeout }
    );
  await c.page.goto(`/workspace?meeting=${meeting}`, { waitUntil: 'domcontentloaded' });
  try {
    await ready(25_000);
  } catch {
    // A hang on the loader (about one navigation in a few hundred, always on
    // meeting 3, which waits for the database's clock): the Firebase client
    // has given up on WebSockets for this origin and fallen back to
    // long-polling, which is blocked. Forget that, then one reload; the real
    // error if it persists.
    await c.page.evaluate(() => {
      try {
        Object.keys(localStorage)
          .filter((k) => k.includes('previous_websocket_failure'))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        /* ignore */
      }
    });
    await c.page.reload({ waitUntil: 'domcontentloaded' });
    await ready(45_000);
  }
  await c.page.evaluate(() => document.fonts.ready.then(() => undefined));
}

export async function gotoPath(c: AuditContext, url: string): Promise<void> {
  await c.page.goto(url, { waitUntil: 'domcontentloaded' });
  await c.page.waitForFunction(
    (texts) => {
      const body = document.body.innerText || '';
      return body.trim().length > 0 && !texts.some((t) => body.includes(t));
    },
    LOADING_TEXTS,
    { timeout: 60_000 }
  );
  await c.page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Run `fn` against the workspace store's state/actions (dev hook). */
export async function ws<T>(page: Page, fn: string, arg?: unknown): Promise<T> {
  // `fn` is the body of a function receiving (st, api, arg) where st = getState().
  return page.evaluate(
    ({ fn, arg }) => {
      const api = (window as unknown as { __wsStore: { getState: () => unknown; setState: (p: unknown) => void } }).__wsStore;
      if (!api) throw new Error('window.__wsStore is missing — is this the dev server?');
      // eslint-disable-next-line no-new-func
      const f = new Function('st', 'api', 'arg', fn);
      return f(api.getState(), api, arg);
    },
    { fn, arg }
  ) as Promise<T>;
}

/** Number of exercises in the active bank (the progress dots the child sees). */
export async function activeTaskCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('[role="progressbar"] [aria-hidden="true"] > *').length);
}

/** Let animations finish and keep the learner "active" (the 5-minute idle logout). */
export async function settle(page: Page, ms = 650): Promise<void> {
  await page.mouse.move(8 + Math.random() * 4, 8 + Math.random() * 4);
  await page.waitForTimeout(ms);
  await page.evaluate(() => {
    try {
      localStorage.setItem('mc_student_last_active', String(Date.now()));
    } catch {
      /* ignore */
    }
  });
}

// ── measuring ──────────────────────────────────────────────────────────────

export async function measure(page: Page): Promise<Measurement & { runtimeError?: string }> {
  const m = await page.evaluate(measurePage);
  const overlay = await page.evaluate(() => {
    const el = document.querySelector('vite-error-overlay');
    if (!el) return null;
    const root = (el as HTMLElement).shadowRoot;
    return (root?.textContent || el.textContent || 'vite-error-overlay').slice(0, 300);
  });
  if (overlay) {
    m.findings.unshift({ type: 'offscreen', severity: 'high', selector: 'vite-error-overlay', text: overlay });
    return { ...m, runtimeError: overlay };
  }
  return m;
}

export interface CaptureOptions {
  viewport: Viewport;
  ctx: AuditContext;
  meeting: number | null;
  state: string;
  note?: string;
  /** Always keep a screenshot for this viewport (the primary one). */
  screenshotAll: boolean;
  /** Wait before measuring; default 650ms. */
  settleMs?: number;
  /** Console errors this state is expected to log (a crash the step itself causes). */
  expectedConsole?: RegExp;
}

export async function capture(o: CaptureOptions): Promise<StateResult> {
  const { page, opts } = o.ctx;
  o.ctx.setState(o.state);
  await settle(page, o.settleMs);
  const m = await measure(page);
  const consoleErrors = o.ctx.drainConsole();
  const realErrors = consoleErrors.filter((e) => !isExpectedNoise(e) && !(o.expectedConsole && o.expectedConsole.test(e)));
  const findings = [...m.findings];
  for (const e of realErrors) {
    findings.push({ type: 'console-error', severity: 'high', selector: 'console', text: e.slice(0, 200) });
  }
  const hasHigh = findings.some((f) => f.severity === 'high');
  let screenshot: string | undefined;
  if (o.screenshotAll || hasHigh) {
    const dir = path.join(OUT_DIR, 'shots', o.viewport.id);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${opts.mode}-${opts.path === 'remediation_path' ? 'rem-' : ''}${o.state}.png`);
    try {
      await page.screenshot({ path: file, fullPage: false });
      screenshot = path.relative(OUT_DIR, file);
    } catch {
      /* a closed page mid-run must not lose the measurement */
    }
  }
  return {
    viewport: o.viewport.id,
    tier: o.viewport.tier,
    mode: opts.mode,
    path: opts.path,
    meeting: o.meeting,
    state: o.state,
    note: o.note,
    url: page.url(),
    fonts: m.fonts,
    findings,
    consoleErrors,
    screenshot,
  };
}

// ── report ─────────────────────────────────────────────────────────────────

export interface Report {
  generatedAt: string;
  gitHead: string;
  baseURL: string;
  results: StateResult[];
}

function gitHead(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/** Merge this viewport's results into the report on disk (a crash keeps earlier viewports). */
export function saveResults(viewportId: string, results: StateResult[], baseURL: string): Report {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let report: Report = { generatedAt: new Date().toISOString(), gitHead: gitHead(), baseURL, results: [] };
  if (fs.existsSync(REPORT_JSON)) {
    try {
      const prev = JSON.parse(fs.readFileSync(REPORT_JSON, 'utf8')) as Report;
      report = { ...prev, generatedAt: report.generatedAt, gitHead: report.gitHead, baseURL };
    } catch {
      /* start over */
    }
  }
  report.results = [...report.results.filter((r) => r.viewport !== viewportId), ...results];
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(REPORT_MD, renderMarkdown(report), 'utf8');
  return report;
}

export function resetReport(): void {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const HIGH = new Set(['page-scroll-y', 'page-scroll-x', 'needs-scroll', 'clipped', 'offscreen', 'console-error']);

export function worst(findings: Finding[]): Finding | null {
  const order: Finding['severity'][] = ['high', 'medium', 'low'];
  for (const sev of order) {
    const list = findings.filter((f) => f.severity === sev);
    if (list.length) return list.sort((a, b) => (b.px || 0) - (a.px || 0))[0];
  }
  return null;
}

function cell(r: StateResult | undefined): string {
  if (!r) return '—';
  if (r.error) return `💥 ${r.error.slice(0, 40)}`;
  const w = worst(r.findings.filter((f) => f.severity !== 'low'));
  if (!w) return '✓';
  const icon = HIGH.has(w.type) ? '✗' : '△';
  return `${icon} ${w.type}${w.px ? ` ${w.px}px` : ''}`;
}

export function renderMarkdown(report: Report): string {
  const lines: string[] = [];
  const viewports = Array.from(new Set(report.results.map((r) => r.viewport)));
  const byKey = new Map<string, StateResult>();
  for (const r of report.results) byKey.set(`${r.viewport}|${r.mode}|${r.path}|${r.state}`, r);
  const states = Array.from(new Set(report.results.map((r) => `${r.mode}|${r.path}|${r.state}`)));

  const total = report.results.length;
  const failing = report.results.filter((r) => r.findings.some((f) => HIGH.has(f.type)));
  const failingA = failing.filter((r) => r.tier === 'A');

  lines.push(`# ביקורת UX/UI — מסע התלמיד`);
  lines.push('');
  lines.push(`- נוצר: ${report.generatedAt} · commit ${report.gitHead} · ${report.baseURL}`);
  lines.push(`- מצבים שנמדדו: ${total} · נכשלים (גלילה/חיתוך/מחוץ למסך): ${failing.length} · מהם בגדלי החובה (שכבה א): ${failingA.length}`);
  lines.push('');
  lines.push(`## מפת מצבים × גדלי מסך`);
  lines.push('');
  lines.push(`✓ תקין · ✗ גלילה/חיתוך/מחוץ למסך (עם מספר הפיקסלים) · △ בעיה בינונית (כפתור מכוסה / כיוון) · 💥 המסך לא הושג`);
  lines.push('');
  lines.push(`| מצב | ${viewports.join(' | ')} |`);
  lines.push(`|---|${viewports.map(() => '---').join('|')}|`);
  for (const key of states) {
    const [mode, p, state] = key.split('|');
    const label = `${state}${mode !== 'default' ? ` (${mode})` : ''}${p === 'remediation_path' ? ' (צמצום פערים)' : ''}`;
    const cells = viewports.map((v) => cell(byKey.get(`${v}|${mode}|${p}|${state}`)));
    lines.push(`| ${label} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push(`## הממצאים, מקובצים`);
  lines.push('');
  const groups = new Map<string, { f: Finding; where: Set<string>; states: Set<string>; shots: Set<string> }>();
  for (const r of report.results) {
    for (const f of r.findings) {
      if (f.severity === 'low') continue;
      const k = `${f.type}|${f.container || ''}|${f.selector}`;
      const g = groups.get(k) || { f, where: new Set<string>(), states: new Set<string>(), shots: new Set<string>() };
      g.where.add(r.viewport);
      g.states.add(`${r.state}${r.mode !== 'default' ? `/${r.mode}` : ''}${r.path === 'remediation_path' ? '/rem' : ''}`);
      if (r.screenshot) g.shots.add(r.screenshot);
      if ((f.px || 0) > (g.f.px || 0)) g.f = f;
      groups.set(k, g);
    }
  }
  const sorted = Array.from(groups.values()).sort((a, b) => {
    const sa = a.f.severity === 'high' ? 0 : 1;
    const sb = b.f.severity === 'high' ? 0 : 1;
    return sa - sb || b.states.size - a.states.size || (b.f.px || 0) - (a.f.px || 0);
  });
  if (sorted.length === 0) lines.push('אין ממצאים בדרגה בינונית או גבוהה.');
  for (const g of sorted) {
    const f = g.f;
    const statesList = Array.from(g.states);
    lines.push(`- **${f.type}**${f.px ? ` · ${f.px}px` : ''}${f.count && f.count > 1 ? ` · ${f.count} רכיבים` : ''} — \`${f.selector}\`${f.container ? ` בתוך \`${f.container}\`` : ''}${f.text ? ` — "${f.text}"` : ''}`);
    lines.push(`  - גדלי מסך: ${Array.from(g.where).join(', ')}`);
    lines.push(`  - מצבים (${statesList.length}): ${statesList.slice(0, 12).join(', ')}${statesList.length > 12 ? ' …' : ''}`);
    const shot = Array.from(g.shots)[0];
    if (shot) lines.push(`  - צילום: ${shot}`);
  }
  lines.push('');
  const lows = new Map<string, { f: Finding; n: number }>();
  for (const r of report.results) {
    for (const f of r.findings) {
      if (f.severity !== 'low') continue;
      const k = `${f.type}|${f.selector}`;
      const g = lows.get(k) || { f, n: 0 };
      g.n += 1;
      lows.set(k, g);
    }
  }
  if (lows.size) {
    lines.push(`## הערות (דרגה נמוכה)`);
    lines.push('');
    for (const { f, n } of Array.from(lows.values()).sort((a, b) => b.n - a.n).slice(0, 40)) {
      lines.push(`- ${f.type}${f.px ? ` ${f.px}px` : ''} — \`${f.selector}\`${f.text ? ` "${f.text}"` : ''} (${n} מדידות)`);
    }
    lines.push('');
  }
  const fontsMissing = report.results.filter((r) => !r.fonts.heebo && !r.fonts.rubik && !r.fonts.assistant).length;
  if (fontsMissing) {
    lines.push(`> הערה: ב-${fontsMissing} מדידות אף אחד מהגופנים (Heebo/Rubik/Assistant) לא נטען — רוחבי הטקסט נמדדו בגופן חלופי.`);
  }
  return lines.join('\n');
}
