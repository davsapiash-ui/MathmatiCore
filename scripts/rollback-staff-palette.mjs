#!/usr/bin/env node
// Rollback of the teacher/admin palette change (PR #266, 10.10.2026).
//
// What #266 changed, and what this script puts back:
//   indigo brand            -> violet            (restored to indigo)
//   amber notices/buttons   -> stone / slate-700 (restored to amber)
//   emerald "approved/online" -> violet          (restored to emerald)
//   close-session rose-600  -> rose-800          (restored)
//   gradient headers/buttons -> solid violet     (restored)
//   DESIGN_SYSTEM_RULES.md 3.3, BUTTON_DESIGN_RULES.md (restored)
// The state before the change is commit bf9ad1d (main, 10.10.2026, before #266).
//
// Kept by default (they are not colour changes; pass --everything to revert them too):
//   - the deterministic ChildTexts_OwnerDecisions test (it was flaky on main)
//   - no technical "מזהה: student_N" line on the gate card (Zero-PII)
//
// The Google Docs sentences added by tools/prd-sync/apply_10oct_staff_palette.gs are
// taken out again with tools/prd-sync/revert_10oct_staff_palette.gs (run it in Apps
// Script, like the forward one). This script does not touch the Docs.
//
// Usage (from the repo root, with a clean working tree):
//   node scripts/rollback-staff-palette.mjs            # revert, run tests + build, push branch revert/staff-palette
//   node scripts/rollback-staff-palette.mjs --no-verify
//   node scripts/rollback-staff-palette.mjs --no-push
//   node scripts/rollback-staff-palette.mjs --everything
//   node scripts/rollback-staff-palette.mjs --dry-run  # only say which commit would be reverted
// Then open a pull request from revert/staff-palette to main; the deploy runs on merge.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const prArg = args.find((a) => a.startsWith('--pr='));
const PR = prArg ? Number(prArg.slice(5)) : 266;
const BRANCH = `revert/staff-palette${PR === 266 ? '' : `-${PR}`}`;
const TEST_FILE = 'react-ts-version/src/core/__tests__/ChildTexts_OwnerDecisions.test.tsx';
const GATE_CARD = 'react-ts-version/src/presentation/pages/TeacherDashboard/ClassManagement.tsx';

const out = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const run = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd });
const fail = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };

if (out('git status --porcelain')) fail('the working tree is not clean; commit or stash first.');
run('git fetch origin main');

// The commit that brought the pull request into main: a merge commit (two parents,
// "Merge pull request #N") or a squash ("… (#N)").
const line = out(`git log origin/main --format=%H%x09%P%x09%s -n 500`)
  .split('\n')
  .map((l) => l.split('\t'))
  .find(([, , s]) => new RegExp(`Merge pull request #${PR}\\b|\\(#${PR}\\)`).test(s));
if (!line) fail(`no commit of pull request #${PR} on origin/main. Is it merged?`);
const [sha, parents, subject] = line;
const isMerge = parents.split(' ').length === 2;
console.log(`Reverting ${sha.slice(0, 7)} — ${subject}${isMerge ? ' (merge commit, -m 1)' : ''}`);
if (has('--dry-run')) process.exit(0);

run(`git checkout -B ${BRANCH} origin/main`);
run(`git revert --no-commit ${isMerge ? '-m 1 ' : ''}${sha}`);

if (!has('--everything')) {
  // Keep the deterministic test as the pull request left it.
  if (out(`git ls-tree --name-only ${sha} -- ${TEST_FILE}`)) run(`git checkout ${sha} -- ${TEST_FILE}`);
  // Keep the gate card without the technical learner id (Zero-PII).
  if (existsSync(GATE_CARD)) {
    const src = readFileSync(GATE_CARD, 'utf8');
    const re = /\n[ \t]*<span className="[^"]*font-mono">\s*מזהה: \{student\.id\}\s*<\/span>/;
    if (re.test(src)) writeFileSync(GATE_CARD, src.replace(re, ''));
    else console.warn(`(no "מזהה: {student.id}" line in ${GATE_CARD}; nothing to keep out)`);
  }
  run('git add -A');
}

run(`git commit -q -m "Revert the teacher/admin palette (pull request #${PR})${has('--everything') ? '' : ', keeping the test fix and the Zero-PII gate card'}"`);

if (!has('--no-verify')) {
  console.log('\nRunning the frontend quality gate (npm test, npm run build)…');
  run('npm test', 'react-ts-version');
  run('npm run build', 'react-ts-version');
}

if (!has('--no-push')) {
  run(`git push -u origin ${BRANCH}`);
  const remote = out('git remote get-url origin').replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
  console.log(`\n✓ Pushed. Open the pull request: ${remote}/compare/main...${BRANCH}?expand=1`);
} else {
  console.log(`\n✓ Branch ${BRANCH} is ready locally (not pushed).`);
}
