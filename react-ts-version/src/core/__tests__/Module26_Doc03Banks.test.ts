import { describe, it, expect } from 'vitest';
import {
  SESSIONS_BY_PATH,
  getHardcodedCatalogBanks,
  type SessionTask,
  type LearningPath,
} from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS, getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { PLACE_ORDER, PLACE_VALUES, getValue, EMPTY_COUNTS, digitAt, type Place } from '@/core/placeValue';

/**
 * מסמך 03 (האפיון המפורט) §3.3–3.8 — the exercise banks, number for number.
 *
 * The expected numbers below were extracted from the document by a parser
 * (every "X ועוד Y" / "X פחות Y" pair, and every "המספר X", in order of
 * appearance), not transcribed by hand. They are listed in the order the
 * document lists them; the seventh exercise of sessions 4–6 and most of
 * session 7 are described in the document without numbers and are therefore
 * only checked structurally here.
 */

type Pair = [number, '+' | '-', number];

const DOC03_COMPULSORY: Record<4 | 5 | 6 | 8, Record<LearningPath, Pair[]>> = {
  4: { remediation_path: [[142, '+', 23], [128, '+', 35], [247, '+', 135], [456, '+', 281], [354, '+', 128], [507, '+', 125]], green_path: [[1245, '+', 328], [2356, '+', 1427], [3456, '+', 2183], [4821, '+', 1534], [5678, '+', 2453], [7045, '+', 1283]] },
  // green_path exercises 3 and 4 are the owner-approved replacements of 3.9.2026 (מרשם הסטיות, item 3):
  // the document's 7,651 − 3,325 and 8,762 − 4,439 borrow in the units only, so the skills their labels
  // promise (a borrow from the tens, a borrow from the hundreds) were exercised nowhere in the green path.
  5: { remediation_path: [[78, '-', 25], [53, '-', 18], [142, '-', 25], [345, '-', 182], [563, '-', 128], [480, '-', 155]], green_path: [[5432, '-', 2118], [6543, '-', 1227], [7651, '-', 3381], [8762, '-', 4932], [6284, '-', 1157], [3845, '-', 1517]] },
  6: { remediation_path: [[240, '-', 125], [305, '-', 12], [204, '-', 112], [300, '-', 142], [602, '-', 145], [500, '-', 287]], green_path: [[2045, '-', 1128], [3005, '-', 1248], [4000, '-', 1562], [5000, '-', 2345], [6020, '-', 1485], [7003, '-', 2845]] },
  8: { remediation_path: [[142, '+', 23], [128, '+', 35], [456, '+', 281], [78, '-', 25], [53, '-', 18], [302, '-', 145]], green_path: [[1245, '+', 328], [5678, '+', 2453], [5432, '-', 2118], [4354, '-', 1126], [4000, '-', 1562]] },
};

/** מסמך 03 §3.3 — the number each representation task is about, in order (7 per path). */
const DOC03_S3_NUMBERS: Record<LearningPath, number[]> = {
  remediation_path: [340, 340, 450, 85, 506, 506, 160],
  green_path: [3400, 3400, 4500, 5230, 6030, 6030, 2100],
};

/** מסמך 03 "מאגר תרגילי הבחירה" — remediation reinforcement ×2, remediation challenge, green reinforcement ×2, green challenge. */
const DOC03_BRANCH: Record<4 | 5 | 6, Pair[]> = {
  4: [[236, '+', 41], [165, '+', 27], [278, '+', 156], [2341, '+', 125], [3528, '+', 164], [4687, '+', 2459]],
  5: [[86, '-', 34], [72, '-', 48], [523, '-', 187], [5879, '-', 2431], [6352, '-', 1128], [7214, '-', 3568]],
  6: [[305, '-', 102], [250, '-', 130], [600, '-', 247], [4050, '-', 1020], [3006, '-', 1004], [8000, '-', 2376]],
};
/** §3.3 branch numbers: 270 (twice), 320 | 3,600 (twice), 4,200. */
const DOC03_S3_BRANCH_NUMBERS = [270, 320, 3600, 4200];

