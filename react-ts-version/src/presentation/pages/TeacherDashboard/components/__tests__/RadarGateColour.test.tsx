/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: { currentUser: null },
  db: {},
  serverNow: () => Date.now(),
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  // No live data: the grid keeps the learners it was given.
  onValue: vi.fn(() => vi.fn()),
  update: vi.fn().mockResolvedValue(undefined),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => vi.fn()),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({})) }));

import { HeatmapGrid, describeRadarCell, type AnonymousStudent } from '../HeatmapGrid';
import { RADAR_CELL_CLASSES } from '@/core/radarColor';
import { TEACHER_GATE_HE } from '@/core/routeLabels';

/**
 * דוח "האפיון מול התוכנה" (28.9.2026), מ.5. PRD מודול 18 §ב: "BLUE > RED > GREY
 * > YELLOW > GREEN"; "The background colours remain driven strictly by activity
 * timing, connection state, and help requests". לומד שממתין בשער קיבל משבצת
 * כתומה-צהובה שגברה על אפור, אדום וצהוב. השער הוא של מודול 20 (הטבלה מעל
 * הרדאר); במשבצת הוא שורה משלו, והרקע נקבע רק לפי מודול 18.
 */
const base = (n: number, over: Partial<AnonymousStudent>): AnonymousStudent => ({
  id: `student_${n}`,
  studentNumber: n,
  displayName: `תלמיד ${n}`,
  sessionNumber: 2,
  currentPath: 'ירוק',
  status: 'active',
  hesitationSeconds: 0,
  errorCount: 0,
  enhancedSupport: false,
  isStruggling: false,
  isSocraticActive: false,
  helpRequested: false,
  lastAction: '',
  isOnline: true,
  ...over,
});

const gate = { isWaitingAtGate: true, recommendedPath: 'ירוק' as const };
const students: AnonymousStudent[] = [
  base(1, { ...gate, isOnline: false, lastAction: 'יצא מהחלון' }), // GREY
  base(2, { ...gate, isSocraticActive: true }),                    // RED
  base(3, { ...gate, hesitationSeconds: 120 }),                    // YELLOW
  base(4, { ...gate }),                                            // GREEN
  base(5, { ...gate, helpRequested: true }),                       // BLUE
  base(6, {}),                                                     // GREEN, not at the gate
  ...[7, 8, 9, 10, 11, 12].map((n) => base(n, { isOnline: false })),
];

function tile(n: number): HTMLElement {
  return screen.getAllByRole('button').find((el) => el.getAttribute('aria-label')?.startsWith(`תלמיד ${n}.`))!;
}

describe('מ.5 — שער האישור אינו צובע את המשבצת', () => {
  it('הרקע של לומד שממתין בשער נקבע רק לפי מודול 18', () => {
    render(<HeatmapGrid initialStudents={students} />);
    const expected: Array<[number, keyof typeof RADAR_CELL_CLASSES]> = [
      [1, 'GREY'], [2, 'RED'], [3, 'YELLOW'], [4, 'GREEN'], [5, 'BLUE'],
    ];
    for (const [n, colour] of expected) {
      const el = tile(n);
      expect(el.getAttribute('data-radar-color'), `תלמיד ${n}`).toBe(colour);
      for (const cls of RADAR_CELL_CLASSES[colour].split(' ')) {
        expect(el.className, `תלמיד ${n}`).toContain(cls);
      }
      // The old gate colour is gone.
      expect(el.className, `תלמיד ${n}`).not.toContain('bg-amber-500/25');
    }
  });

  it('לומד בשער ולומד שלא בשער באותו מצב — אותו רקע בדיוק', () => {
    render(<HeatmapGrid initialStudents={students} />);
    expect(tile(4).className).toBe(tile(6).className);
  });

  it('תגית המצב היא של מודול 18, והשער בשורה משלו — גם כשהלומד מנותק', () => {
    render(<HeatmapGrid initialStudents={students} />);
    const offline = tile(1);
    expect(within(offline).getAllByText('יצא מהחלון').length).toBeGreaterThan(0);
    const row = within(offline).getByTestId('gate-row-student-1');
    expect(row.textContent).toContain(TEACHER_GATE_HE);
    expect(row.textContent).toContain('המסלול הירוק');
    expect(within(tile(6)).queryByTestId('gate-row-student-6')).toBeNull();
    // The card tag still shows on the red tile of a learner at the gate, and the
    // blue tile says why it is blue (the gate tag used to hide that it had no tag).
    expect(within(tile(2)).getAllByText('כרטיס החניכה פתוח').length).toBeGreaterThan(0);
    expect(within(tile(5)).getAllByText('קריאה לעזרה').length).toBeGreaterThan(0);
    expect(within(tile(5)).queryByText('פעיל')).toBeNull();
  });

  it('טבלת השער של מודול 20 נשארה מעל הרדאר, עם המלצה ואישור לכל לומד', () => {
    render(<HeatmapGrid initialStudents={students} />);
    expect(screen.getByText(`5 תלמידים סיימו את שלב האבחון וממתינים ב${TEACHER_GATE_HE} למפגש 3`)).toBeTruthy();
  });

  it('גם לקורא מסך: המצב קודם, השער אחריו', () => {
    const text = describeRadarCell(students[0], true, 45);
    expect(text.indexOf('יצא מהחלון')).toBeGreaterThan(-1);
    expect(text.indexOf(TEACHER_GATE_HE)).toBeGreaterThan(text.indexOf('יצא מהחלון'));
    const red = describeRadarCell(students[1], true, 45);
    expect(red.indexOf('כרטיס החניכה פתוח')).toBeLessThan(red.indexOf(TEACHER_GATE_HE));
  });
});
