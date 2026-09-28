#!/usr/bin/env node
/**
 * Compare two ux-audit reports — a branch against main (or after against before).
 *
 *   node tests/ux-audit/compare.mjs <base report.json> <candidate report.json> [out.md]
 *
 * For every state × viewport the candidate measured, it says whether the state
 * is fixed, unchanged, also failing on the base ("also fails on base"), or new /
 * worse than the base (a failure the base did not have, or the same failure
 * with more pixels). Exit code 1 when anything is new or worse — the merge rule
 * "no state worse than main" in one command.
 */
import * as fs from 'node:fs';

const [, , baseFile, candFile, outFile] = process.argv;
if (!baseFile || !candFile) {
  console.error('usage: compare.mjs <base report.json> <candidate report.json> [out.md]');
  process.exit(2);
}
const HIGH = new Set(['page-scroll-y', 'page-scroll-x', 'needs-scroll', 'clipped', 'offscreen', 'console-error']);
const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
const cand = JSON.parse(fs.readFileSync(candFile, 'utf8'));

const key = (r) => `${r.viewport}|${r.mode}|${r.path}|${r.state}`;
const worst = (r) => {
  const hits = (r.findings || []).filter((f) => HIGH.has(f.type));
  if (!hits.length) return null;
  return hits.sort((a, b) => (b.px || 0) - (a.px || 0))[0];
};
const baseByKey = new Map(base.results.map((r) => [key(r), r]));

const rows = [];
for (const r of cand.results) {
  const b = baseByKey.get(key(r));
  const cw = worst(r);
  const bw = b ? worst(b) : null;
  let verdict;
  if (r.error) verdict = 'unreachable';
  else if (!cw) verdict = bw ? 'fixed' : 'ok';
  else if (!b) verdict = 'not measured on base';
  else if (!bw) verdict = 'NEW';
  else if ((cw.px || 0) > (bw.px || 0) * 1.1 + 4) verdict = 'WORSE';
  else verdict = 'also fails on base';
  rows.push({ r, cw, bw, verdict });
}

const count = (v) => rows.filter((x) => x.verdict === v).length;
const lines = [];
lines.push(`# ux-audit: ${cand.gitHead} vs ${base.gitHead}`);
lines.push('');
lines.push(`- candidate: ${cand.results.length} measurements · base: ${base.results.length}`);
lines.push(`- ok ${count('ok')} · fixed ${count('fixed')} · also fails on base ${count('also fails on base')} · NEW ${count('NEW')} · WORSE ${count('WORSE')} · unreachable ${count('unreachable')} · not measured on base ${count('not measured on base')}`);
lines.push('');
const fmt = (w) => (w ? `${w.type}${w.px ? ` ${w.px}px` : ''} (${(w.container || w.selector).slice(0, 50)})` : '—');
for (const verdict of ['NEW', 'WORSE', 'also fails on base', 'unreachable', 'not measured on base']) {
  const list = rows.filter((x) => x.verdict === verdict);
  if (!list.length) continue;
  lines.push(`## ${verdict} (${list.length})`);
  lines.push('');
  lines.push('| viewport | state | candidate | base |');
  lines.push('|---|---|---|---|');
  for (const { r, cw, bw } of list) {
    const label = `${r.state}${r.mode !== 'default' ? ` (${r.mode})` : ''}${r.path === 'remediation_path' ? ' (rem)' : ''}`;
    lines.push(`| ${r.viewport} | ${label} | ${r.error ? `💥 ${r.error.slice(0, 60)}` : fmt(cw)} | ${fmt(bw)} |`);
  }
  lines.push('');
}
const fixed = rows.filter((x) => x.verdict === 'fixed');
if (fixed.length) {
  lines.push(`## fixed (${fixed.length})`);
  lines.push('');
  lines.push(fixed.map(({ r }) => `${r.viewport}:${r.state}`).join(', '));
  lines.push('');
}
const md = lines.join('\n');
if (outFile) fs.writeFileSync(outFile, md, 'utf8');
console.log(md);
process.exit(count('NEW') + count('WORSE') > 0 ? 1 : 0);