const PATHS: LearningPath[] = ['remediation_path', 'green_path'];
const pairOf = (t: SessionTask): Pair => [t.numberA ?? NaN, t.isSubtraction ? '-' : '+', t.numberB ?? NaN];
const branchFlat = (session: 3 | 4 | 5 | 6 | 7) => {
  const b = SESSION_BRANCH_TASKS[session];
  return [...b.remediation_path.reinforcement, ...b.remediation_path.challenge, ...b.green_path.reinforcement, ...b.green_path.challenge];
};

describe('מסמך 03: compulsory numbers, session by session', () => {
  it('session 3 — the seven representation targets per path, in the document order', () => {
    for (const path of PATHS) {
      // The document names the number each task is about; a missing_element task
      // ("160 = מאה אחת ועוד כמה?") is about its whole (numberB), not its given part.
      const targets = SESSIONS_BY_PATH[3][path].map((t) => (t.type === 'missing_element' ? t.numberB : t.numberA));
      expect(targets).toEqual(DOC03_S3_NUMBERS[path]);
    }
  });

  it('session 3 — every task carries the exact representation the document prescribes', () => {
    const r = SESSIONS_BY_PATH[3].remediation_path;
    expect(r[0].requiredCounts).toEqual({ hundreds: 3, tens: 4 });
    expect(r[1].requiredCounts).toEqual({ hundreds: 2, tens: 14 });
    expect(r[2].requiredCounts).toEqual({ tens: 45 });
    expect(r[3].requiredCounts).toEqual({ tens: 7, units: 15 });
    expect(r[4].requiredCounts).toEqual({ hundreds: 5, units: 6 });
    expect(r[5].requiredCounts).toEqual({ hundreds: 4, tens: 10, units: 6 });
    expect(r[6].type).toBe('missing_element');
    expect([r[6].numberA, r[6].correctAnswer]).toEqual([100, 60]); // 160 = מאה אחת ועוד 6 עשרות
    const g = SESSIONS_BY_PATH[3].green_path;
    expect(g[0].requiredCounts).toEqual({ thousands: 3, hundreds: 4 });
    expect(g[1].requiredCounts).toEqual({ thousands: 2, hundreds: 14 });
    expect(g[2].requiredCounts).toEqual({ hundreds: 45 });
    expect(g[3].requiredCounts).toEqual({ thousands: 4, hundreds: 11, tens: 13 });
    expect(g[4].requiredCounts).toEqual({ thousands: 6, tens: 3 });
    expect(g[5].requiredCounts).toEqual({ thousands: 5, hundreds: 10, tens: 3 });
    expect(g[6].type).toBe('flexible_decomp');
  });

  for (const session of [4, 5, 6, 8] as const) {
    it(`session ${session} — the document's exercises appear first, in order, per path`, () => {
      for (const path of PATHS) {
        const expected = DOC03_COMPULSORY[session][path];
        const actual = SESSIONS_BY_PATH[session][path].slice(0, expected.length).map(pairOf);
        expect(actual).toEqual(expected);
      }
    });
  }

  it('session 7 — the numbers the document does give (12 עשרות ו-5 יחידות = 125; 150; 25 מאות = 2,500)', () => {
    const r = SESSIONS_BY_PATH[7].remediation_path;
    expect([r[0].type, r[0].numberA]).toEqual(['flexible_decomp', 125]);
    expect([r[6].type, r[6].numberA, r[6].requireEvenTens]).toEqual(['flexible_decomp', 150, true]);
    const g = SESSIONS_BY_PATH[7].green_path;
    expect([g[0].type, g[0].numberA]).toEqual(['flexible_decomp', 2500]);
  });
});

