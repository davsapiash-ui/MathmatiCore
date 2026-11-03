#!/usr/bin/env node
/**
 * Bundles every change still pending in PENDING.md into one Drive script,
 * apply_pending.gs, which the owner pastes into Apps Script once.
 *
 * Usage (from the repo root): node tools/prd-sync/build_pending.cjs
 *
 * A row is pending when its last column is "ממתין"; its ops file is the cell
 * that ends in ".json". Each op replaces text that occurs exactly once, inside
 * one paragraph — the script never inserts, deletes or moves a paragraph.
 * An op is skipped as already applied when its "marker" (default: its new
 * text) is already in the Doc, so running the script twice changes nothing.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ROOT = path.join(DIR, '..', '..');
const PRD = path.join(ROOT, 'מסמכי אפיון', 'מתמטיקאור 2.0 - PRD.md');

// The owner's semester-B Drive folder "מתמטיקאור סמסטר ב" (3.11.2026). The
// earlier copies of these Docs are frozen; never point a script at them again.
const DOC_IDS = {
  'PRD': '1m93koO0eidytMr2VcfXLUTsGMuYj2pT3l3qD8ObXjm4',
  'מסמך 01': '1ecUQzkuBJ9_X8E8bQ4FK-fxty6s5J5D62nqqcxG81b4',
  'מסמך 02': '1uRIimZUZxEFmkNcI0f8TRjlH3N6cdOMZNR0vIXb7XmY',
  'מסמך 03': '1Ueg88U7rWwvfMZ7ZTiyJSQ0Uyjz8JZ63dimcxvpuNys',
  'מסמך 04': '18ZKge-9nAGSA31M77ptraSJN_dk-GV4vNNMKe3sFnIw',
  'סקירה': '1rdW-5RVEanJFvGNEv7cQbWPxkgxgLWANZ7OztpuflvM',
};

const rows = fs.readFileSync(path.join(DIR, 'PENDING.md'), 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.startsWith('|'))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
const pending = rows.filter((cells) => cells[cells.length - 1] === 'ממתין');

const docs = new Map();
for (const cells of pending) {
  const file = cells.find((c) => c.endsWith('.json'));
  if (!file) throw new Error(`a pending row has no ops file: ${cells.join(' | ')}`);
  for (const op of JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'))) {
    if (!DOC_IDS[op.doc]) throw new Error(`${file}: unknown doc "${op.doc}"`);
    if (!op.old || !op.new) throw new Error(`${file}: an op without old/new (${op.where || ''})`);
    if (!docs.has(op.doc)) docs.set(op.doc, []);
    docs.get(op.doc).push([op.old, op.new, op.marker || op.new, op.count || 1]);
  }
}

const version = (fs.readFileSync(PRD, 'utf8').match(/^גרסה ([0-9.]+)/) || [])[1] || null;
const list = [...docs].map(([name, edits]) =>
  `  { name: ${JSON.stringify(name)}, id: '${DOC_IDS[name]}', version: ${name === 'PRD' && version ? `'${version}'` : 'null'}, edits: [\n` +
  edits.map((e) => '    ' + JSON.stringify(e)).join(',\n') + '\n  ] }').join(',\n');

const head =
  `// MathmatiCore — כל השינויים שממתינים לגוגל דוקס (tools/prd-sync/PENDING.md): ${pending.length} שינויים.\n` +
  '// נבנה בפקודה node tools/prd-sync/build_pending.cjs — לא עורכים ידנית.\n' +
  '// הרצה: checkAll לבדיקה (לא משנה דבר), ואז runAll.\n' +
  `var DOCS = [\n${list}\n];\n\n`;
fs.writeFileSync(path.join(DIR, 'apply_pending.gs'), head + fs.readFileSync(path.join(DIR, 'apply_runtime.gs'), 'utf8'));
console.log(`apply_pending.gs: ${pending.length} pending change(s), ${[...docs.values()].flat().length} edit(s) in ${docs.size} doc(s).`);
