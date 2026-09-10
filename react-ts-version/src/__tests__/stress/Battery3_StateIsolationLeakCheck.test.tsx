/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockHttpsCallable = vi.fn();

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: {
    currentUser: {
      uid: 'teacher_test_01',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'teacher' } }),
      getIdToken: vi.fn().mockResolvedValue('token'),
    },
  },
  db: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  onValue: vi.fn((_ref, callback) => {
    if (_ref?.path === 'users/students') {
      callback({
        exists: () => true,
        val: () => ({
          student_user1: {
            studentNumber: 1,
            name: 'תלמיד 1',
            isOnline: true,
            lastPing: Date.now(),
            status: 'active',
          },
        }),
      });
    } else if (_ref?.path === 'active_class_session') {
      callback({
        exists: () => true,
        val: () => ({
          active: true,
          status: 'active',
          sessionNumber: 1,
          startedAt: Date.now(),
          teacherId: 'teacher_test_01',
        }),
      });
    } else {
      callback({ exists: () => false, val: () => null });
    }
    return vi.fn();
  }),
  update: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  onDisconnect: vi.fn(() => ({
    update: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  })),
  serverTimestamp: vi.fn(() => 1000000),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((_ref, callback) => {
    if (typeof callback === 'function') {
      callback({ docs: [], forEach: () => {}, exists: () => false, data: () => ({}) });
    }
    return vi.fn();
  }),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
  getFirestore: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_fns, name) => (...args: any[]) => mockHttpsCallable(name, ...args)),
  getFunctions: vi.fn(),
}));

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import { TeacherDashboard } from '@/presentation/pages/TeacherDashboard';
import { useAuthStore } from '@/application/useAuthStore';
import { useAdminStore } from '@/application/useAdminStore';

describe('QA Battery 3: State Isolation & Leak Check (TeacherDashboard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        uid: 'teacher_test_01',
        email: 'teacher@mathmaticore.local',
        role: 'teacher',
        displayName: 'מורה בדיקה',
      },
    });
    useAdminStore.setState({
      classes: [
        {
          id: 'class_1',
          schoolId: 'school_bikorot',
          name: 'המבקרים',
          teacherId: 'teacher_test_01',
          studentLimit: 12,
          createdAt: Date.now(),
        },
      ],
    });
    mockHttpsCallable.mockResolvedValue({ data: { success: true } });
  });

  it('3a. Pre-populating both inputText and adminInputText; executing handleSendAdmin clears adminInputText while preserving inputText completely', async () => {
    render(
      <MemoryRouter>
        <TeacherDashboard />
      </MemoryRouter>
    );

    // Wait for initial debounce loading to complete
    await waitFor(() => {
      expect(screen.queryByText(/טוען נתוני תלמידים/i)).toBeNull();
    }, { timeout: 3000 });

    // 1. Navigate to Student Chat tab
    // The dashboard's tab bars are now marked up as real tablists (role="tab"
    // with aria-selected), per design rule 1.2 — a plain <button> told a screen
    // reader nothing about which screen was open.
    const studentChatTabBtn = screen.getByRole('tab', { name: /צ'אט עם תלמידים/i });
    fireEvent.click(studentChatTabBtn);

    // 2. Select student 1 from the conversation list
    const student1SelectBtn = await screen.findByText('תלמיד 1');
    fireEvent.click(student1SelectBtn);

    // 3. Locate student chat input and pre-populate inputText
    const studentInput = (await screen.findByPlaceholderText(/הקלד הודעה לתלמיד/i)) as HTMLInputElement;
    fireEvent.change(studentInput, { target: { value: 'שלום תלמיד 1, שים לב לעמודת העשרות' } });
    expect(studentInput.value).toBe('שלום תלמיד 1, שים לב לעמודת העשרות');

    // 4. Open Admin Chat Drawer
    const openAdminDrawerBtn = screen.getByRole('button', { name: /צ'אט הנהלה/i });
    fireEvent.click(openAdminDrawerBtn);

    // 5. Locate admin input and pre-populate adminInputText
    const adminInput = (await screen.findByPlaceholderText(/הקלד הודעה למנהל המערכת/i)) as HTMLInputElement;
    fireEvent.change(adminInput, { target: { value: 'הודעה למנהל: ישנה תקלת רשת בכיתה' } });
    expect(adminInput.value).toBe('הודעה למנהל: ישנה תקלת רשת בכיתה');

    // Verify both states are concurrently isolated
    expect(studentInput.value).toBe('שלום תלמיד 1, שים לב לעמודת העשרות');
    expect(adminInput.value).toBe('הודעה למנהל: ישנה תקלת רשת בכיתה');

    // 6. Execute handleSendAdmin by clicking the admin drawer send button
    const adminSendBtn = adminInput.parentElement!.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(adminSendBtn);
    });

    // 7. ASSERT: Backend call was dispatched with admin message
    expect(mockHttpsCallable).toHaveBeenCalledTimes(1);
    expect(mockHttpsCallable).toHaveBeenCalledWith('sendTeacherAdminMessage', expect.objectContaining({
      receiver_id: 'admin',
      message_body: 'הודעה למנהל: ישנה תקלת רשת בכיתה',
    }));

    // 8. ASSERT: adminInputText is cleared to ""
    expect(adminInput.value).toBe('');

    // 9. ASSERT: inputText in student chat remains COMPLETELY INTACT
    expect(studentInput.value).toBe('שלום תלמיד 1, שים לב לעמודת העשרות');
  });
});
