/**
 * @vitest-environment jsdom
 *
 * Register, "הסרת שמות מורים מהמערכת": the teacher's only identity is the
 * whitelisted address; no name is kept or shown. The sign-in used to store the
 * Google account's display name with the session, and the top bar of the
 * learner lobby (/hub, which a teacher may open) showed it (audit 2.10.2026,
 * cross-17).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Topbar } from '../Topbar';
import { useAuthStore } from '@/application/useAuthStore';

afterEach(cleanup);

describe('the top bar shows staff by role, never by name', () => {
  it('a session that still carries a display name does not show it', () => {
    useAuthStore.setState({
      user: { uid: 'teacher_t', email: 't@school.edu', role: 'teacher', displayName: 'Dana Levi' },
      role: 'teacher',
      isAuthenticated: true,
      isStudentAuthenticated: false,
    });
    const { container } = render(
      <MemoryRouter initialEntries={['/hub']}>
        <Topbar />
      </MemoryRouter>
    );
    expect(container.textContent).not.toContain('Dana Levi');
    expect(container.textContent).not.toContain('t@school.edu');
    expect(container.textContent).toContain('מורה');
  });

  it('the staff sign-in passes no display name into the session', () => {
    const login = readFileSync(resolve(__dirname, '../../../pages/Login.tsx'), 'utf-8');
    expect(login).not.toContain('authenticatedUser.displayName');
  });
});

describe('the sign-in messages address the teacher in the plural, in Hebrew', () => {
  it('the blocked-window message has no singular verbs and no English term', () => {
    const login = readFileSync(resolve(__dirname, '../../../pages/Login.tsx'), 'utf-8');
    expect(login).toContain('"הדפדפן חסם את חלון הכניסה של Google. אשרו חלונות קופצים בדפדפן ונסו שוב."');
    expect(login).not.toContain('Popups');
    expect(login).not.toContain('ונסה שוב');
  });
});