describe('מסמך 03: early-finisher (branch) numbers', () => {
  it('session 3 — 270 twice and 320 for remediation; 3,600 twice and 4,200 for green', () => {
    const b = SESSION_BRANCH_TASKS[3];
    expect(b.remediation_path.reinforcement.map((t) => t.numberA)).toEqual([DOC03_S3_BRANCH_NUMBERS[0], DOC03_S3_BRANCH_NUMBERS[0]]);
    expect(b.remediation_path.reinforcement.map((t) => t.requiredCounts)).toEqual([{ hundreds: 2, tens: 7 }, { tens: 27 }]);
    expect(b.remediation_path.challenge.map((t) => t.numberA)).toEqual([DOC03_S3_BRANCH_NUMBERS[1]]);
    expect(b.green_path.reinforcement.map((t) => t.numberA)).toEqual([DOC03_S3_BRANCH_NUMBERS[2], DOC03_S3_BRANCH_NUMBERS[2]]);
    expect(b.green_path.reinforcement.map((t) => t.requiredCounts)).toEqual([{ thousands: 3, hundreds: 6 }, { hundreds: 36 }]);
    expect(b.green_path.challenge.map((t) => t.numberA)).toEqual([DOC03_S3_BRANCH_NUMBERS[3]]);
  });

  for (const session of [4, 5, 6] as const) {
    it(`session ${session} — 2 reinforcement + 1 challenge per path, the document's numbers in its order`, () => {
      expect(branchFlat(session).map(pairOf)).toEqual(DOC03_BRANCH[session]);
    }
    );
  }

  it('session 7 green reinforcement includes the 25-hundreds proof; skeletons elsewhere', () => {
    const b = SESSION_BRANCH_TASKS[7];
    expect(b.green_path.reinforcement.some((t) => t.type === 'flexible_decomp' && t.numberA === 2500)).toBe(true);
    for (const t of branchFlat(7)) {
      if (t.type !== 'flexible_decomp') expect(t.hiddenDigits).toBeDefined();
    }
  });
});

/* ── Structure required by PRD v7.2 Modules 14 / 26 and מסמך 03 ── */

