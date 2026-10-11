/**
 * @vitest-environment jsdom
 *
 * Admin overview, owner decisions of 11.10.2026 (PRD Module 24):
 *  - M13: no per-school chart of classes and teachers (§ד: "ללא חשיפת בתי ספר,
 *    כיתות או תלמידים ספציפיים").
 *  - L8: no "בזמן אמת" — the overview reads a cache refreshed once a day (§ב).
 *  - L9: no claims the system has nothing to back (encryption at rest,
 *    "רישיונות פעילים", "בהתאם לתקן הפיילוט", "רשומים לפיילוט").
 *  - L10: all eight meetings and the overall average; meeting 1 is not scored
 *    (Module 14 §ב; Module 23: "הדשבורד מציג 'לא נמדד' ולא 0%").
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const h = vi.hoisted(() => ({
  cache: {
    updated_at: 1,
    total_students: 12,
    average_mastery_percent: 71.6,
    session_breakdown: {
      '1': { created: 12, completed: 12, completion_rate_percent: 100, average_score_percent: null },
      '3': { created: 10, completed: 8, completion_rate_percent: 80, average_score_percent: 64 },
    },
  } as Record<string, unknown>,
}));

vi.mock('@/infrastructure/firebase', () => ({ database: {}, firestore: {}, db: {}, functions: {}, auth: { currentUser: null }, authReady: Promise.resolve() }));
vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})), query: vi.fn(() => ({})), orderByChild: vi.fn(), limitToLast: vi.fn(),
  onValue: vi.fn(() => () => {}), get: vi.fn(() => Promise.resolve({ val: () => 0 })),
  set: vi.fn(), update: vi.fn(), push: vi.fn(() => ({ key: 'k' })), runTransaction: vi.fn(),
  onDisconnect: vi.fn(() => ({ set: vi.fn() })), serverTimestamp: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})), collection: vi.fn(() => ({})),
  onSnapshot: vi.fn((_ref: unknown, next: (snap: unknown) => void) => {
    next({ exists: () => true, data: () => h.cache, forEach: () => {} });
    return () => {};
  }),
  getDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn(),
}));

import { AdminOverview } from '../AdminOverview';
import { useAdminStore } from '@/application/useAdminStore';

afterEach(cleanup);

const source = readFileSync(resolve(__dirname, '../AdminOverview.tsx'), 'utf-8');

describe('admin overview — aggregates only, no unfounded claims', () => {
  it('shows all eight meetings, meeting 1 as "לא נמדד", and the overall average without meeting 1', () => {
    useAdminStore.setState({ schools: [], teachers: [], classes: [], initAdminSubscriptions: () => () => {} } as never);
    render(<AdminOverview />);
    for (let m = 1; m <= 8; m++) expect(screen.getByText(`מפגש ${m}`)).toBeTruthy();
    const meeting1 = screen.getByText('מפגש 1').closest('div.p-4') as HTMLElement;
    expect(within(meeting1).getByText('לא נמדד')).toBeTruthy();
    expect(within(meeting1).queryByText('0%')).toBeNull();
    const meeting3 = screen.getByText('מפגש 3').closest('div.p-4') as HTMLElement;
    expect(within(meeting3).getByText('64%')).toBeTruthy();
    const overall = screen.getByTestId('overall-average-score');
    expect(overall.textContent).toContain('ללא מפגש 1');
    expect(overall.textContent).toContain('72%');
    expect(screen.getByText('תמונת מצב פדגוגית מרוכזת (מפגשים 1–8)')).toBeTruthy();
  });

  it('has no per-school chart and names no school', () => {
    expect(source).not.toContain('schoolDistributionData');
    expect(source).not.toContain('התפלגות כיתות ומורים לפי מוסד');
    expect(source).not.toContain('from "recharts"');
  });

  it('claims nothing it cannot back', () => {
    for (const claim of ['בזמן אמת', 'הצפנת נתונים במנוחה', 'At Rest', 'רישיונות פעילים', 'בהתאם לתקן הפיילוט', 'רשומים לפיילוט', 'מורים מובילים']) {
      expect(source.includes(claim), claim).toBe(false);
    }
  });
});
