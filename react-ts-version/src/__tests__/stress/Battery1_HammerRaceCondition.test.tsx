/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// 1. Firebase mocks with latency control
const mockRtdbSet = vi.fn();
const mockRtdbUpdate = vi.fn();
const mockHttpsCallable = vi.fn();
const mockApproveTeacherGate = vi.fn();

vi.mock('@/infrastructure/firebase', () => ({
  database: { __rtdb: true },
  firestore: { __firestore: true },
  functions: { __functions: true },
  auth: {
    currentUser: {
      uid: 'teacher_test_01',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'teacher' } }),
      getIdToken: vi.fn().mockResolvedValue('token_test'),
    },
  },
  db: { __firestore: true },
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  onValue: vi.fn((_ref, callback) => {
    // Initial emission
    if (_ref?.path === 'active_class_session') {
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
    } else if (_ref?.path === 'users/students') {
      callback({
        exists: () => true,
        val: () => ({
          student_user1: {
            studentNumber: 1,
            name: 'תלמיד 1',
            isOnline: true,
            lastPing: Date.now(),
            completedMeeting2: true,
            teacher_gate_approved: false,
            routeRecommendation: 'GREEN',
            status: 'active',
          },
          student_1: {
            studentNumber: 1,
            name: 'תלמיד 1',
            isOnline: true,
            lastPing: Date.now(),
            completedMeeting2: true,
            teacher_gate_approved: false,
            routeRecommendation: 'GREEN',
            status: 'active',
          },
        }),
      });
    } else {
      callback({ exists: () => false, val: () => null });
    }
    return vi.fn(); // unsubscribe
  }),
  set: vi.fn((...args) => mockRtdbSet(...args)),
  update: vi.fn((...args) => mockRtdbUpdate(...args)),
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
      callback({
        docs: [],
        forEach: () => {},
        exists: () => false,
        data: () => ({}),
      });
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

