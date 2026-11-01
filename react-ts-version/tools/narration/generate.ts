/**
 * Records the child's narration (PRD Module 7, owner, 29.10.2026).
 *
 *   npm run narration            records what is missing
 *   npm run narration -- --check lists what is missing, records nothing
 *   npm run narration -- --force records everything again
 *
 * Input: every sentence the code can list (src/core/narrationCatalog.ts) and its pointed
 * reading (narration/pointed.he.json). A sentence with no pointed reading stops the run:
 * point it first, check it with Dicta and a second reader, add it to the file, then run
 * again. The pointing is for the voice only — the screen stays unpointed.
 *
 * Output: public/narration/<key>.mp3 and public/narration/manifest.json.
 * Voice: Google Cloud Text-to-Speech he-IL-Wavenet-A, the voice the owner chose by ear
 * (29.10.2026; the Chirp 3 HD voice misread kamatz and clipped a final ה).
 *
 * Access: GCLOUD_ACCESS_TOKEN if set, otherwise the Firebase CLI login on this machine
 * (the owner approved its use for this, 29.10.2026). Project: mathimaticore.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';
import { narrationCatalog } from '../../src/core/narrationCatalog';
import { namesTeacher, narrationKey } from '../../src/core/narrationSegments';

const ROOT = resolve(__dirname, '../..');
const OUT = resolve(ROOT, 'public/narration');
const POINTED = resolve(ROOT, 'narration/pointed.he.json');
const VOICE = 'he-IL-Wavenet-A';
const RATE = 0.92;
const PROJECT = 'mathimaticore';

export interface PointedEntry {
  text: string;
  pointed?: string;
  pointed_f?: string;
  pointed_m?: string;
}

/**
 * One sentence per <s>, with a pause after it. A colon ends a heading ("משימת היעד:"),
 * so it is read as the end of a sentence: as a colon the voice left the words hanging
 * (owner, by ear, 29.10.2026).
 */
export function toSsml(pointed: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parts = (pointed.match(/[^.?!:]+[.?!:]?/g) ?? []).map((s) => s.trim()).filter(Boolean);
  return (
    '<speak>' +
    parts
      .map((p) => {
        const end = p.slice(-1);
        const body = end === ':' ? `${p.slice(0, -1)}.` : /[.?!]/.test(end) ? p : `${p}.`;
        return `<s>${esc(body)}</s><break time="${end === ':' ? 450 : 300}ms"/>`;
      })
      .join('') +
    '</speak>'
  );
}

async function accessToken(): Promise<string> {
  if (process.env.GCLOUD_ACCESS_TOKEN) return process.env.GCLOUD_ACCESS_TOKEN;
  const npmRoot = resolve(process.env.APPDATA ?? '', 'npm/node_modules/firebase-tools/lib');
  const req = createRequire(__filename);
  const { configstore } = req(resolve(npmRoot, 'configstore.js'));
  const auth = req(resolve(npmRoot, 'auth.js'));
  const t = await auth.getAccessToken(configstore.get('tokens').refresh_token, []);
  return t.access_token ?? t;
}

async function synthesize(token: string, pointed: string): Promise<Buffer> {
  const body = { input: { ssml: toSsml(pointed) }, voice: { languageCode: 'he-IL', name: VOICE }, audioConfig: { audioEncoding: 'MP3', speakingRate: RATE } };
  for (let attempt = 1; ; attempt++) {
    const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) return Buffer.from(((await r.json()) as { audioContent: string }).audioContent, 'base64');
    if (attempt >= 4 || (r.status !== 429 && r.status < 500)) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
    await new Promise((s) => setTimeout(s, 2000 * attempt));
  }
}

/** Each recording to make: its key and the pointed text it is read from. */
export function recordingPlan(entries: PointedEntry[]): { jobs: { key: string; pointed: string; text: string }[]; unpointed: string[] } {
  const byText = new Map(entries.map((e) => [e.text, e]));
  const jobs: { key: string; pointed: string; text: string }[] = [];
  const unpointed: string[] = [];
  for (const { text } of narrationCatalog()) {
    const e = byText.get(text);
    if (!e) {
      unpointed.push(text);
      continue;
    }
    if (namesTeacher(text)) {
      if (!e.pointed_f || !e.pointed_m) {
        unpointed.push(text);
        continue;
      }
      jobs.push({ key: narrationKey(text, 'female'), pointed: e.pointed_f, text });
      jobs.push({ key: narrationKey(text, 'male'), pointed: e.pointed_m, text });
    } else if (e.pointed) {
      jobs.push({ key: narrationKey(text, 'female'), pointed: e.pointed, text });
    } else {
      unpointed.push(text);
    }
  }
  return { jobs, unpointed };
}

async function main() {
  const check = process.argv.includes('--check');
  const force = process.argv.includes('--force');
  const entries = JSON.parse(readFileSync(POINTED, 'utf8')) as PointedEntry[];
  const { jobs, unpointed } = recordingPlan(entries);
  if (unpointed.length) {
    console.error(`${unpointed.length} sentences have no pointed reading in narration/pointed.he.json:`);
    for (const t of unpointed) console.error(`  ${t}`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const todo = jobs.filter((j) => force || !existsSync(resolve(OUT, `${j.key}.mp3`)));
  console.log(`${jobs.length} recordings, ${todo.length} to make.`);
  if (check) {
    process.exitCode = todo.length ? 1 : 0;
    return;
  }

  const token = todo.length ? await accessToken() : '';
  let n = 0;
  for (const j of todo) {
    writeFileSync(resolve(OUT, `${j.key}.mp3`), await synthesize(token, j.pointed));
    if (++n % 50 === 0) console.log(`  ${n}/${todo.length}`);
  }
  const wanted = new Set(jobs.map((j) => j.key));
  const keys = readdirSync(OUT)
    .filter((f) => f.endsWith('.mp3'))
    .map((f) => f.slice(0, -4))
    .filter((k) => wanted.has(k))
    .sort();
  writeFileSync(resolve(OUT, 'manifest.json'), `${JSON.stringify({ voice: VOICE, keys }, null, 1)}\n`);
  console.log(`Done. manifest.json lists ${keys.length} recordings.`);
}

// Imported by the coverage test (recordingPlan); run by `npm run narration`. The catalog's
// imports open a Firebase connection that would keep Node alive, hence the explicit exit.
if (!process.env.VITEST) {
  main().then(
    () => process.exit(process.exitCode ?? 0),
    (e) => {
      console.error(e);
      process.exit(1);
    }
  );
}
