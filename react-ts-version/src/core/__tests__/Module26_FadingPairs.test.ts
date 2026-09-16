import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SESSIONS_BY_PATH } from '@/data/sessionTasks';

/**
 * מסמך 03 §3.8: מפגש 8 משתמש רק במספרים שהלומד פגש במפגשים 4–6. הדוח של
 * מודול 23 משווה כל תרגיל במפגש 8 לתאום שלו (אותם מספרים, אותה פעולה)
 * דרך FADING_PAIRS בצד השרת. הבדיקה הזאת מוודאת שהטבלה בשרת תואמת את
 * מאגרי התרגילים בפועל — אחרת הדוח ישווה תרגילים שונים.
 */
const server = readFileSync(resolve(__dirname, '../../../../functions/src/meetingMetrics.ts'), 'utf-8');
const block = server.slice(server.indexOf('export const FADING_PAIRS'), server.indexOf('};', server.indexOf('export const FADING_PAIRS')));
const pairs: Record<string, string> = {};
for (const m of block.matchAll(/(s8_[rg]_t\d+): "(s[456]_[rg]_t\d+)"/g)) pairs[m[1]] = m[2];

type Bank = { id: string; type: string; numberA?: number; numberB?: number; isSubtraction?: boolean; hiddenDigits?: unknown };
const isPuzzle = (t: Bank) => Boolean(t.hiddenDigits);
const bank = (session: 4 | 5 | 6 | 8): Bank[] =>
  [...SESSIONS_BY_PATH[session].green_path, ...SESSIONS_BY_PATH[session].remediation_path] as Bank[];
const earlier = [...bank(4), ...bank(5), ...bank(6)];
const twinOf = (t: Bank) =>
  // Same numbers, same operation, same kind of task: a missing-digit puzzle on 4,000 − 1,562 is not the column subtraction on it.
  earlier.find((e) => !isPuzzle(e) && e.type === t.type && e.numberA === t.numberA && e.numberB === t.numberB && Boolean(e.isSubtraction) === Boolean(t.isSubtraction));

describe('FADING_PAIRS (functions/src/meetingMetrics.ts) matches the exercise banks', () => {
  it('every pair points at an exercise with the same operands and the same operation', () => {
    expect(Object.keys(pairs).length).toBeGreaterThan(0);
    for (const [s8Id, twinId] of Object.entries(pairs)) {
      const t = bank(8).find((x) => x.id === s8Id);
      const e = earlier.find((x) => x.id === twinId);
      expect(t, s8Id).toBeDefined();
      expect(e, twinId).toBeDefined();
      expect([e!.type, e!.numberA, e!.numberB, Boolean(e!.isSubtraction)], `${s8Id} ↔ ${twinId}`)
        .toEqual([t!.type, t!.numberA, t!.numberB, Boolean(t!.isSubtraction)]);
    }
  });

  it('every session-8 exercise that has a twin in sessions 4–6 is in the table, and only those', () => {
    for (const t of bank(8)) {
      if (typeof t.numberA !== 'number' || typeof t.numberB !== 'number') continue;
      if (isPuzzle(t)) { expect(pairs[t.id], `${t.id} is a missing-digit puzzle, never paired`).toBeUndefined(); continue; }
      const twin = twinOf(t);
      if (twin) expect(pairs[t.id], `${t.id} should pair with ${twin.id}`).toBe(twin.id);
      else expect(pairs[t.id], `${t.id} has no twin in 4–6`).toBeUndefined();
    }
  });
});