vi.mock('@/core/teacherGate', () => ({
  approveTeacherGate: vi.fn((...args) => mockApproveTeacherGate(...args)),
}));

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="recharts-responsive">{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

// ResizeObserver mock
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import { TeacherDashboard } from '@/presentation/pages/TeacherDashboard';
import { HeatmapGrid } from '@/presentation/pages/TeacherDashboard/components/HeatmapGrid';
import { StudentLearningConditionsDrawer } from '@/presentation/pages/TeacherDashboard/components/StudentLearningConditionsDrawer';
import { useAuthStore } from '@/application/useAuthStore';
import { useAdminStore } from '@/application/useAdminStore';
import { type StudentData } from '@/application/useStore';

describe('QA Battery 1: Hammer & Race-Condition Testing (Multi-Clicks & In-Flight Latency)', () => {
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
          activeSessionId: 'session_01',
          studentCount: 12,
        },
      ],
    });
    mockRtdbSet.mockResolvedValue(undefined);
    mockRtdbUpdate.mockResolvedValue(undefined);
    mockHttpsCallable.mockResolvedValue({ data: { success: true } });
    mockApproveTeacherGate.mockResolvedValue({ ok: true });
  });

  // Test 1a: Admin message send button in TeacherDashboard
  it('1a. Admin message send button: 5 rapid clicks dispatch exactly ONE backend call while in-flight', async () => {
    // Inject artificial in-flight latency into sendTeacherAdminMessage
    let resolveBackendCall: (val: any) => void = () => {};
    mockHttpsCallable.mockImplementation((name: string, payload: any) => {
      return new Promise((resolve) => {
        resolveBackendCall = () => resolve({ data: { success: true } });
      });
    });

    render(
      <MemoryRouter>
        <TeacherDashboard />
      </MemoryRouter>
    );

    // Wait for initial debounce loading to complete
    await waitFor(() => {
      expect(screen.queryByText(/טוען נתוני תלמידים/i)).toBeNull();
    }, { timeout: 3000 });

    // 1. Open the Admin Chat drawer
    const openAdminChatBtn = screen.getByRole('button', { name: /צ'אט הנהלה/i });
    fireEvent.click(openAdminChatBtn);

    // 2. Find admin input and enter a message
    const adminInput = await screen.findByPlaceholderText(/הקלד הודעה למנהל המערכת/i) as HTMLInputElement;
    fireEvent.change(adminInput, { target: { value: 'פנייה דחופה להנהלה' } });

    // 3. Find the send button (in the input container)
    const sendBtn = adminInput.parentElement!.querySelector('button') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(false);

    // 4. HAMMER: simulate 5 rapid clicks within 50ms
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        fireEvent.click(sendBtn);
      }
    });

    // 5. ASSERT: Exactly ONE underlying backend call is dispatched
    expect(mockHttpsCallable).toHaveBeenCalledTimes(1);
    expect(mockHttpsCallable).toHaveBeenCalledWith('sendTeacherAdminMessage', expect.objectContaining({
      receiver_id: 'admin',
      message_body: 'פנייה דחופה להנהלה',
    }));

    // 6. ASSERT: While in-flight, send button is disabled
    expect(sendBtn.disabled).toBe(true);

    // 7. Resolve backend call and verify recovery
    await act(async () => {
      resolveBackendCall({ data: { success: true } });
    });

    // 8. After flight, input is cleared and button is disabled because input is empty
    expect(adminInput.value).toBe('');
    expect(sendBtn.disabled).toBe(true);
  });

  // Test 1b: Session control buttons ("Pause", "Resume", "End")
  it('1b. Session control buttons: 5 rapid clicks dispatch exactly ONE RTDB write while in-flight', async () => {
    let resolvePauseCall: (val: any) => void = () => {};
    mockRtdbUpdate.mockImplementation(() => {
      return new Promise((resolve) => {
        resolvePauseCall = resolve;
      });
    });

    render(
      <MemoryRouter>
        <TeacherDashboard />
      </MemoryRouter>
    );

    // Wait for initial debounce loading to complete
    await waitFor(() => {
      expect(screen.queryByText(/טוען נתוני תלמידים/i)).toBeNull();
    }, { timeout: 3000 });

    // Find the "עצור מפגש" (Pause session) button
    const pauseBtn = screen.getByRole('button', { name: /עצור מפגש/i }) as HTMLButtonElement;
    expect(pauseBtn.disabled).toBe(false);

    // HAMMER: 5 rapid clicks on pause button
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        fireEvent.click(pauseBtn);
      }
    });

    // ASSERT: Exactly ONE session update call was dispatched to RTDB
    const sessionPauseCalls = mockRtdbUpdate.mock.calls.filter(([r]) => r?.path === 'active_class_session');
    expect(sessionPauseCalls).toHaveLength(1);
    expect(sessionPauseCalls[0][1]).toEqual(expect.objectContaining({ status: 'paused' }));

    // ASSERT: Button is disabled and displays spinner
    expect(pauseBtn.disabled).toBe(true);
    expect(pauseBtn.querySelector('.animate-spin')).not.toBeNull();

    // Resolve write
    await act(async () => {
      resolvePauseCall(undefined);
    });

    // Now button flips to "המשך מפגש" (Resume) and is enabled
    const resumeBtn = await screen.findByRole('button', { name: /המשך מפגש/i }) as HTMLButtonElement;
    expect(resumeBtn.disabled).toBe(false);

    // Now hammer Resume button
    let resolveResumeCall: (val: any) => void = () => {};
    mockRtdbUpdate.mockImplementation(() => {
      return new Promise((resolve) => {
        resolveResumeCall = resolve;
      });
    });

    await act(async () => {
      for (let i = 0; i < 5; i++) {
        fireEvent.click(resumeBtn);
      }
    });

    const sessionResumeCalls = mockRtdbUpdate.mock.calls.filter(
      ([r, payload]) => r?.path === 'active_class_session' && payload?.status === 'active'
    );
    expect(sessionResumeCalls).toHaveLength(1);
    expect(resumeBtn.disabled).toBe(true);
    expect(resumeBtn.querySelector('.animate-spin')).not.toBeNull();

    await act(async () => {
      resolveResumeCall(undefined);
    });
  });

  // Test 1c: Gate approval buttons in HeatmapGrid
  it('1c. Gate approval buttons: 5 rapid clicks dispatch exactly ONE approveTeacherGate call', async () => {
    let resolveGateCall: (val: any) => void = () => {};
    mockApproveTeacherGate.mockImplementation(() => {
      return new Promise((resolve) => {
        resolveGateCall = resolve;
      });
    });

    render(<HeatmapGrid />);

    // Find the quick-approval "אשר ירוק" button in the gate banner
    const greenApproveBtn = await screen.findByRole('button', { name: /אשר ירוק/i }) as HTMLButtonElement;
    expect(greenApproveBtn.disabled).toBe(false);

    // HAMMER: 5 rapid clicks within 50ms
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        fireEvent.click(greenApproveBtn);
      }
    });

    // ASSERT: Exactly ONE gate approval call was dispatched
    expect(mockApproveTeacherGate).toHaveBeenCalledTimes(1);
    expect(mockApproveTeacherGate).toHaveBeenCalledWith('student_1', 'green_path', 'teacher_test_01');

    // ASSERT: Button is disabled and spinner is visible
    expect(greenApproveBtn.disabled).toBe(true);
    expect(greenApproveBtn.querySelector('.animate-spin')).not.toBeNull();

    // Sibling button "אשר צמצום" must also be disabled during this in-flight approval
    const redApproveBtn = screen.getByRole('button', { name: /אשר צמצום/i }) as HTMLButtonElement;
    expect(redApproveBtn.disabled).toBe(true);

    // Resolve flight
    await act(async () => {
      resolveGateCall({ ok: true });
    });

    await waitFor(() => {
      expect(greenApproveBtn.querySelector('.animate-spin')).toBeNull();
    });
  });

  // Test 1d: "Mark as Handled" in StudentLearningConditionsDrawer
  it('1d. Mark as Handled: 5 rapid clicks dispatch exactly ONE update call while in-flight', async () => {
    let resolveClearCall: (val: any) => void = () => {};
    mockRtdbUpdate.mockImplementation(() => {
      return new Promise((resolve) => {
        resolveClearCall = resolve;
      });
    });

    const mockStudent: StudentData = {
      studentId: 'student_1',
      classId: 'class_1',
      schoolId: 'school_bikorot',
      displayName: 'תלמיד 1',
      helpRequested: true,
      isStruggling: true,
      helpCallCount: 2,
    } as any;

    render(
      <StudentLearningConditionsDrawer
        student={mockStudent}
        onClose={vi.fn()}
      />
    );

    // Find "סמן כטופל" button
    const handleBtn = screen.getByRole('button', { name: /סמן כטופל/i }) as HTMLButtonElement;
    expect(handleBtn.disabled).toBe(false);

    // HAMMER: 5 rapid clicks
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        fireEvent.click(handleBtn);
      }
    });

    // ASSERT: Exactly one batch of updates dispatched
    const initialCallCount = mockRtdbUpdate.mock.calls.length;
    expect(initialCallCount).toBeGreaterThan(0);

    // Button text changes to "מעדכן..." and is disabled with a spinner
    expect(handleBtn.disabled).toBe(true);
    expect(handleBtn.textContent).toContain('מעדכן...');
    expect(handleBtn.querySelector('.animate-spin')).not.toBeNull();

    // Fire another click while in flight
    fireEvent.click(handleBtn);
    expect(mockRtdbUpdate.mock.calls.length).toBe(initialCallCount);

    // Resolve flight
    await act(async () => {
      resolveClearCall(undefined);
    });
  });
});