describe('bank structure', () => {
  it('seven compulsory exercises in every bank of sessions 3–8, both paths', () => {
    for (const session of [3, 4, 5, 6, 7, 8] as const) {
      for (const path of PATHS) {
        const bank = SESSIONS_BY_PATH[session][path];
        expect(bank).toHaveLength(7);
        for (const t of bank) {
          expect(t.isCompulsory).toBe(true);
          expect(t.isOptionalChoiceTask).toBeFalsy();
        }
      }
    }
  });

  it('branch banks exist for sessions 3–7 only, 2 reinforcement + 1 challenge per path, all optional', () => {
    expect(Object.keys(SESSION_BRANCH_TASKS).map(Number).sort()).toEqual([3, 4, 5, 6, 7]);
    for (const session of [3, 4, 5, 6, 7] as const) {
      for (const path of PATHS) {
        const b = SESSION_BRANCH_TASKS[session][path];
        expect(b.reinforcement).toHaveLength(2);
        expect(b.challenge).toHaveLength(1);
        for (const t of [...b.reinforcement, ...b.challenge]) {
          expect(t.isOptionalChoiceTask).toBe(true);
          expect(t.branchType).toBeDefined();
        }
      }
    }
    for (const s of [1, 2, 8]) {
      expect(getSessionBranchTasks(s, 'reinforcement')).toEqual([]);
      expect(getSessionBranchTasks(s, 'challenge')).toEqual([]);
    }
  });

  it('remediation stays within 1,000 and green within 10,000 (Module 26)', () => {
    const all = (path: LearningPath) => [
      ...([3, 4, 5, 6, 7, 8] as const).flatMap((s) => SESSIONS_BY_PATH[s][path]),
      ...([3, 4, 5, 6, 7] as const).flatMap((s) => [...SESSION_BRANCH_TASKS[s][path].reinforcement, ...SESSION_BRANCH_TASKS[s][path].challenge]),
    ];
    for (const t of all('remediation_path')) {
      for (const n of [t.numberA, t.numberB, Number(t.correctAnswer)]) if (Number.isFinite(n)) expect(n).toBeLessThanOrEqual(1000);
    }
    for (const t of all('green_path')) {
      for (const n of [t.numberA, t.numberB, Number(t.correctAnswer)]) if (Number.isFinite(n)) expect(n).toBeLessThanOrEqual(10000);
    }
  });

  it('task ids are unique across every bank', () => {
    const ids = [
      ...([3, 4, 5, 6, 7, 8] as const).flatMap((s) => PATHS.flatMap((p) => SESSIONS_BY_PATH[s][p].map((t) => t.id))),
      ...([3, 4, 5, 6, 7] as const).flatMap((s) => branchFlat(s).map((t) => t.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the hardcoded catalog seed publishes 13 banks: session 1 and both paths of sessions 3–8', () => {
    const ids = getHardcodedCatalogBanks().map((b) => b.id);
    expect(ids).toHaveLength(13);
    expect(ids).toContain('session_1');
    for (const s of [3, 4, 5, 6, 7, 8]) {
      expect(ids).toContain(`session_${s}_green_path`);
      expect(ids).toContain(`session_${s}_remediation_path`);
    }
  });

  it('session 8 is the abstraction stage: vertical exercises only, no board-building task types', () => {
    for (const path of PATHS) {
      for (const t of SESSIONS_BY_PATH[8][path]) expect(t.type).toBe('vertical_addition');
    }
  });
});

/* ── Arithmetic soundness of every exercise (the user's "בדוק שאין טעויות בתרגילים") ── */

const everyTask: SessionTask[] = [
  ...([3, 4, 5, 6, 7, 8] as const).flatMap((s) => PATHS.flatMap((p) => SESSIONS_BY_PATH[s][p])),
  ...([3, 4, 5, 6, 7] as const).flatMap((s) => branchFlat(s)),
];

const needsCarry = (a: number, b: number) => PLACE_ORDER.some((p) => digitAt(a, p) + digitAt(b, p) >= 10);
const needsBorrow = (a: number, b: number) => PLACE_ORDER.some((p) => digitAt(a, p) < digitAt(b, p));

describe('every exercise is arithmetically sound', () => {
  it('vertical exercises: the stored answer equals a ± b, is non-negative, and the regrouping flag matches the digits', () => {
    for (const t of everyTask.filter((x) => x.type === 'vertical_addition')) {
      const a = t.numberA!, b = t.numberB!;
      const expected = t.isSubtraction ? a - b : a + b;
      expect(t.correctAnswer, t.id).toBe(expected);
      expect(expected, t.id).toBeGreaterThanOrEqual(0);
      if (t.isSubtraction) {
        expect(Boolean(t.requiresUngrouping), t.id).toBe(needsBorrow(a, b));
        expect(t.requiresGrouping, t.id).toBeUndefined();
      } else {
        expect(Boolean(t.requiresGrouping), t.id).toBe(needsCarry(a, b));
        expect(t.requiresUngrouping, t.id).toBeUndefined();
      }
    }
  });

  it('skeleton exercises: hidden operand digits exist in the operand, the result is fully revealed, and the hidden digits are uniquely determined', () => {
    for (const t of everyTask.filter((x) => x.hiddenDigits)) {
      const a = t.numberA!, b = t.numberB!;
      const result = t.isSubtraction ? a - b : a + b;
      const resultLen = String(result).length;
      expect(t.revealedResultDigits, t.id).toEqual(PLACE_ORDER.slice(0, resultLen));
      // Hidden digits are in one operand only; with the other operand and the result known the solution is unique.
      expect(Boolean(t.hiddenDigits!.a) !== Boolean(t.hiddenDigits!.b), t.id).toBe(true);
      const hidden = t.hiddenDigits!.a ?? t.hiddenDigits!.b!;
      const operand = t.hiddenDigits!.a ? a : b;
      const operandLen = String(operand).length;
      for (const place of hidden) expect(PLACE_ORDER.indexOf(place), `${t.id} ${place}`).toBeLessThan(operandLen);
      // The instruction shows the skeleton with the true result written out.
      expect(t.instructionHe, t.id).toContain(result.toLocaleString('en-US'));
    }
  });

  it('missing-result-digit exercises: exactly one result digit is withheld, the rest revealed', () => {
    for (const t of everyTask.filter((x) => x.revealedResultDigits && !x.hiddenDigits)) {
      const result = t.isSubtraction ? t.numberA! - t.numberB! : t.numberA! + t.numberB!;
      const places = PLACE_ORDER.slice(0, String(result).length);
      expect(t.revealedResultDigits!.length, t.id).toBe(places.length - 1);
      for (const p of t.revealedResultDigits!) expect(places, t.id).toContain(p);
    }
  });

  it('representation exercises: the prescribed blocks are worth exactly the number to be written', () => {
    for (const t of everyTask.filter((x) => x.type === 'representation')) {
      const counts = { ...EMPTY_COUNTS, ...t.requiredCounts };
      expect(getValue(counts), t.id).toBe(t.numberA);
      expect(t.correctAnswer, t.id).toBe(t.numberA);
      expect(Object.values(t.requiredCounts!).some((n) => n > 0), t.id).toBe(true);
    }
  });

  it('flexible exercises: the number has at least two distinct representations obeying the task rule', () => {
    for (const t of everyTask.filter((x) => x.type === 'flexible_decomp')) {
      const n = t.numberA!;
      // Canonical and "one high block split into ten low ones" always differ; with the even-tens rule,
      // 150 = 14 tens + 10 units and 150 = 1 hundred + 4 tens + 10 units are two even-tens representations.
      if (t.requireEvenTens) {
        expect(n % 20 === 10 || n % 20 === 0, t.id).toBe(true);
      } else {
        expect(n, t.id).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('small_change inquiries: one marked-correct choice whose id is the stored answer', () => {
    for (const t of everyTask.filter((x) => x.type === 'small_change')) {
      const correct = t.choices!.filter((c) => c.correct);
      expect(correct, t.id).toHaveLength(1);
      expect(t.correctAnswer, t.id).toBe(correct[0].id);
    }
  });

  it('session 8 reuses only numbers the learner met in sessions 4–6 of the same path, where the document reuses them', () => {
    for (const path of PATHS) {
      const earlier = new Set(([4, 5, 6] as const).flatMap((s) => SESSIONS_BY_PATH[s][path].map((t) => `${t.numberA}${t.isSubtraction ? '-' : '+'}${t.numberB}`)));
      const s8 = SESSIONS_BY_PATH[8][path].map((t) => `${t.numberA}${t.isSubtraction ? '-' : '+'}${t.numberB}`);
      // מסמך 03 §3.8 lists two exercises (302 − 145; 4,354 − 1,126) that do not appear in §3.4–3.6; every other one does.
      const documentedExceptions = new Set(['302-145', '4354-1126']);
      for (const key of s8) {
        if (!documentedExceptions.has(key)) expect(earlier.has(key), `${path} ${key}`).toBe(true);
      }
    }
  });
});

describe('skill coverage the owner asked to guarantee (3.9.2026)', () => {
  const borrowColumns = (a: number, b: number): Place[] => {
    const out: Place[] = [];
    let borrow = 0;
    for (const p of PLACE_ORDER) {
      const d = digitAt(a, p) - borrow;
      if (d < digitAt(b, p)) { out.push(p); borrow = 1; } else { borrow = 0; }
    }
    return out;
  };
  it('session 5 green path exercises a borrow from the tens only and a borrow from the hundreds only', () => {
    const cols = SESSIONS_BY_PATH[5].green_path.filter((t) => t.isSubtraction).map((t) => borrowColumns(t.numberA!, t.numberB!).join(','));
    expect(cols).toContain('tens');
    expect(cols).toContain('hundreds');
  });
});
