/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * מודול 25 §ד ומסמך 04: "מחולל כרטיסי כניסה להדפסה". הכרעת בעל המוצר (26.9.2026):
 * כרטיס לכל אחד מ-12 הלומדים — המספר בכיתה, קוד הגישה, ושורה ריקה שבה המורה כותבת
 * את שם התלמיד בכתב יד. השם אינו נכנס למערכת.
 *
 * שהשרת מחזיר את הכרטיסים למנהל המערכת בלבד, עם 12 המזהים והקוד האישי של כל
 * לומד — נבדק ב-functions/src/__tests__/learnerAccessCodes.test.ts.
 */
const root = resolve(__dirname, '../../../..');
const app = readFileSync(resolve(root, 'react-ts-version/src/App.tsx'), 'utf-8');
const index = readFileSync(resolve(root, 'functions/src/index.ts'), 'utf-8');
const login = readFileSync(resolve(root, 'react-ts-version/src/presentation/pages/Login.tsx'), 'utf-8');

const h = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; data: unknown }>,
}));

vi.mock('@/infrastructure/firebase', () => ({ functions: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => async (data?: unknown) => {
    h.calls.push({ name, data });
    if (name === 'getStudentLoginCards') {
      const codes: Record<string, string> = {};
      for (let id = 1; id <= 12; id++) codes[String(id)] = `${String(id).padStart(2, '0')}58`;
      return { data: { studentIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], codes } };
    }
    if (name === 'regenerateLearnerAccessCode') {
      const id = (data as { studentId: number }).studentId;
      return { data: { studentId: id, code: `${String(id).padStart(2, '0')}13` } };
    }
    throw new Error(`unexpected ${name}`);
  },
}));

import { StudentLoginCardsPage } from '@/presentation/pages/admin/StudentLoginCardsPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <StudentLoginCardsPage />
    </MemoryRouter>
  );

beforeEach(() => { h.calls = []; });
afterEach(cleanup);

describe('כרטיסי כניסה לתלמידים', () => {
  it('12 כרטיסים, ועל כל אחד המספר בכיתה והקוד האישי של הלומד', async () => {
    renderPage();
    const cards = await screen.findAllByTestId('login-card');
    expect(cards).toHaveLength(12);
    cards.forEach((card, i) => {
      const id = i + 1;
      expect(within(card).getByText(String(id))).toBeTruthy();
      expect(within(card).getByText(`${String(id).padStart(2, '0')}58`)).toBeTruthy();
    });
    expect(document.body.textContent).not.toContain('10203040');
    expect(h.calls.map((c) => c.name)).toEqual(['getStudentLoginCards']);
  });

  it('הכרטיס משתמש באותן תוויות שעל מסך הכניסה', async () => {
    renderPage();
    const [card] = await screen.findAllByTestId('login-card');
    for (const label of ['המספר שלי בכיתה', 'קוד גישה']) {
      expect(login).toContain(label);
      expect(card.textContent).toContain(label);
    }
  });

  it('שורה ריקה לשם, ושום שדה להקלדת שם (Zero-PII)', async () => {
    renderPage();
    const [card] = await screen.findAllByTestId('login-card');
    expect(card.textContent).toContain('שם התלמיד:');
    expect(document.querySelectorAll('input, textarea, [contenteditable]')).toHaveLength(0);
  });

  it('"קוד חדש" מחליף רק את הקוד שעל הכרטיס הזה, והכפתור אינו מודפס (מודול 25 §ד)', async () => {
    renderPage();
    await screen.findAllByTestId('login-card');
    const button = screen.getByRole('button', { name: 'קוד חדש לתלמיד 4' });
    expect(button.className.split(/\s+/)).toContain('print:hidden');
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText('0413')).toBeTruthy());
    expect(screen.queryByText('0458')).toBeNull();
    expect(screen.getByText('0558')).toBeTruthy();
    expect(h.calls[1]).toEqual({ name: 'regenerateLearnerAccessCode', data: { studentId: 4 } });
  });

  it('הדף פתוח למנהל המערכת בלבד, והפונקציה מיוצאת', () => {
    const at = app.indexOf('path="/admin/login-cards"');
    expect(at).toBeGreaterThan(0);
    expect(app.slice(at, at + 200)).toContain('<AuthGuard allowedRoles={["admin"]}>');
    expect(index).toContain('export { getStudentLoginCards } from "./studentLoginCards";');
  });
});
