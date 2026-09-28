// DEV-ONLY. Seeds the RTDB emulator (demo project) through its admin endpoint
// ("Bearer owner" is the emulator's built-in admin token, not a credential).
// Usage: node dev-harness/seed.mjs <meeting 1-8> [green_path|remediation_path] [paused]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const NS = 'demo-mathmaticore-default-rtdb';
const BASE = 'http://127.0.0.1:9000';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const here = path.dirname(fileURLToPath(import.meta.url));

export async function put(p, body) {
  const r = await fetch(`${BASE}/${p}.json?ns=${NS}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
}

export async function uploadRules() {
  const rules = readFileSync(path.resolve(here, '../../database.rules.json'), 'utf8');
  const r = await fetch(`${BASE}/.settings/rules.json?ns=${NS}`, { method: 'PUT', headers: H, body: rules });
  if (!r.ok) throw new Error(`rules: ${r.status} ${await r.text()}`);
}

export async function seed(meeting, pathName = 'green_path', status = 'active') {
  await uploadRules();
  await put('active_class_session', {
    active: true, status, sessionNumber: meeting, startedAt: Date.now(), teacherId: 'teacher_1',
  });
  const approved = meeting >= 3;
  await put('users/students/student_user12', {
    student_id: 12,
    highestCompletedMeeting: Math.max(0, meeting - 1),
    completedMeeting2: meeting >= 3,
    teacher_gate_approved: approved,
    routeStatus: approved ? 'APPROVED' : null,
    pedagogicalPath: approved ? pathName : null,
    teacher_selected_path: approved ? pathName : null,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [m = '1', p = 'green_path', s = 'active'] = process.argv.slice(2);
  await seed(Number(m), p, s);
  console.log('seeded meeting', m, p, s);
}
