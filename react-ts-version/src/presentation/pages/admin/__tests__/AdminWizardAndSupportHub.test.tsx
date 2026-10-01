/**
 * @vitest-environment jsdom
 *
 * Fix round 1.10.2026, admin console.
 *  - 64: Module 25 §ה/§ז — "ניסיון הוספת תלמיד 13 … האשף מנקה את השדה ומציג
 *    חיווי שהכיתה בתפוסה מלאה של 12 לומדים". The field turned 13 into 12 in
 *    silence, so the sentence was never shown.
 *  - 71: Module 28 §ה — offline, the hub shows the last inquiries it had.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@/infrastructure/firebase', () => ({ database: {}, firestore: {}, db: {}, functions: {}, auth: { currentUser: null }, authReady: Promise.resolve() }));
vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn(() => () => {}), get: vi.fn(), set: vi.fn(), update: vi.fn(), push: vi.fn(() => ({ key: 'k' })), runTransaction: vi.fn(), onDisconnect: vi.fn(() => ({ set: vi.fn() })), serverTimestamp: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), onSnapshot: vi.fn(() => () => {}), collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), getDocs: vi.fn() }));

import { AdminWizardModal } from '../AdminWizardModal';
import { mergeCachedTickets, type SupportTicket } from '../AdminSupportHubView';
import { useAdminStore } from '@/application/useAdminStore';
import { CLASS_FULL_MESSAGE } from '@/core/pilotInstitution';

afterEach(cleanup);

describe('setup wizard — the 13th learner (Module 25 §ה, §ז)', () => {
  const toStep3 = () => {
    useAdminStore.setState({ schools: [], teachers: [], classes: [] });
    render(<AdminWizardModal isOpen onClose={() => {}} mode="full_setup" />);
    fireEvent.click(screen.getByRole('button', { name: /המשך לשלב הבא/ }));
    fireEvent.change(screen.getByPlaceholderText('teacher@edu-haifa.org.il'), { target: { value: 'lead@school.org.il' } });
    fireEvent.click(screen.getByRole('button', { name: /המשך לשלב הבא/ }));
    return screen.getByRole('spinbutton') as HTMLInputElement;
  };

  it('13 clears the field and shows the full-capacity sentence', () => {
    const field = toStep3();
    expect(field.value).toBe('12');
    fireEvent.change(field, { target: { value: '13' } });
    expect(field.value).toBe('');
    expect(screen.getByText(CLASS_FULL_MESSAGE)).toBeTruthy();
    // The wizard does not move on with an empty field.
    fireEvent.click(screen.getByRole('button', { name: /המשך לשלב הבא/ }));
    expect(screen.queryByText('אישור פרטי ההקמה המוסדית')).toBeNull();
  });

  it('a number within the capacity is kept as typed, and the message goes away', () => {
    const field = toStep3();
    fireEvent.change(field, { target: { value: '13' } });
    fireEvent.change(field, { target: { value: '10' } });
    expect(field.value).toBe('10');
    expect(screen.queryByText(CLASS_FULL_MESSAGE)).toBeNull();
  });
});

describe('support hub offline (Module 28 §ה)', () => {
  const t = (id: string, created_at: number, status: 'OPEN' | 'RESOLVED'): SupportTicket => ({
    id, created_at, updated_at: created_at, status, school_id: 's', school_name: 's', class_id: 'c', class_name: 'c',
    teacher_id: 'מורה 1', subject: id, description: id,
  });

  it('a snapshot from the cache adds to the last confirmed list instead of replacing it', () => {
    const confirmed = [t('a', 3, 'RESOLVED'), t('b', 2, 'OPEN'), t('c', 1, 'RESOLVED')];
    // Offline, the memory cache holds only the unread inquiry (the layout badge's query).
    const cached = [t('b', 2, 'OPEN')];
    expect(mergeCachedTickets(confirmed, cached, true).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    // A status changed meanwhile is the cache's.
    expect(mergeCachedTickets(confirmed, [t('b', 2, 'RESOLVED')], true).find((x) => x.id === 'b')?.status).toBe('RESOLVED');
  });

  it('the server\'s answer is the list as is', () => {
    expect(mergeCachedTickets([t('a', 3, 'RESOLVED')], [t('b', 2, 'OPEN')], false).map((x) => x.id)).toEqual(['b']);
  });
});
