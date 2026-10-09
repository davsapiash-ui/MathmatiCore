/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

/**
 * PRD מודול 1 §א ומודול 25 §ב.3 — "רשימת הקודים … גלויים למורה ולמנהל המערכת,
 * וכל אחד מהם יכול לשנות את הקוד של לומד." התצוגה "קודי גישה" בניהול הכיתה:
 * 12 קודים מהשרת, ו"קוד חדש" מחליף את הקוד של הלומד הזה בלבד.
 */
const h = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; data: unknown }>,
  fail: false,
}));

vi.mock('@/infrastructure/firebase', () => ({ functions: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => async (data?: unknown) => {
    h.calls.push({ name, data });
    if (h.fail) throw new Error('unavailable');
    if (name === 'getLearnerAccessCodes') {
      const codes: Record<string, string> = {};
      for (let id = 1; id <= 12; id++) codes[String(id)] = `${String(id).padStart(2, '0')}47`;
      return { data: { classId: 'class_1', codes } };
    }
    if (name === 'regenerateLearnerAccessCode') {
      const id = (data as { studentId: number }).studentId;
      return { data: { studentId: id, code: `${String(id).padStart(2, '0')}90` } };
    }
    throw new Error(`unexpected ${name}`);
  },
}));

import { LearnerAccessCodes } from '../LearnerAccessCodes';

beforeEach(() => { h.calls = []; h.fail = false; });
afterEach(cleanup);

describe('קודי גישה — תצוגת המורה', () => {
  it('מציגה את 12 הקודים שהשרת מחזיר', async () => {
    render(<LearnerAccessCodes />);
    expect(await screen.findByText('0147')).toBeTruthy();
    expect(screen.getByText('1247')).toBeTruthy();
    expect(screen.getAllByTestId('learner-access-code')).toHaveLength(12);
    expect(h.calls.map((c) => c.name)).toEqual(['getLearnerAccessCodes']);
  });

  it('"קוד חדש" מחליף רק את הקוד של הלומד שנבחר', async () => {
    render(<LearnerAccessCodes />);
    await screen.findByText('0747');
    fireEvent.click(screen.getByRole('button', { name: 'קוד חדש לתלמיד 7' }));
    await waitFor(() => expect(screen.getByText('0790')).toBeTruthy());
    expect(screen.queryByText('0747')).toBeNull();
    expect(screen.getByText('0647')).toBeTruthy();
    expect(h.calls[1]).toEqual({ name: 'regenerateLearnerAccessCode', data: { studentId: 7 } });
  });

  it('הכותרת "קודי גישה", והקודים אינם נשמרים בדפדפן', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    try {
      render(<LearnerAccessCodes />);
      await screen.findByText('0147');
      expect(screen.getByText('קודי גישה')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'קוד חדש לתלמיד 3' }));
      await waitFor(() => expect(screen.getByText('0390')).toBeTruthy());
      expect(local).not.toHaveBeenCalled();
    } finally {
      local.mockRestore();
    }
  });

  it('כשל בטעינה — הודעה, ואין קודים', async () => {
    h.fail = true;
    render(<LearnerAccessCodes />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryAllByTestId('learner-access-code')).toHaveLength(0);
  });
});
