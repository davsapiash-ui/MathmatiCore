/**
 * @vitest-environment jsdom
 *
 * Owner decision 11.10.2026: a read-only staff account signed in as the admin
 * sees the console and changes nothing — no catalog publish, no calibration,
 * no teacher added or removed, no reset.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/infrastructure/firebase', () => ({ database: {}, firestore: {}, db: {}, functions: {}, auth: { currentUser: null }, authReady: Promise.resolve() }));
vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn(() => () => {}), get: vi.fn(), set: vi.fn(), update: vi.fn(), push: vi.fn(() => ({ key: 'k' })), runTransaction: vi.fn(), onDisconnect: vi.fn(() => ({ set: vi.fn() })), serverTimestamp: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => undefined })), setDoc: vi.fn(), onSnapshot: vi.fn(() => () => {}), collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), getDocs: vi.fn(() => Promise.resolve({ docs: [], empty: true, size: 0, forEach: () => {} })), writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn() })) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })) }));

import { AdminCurriculumView } from '../AdminCurriculumView';
import { AdminSchoolsView } from '../AdminSchoolsView';
import { useAdminStore } from '@/application/useAdminStore';
import { READ_ONLY_TITLE, useReadOnlyStaffStore } from '@/application/useIsReadOnlyStaff';

afterEach(() => {
  cleanup();
  useReadOnlyStaffStore.setState({ readOnly: false });
});

describe('admin console, read-only', () => {
  it('the catalog publish and the calibration save are disabled with the title', () => {
    useReadOnlyStaffStore.setState({ readOnly: true });
    render(<AdminCurriculumView />);
    const publish = screen.getByRole('button', { name: /פרסום תוכנית הלימודים/ }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    expect(publish.getAttribute('title')).toBe(READ_ONLY_TITLE);
    const save = screen.getByRole('button', { name: /שמירת הגדרות כיול/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
  });

  it('a normal admin can publish', () => {
    render(<AdminCurriculumView />);
    expect((screen.getByRole('button', { name: /פרסום תוכנית הלימודים/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('teacher add and remove, and the pilot reset, are disabled; the login cards stay', () => {
    useReadOnlyStaffStore.setState({ readOnly: true });
    useAdminStore.setState({
      schools: [{ id: 'school_bikorot', name: 'בית ספר', city: 'חיפה' } as never],
      teachers: [{ id: 't_example_org', email: 't@example.org', schoolId: 'school_bikorot', licenseActive: true } as never],
      classes: [],
      initAdminSubscriptions: () => () => {},
    } as never);
    render(<MemoryRouter><AdminSchoolsView /></MemoryRouter>);
    const reset = screen.getByRole('button', { name: /איפוס נתונים למבנה הפיילוט/ }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    for (const b of screen.getAllByTitle(READ_ONLY_TITLE)) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByTitle(READ_ONLY_TITLE).length).toBeGreaterThanOrEqual(4);
    expect((screen.getByRole('button', { name: /הדפסת כרטיסי כניסה/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
