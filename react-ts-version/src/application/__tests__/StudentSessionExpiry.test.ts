import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Setup localStorage and sessionStorage polyfill for node test environment
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockLocalStorage = createStorageMock();
const mockSessionStorage = createStorageMock();

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockSessionStorage;

import {
  useAuthStore,
  STORAGE_KEY_ROLE,
  STORAGE_KEY_STUDENT_LAST_ACTIVE,
  STORAGE_KEY_STUDENT_WINDOW_CLOSED,
  touchStudentActivity,
  stampStudentWindowClosed,
} from '../useAuthStore';

describe('Student 5-Minute Window Close & Inactivity Timeout Suite', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    useAuthStore.getState().logout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Authenticates student and writes initial activity timestamp', () => {
    const studentUser = {
      uid: 'student_user1',
      student_id: 1,
      name: 'תלמיד 1',
      role: 'student',
    };

    useAuthStore.getState().setUser(studentUser, 'student');

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().isStudentAuthenticated).toBe(true);
    expect(mockLocalStorage.getItem(STORAGE_KEY_ROLE)).toBe('student');
    expect(mockLocalStorage.getItem(STORAGE_KEY_STUDENT_LAST_ACTIVE)).toBeDefined();
    expect(mockLocalStorage.getItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED)).toBeNull();
  });

  it('2. Maintains student session when window was closed for LESS than 5 minutes', () => {
    const studentUser = {
      uid: 'student_user2',
      student_id: 2,
      name: 'תלמיד 2',
      role: 'student',
    };

    useAuthStore.getState().setUser(studentUser, 'student');
    
    // Simulate window close 2 minutes ago (120,000ms < 300,000ms)
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    mockLocalStorage.setItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED, twoMinutesAgo.toString());
    mockLocalStorage.setItem(STORAGE_KEY_STUDENT_LAST_ACTIVE, twoMinutesAgo.toString());

    expect(useAuthStore.getState().isTokenExpired()).toBe(false);
  });

  it('3. Automatically marks token expired and disconnects when window was closed for MORE than 5 minutes', () => {
    const studentUser = {
      uid: 'student_user3',
      student_id: 3,
      name: 'תלמיד 3',
      role: 'student',
    };

    useAuthStore.getState().setUser(studentUser, 'student');

    // Simulate window close 5 minutes and 10 seconds ago (310,000ms > 300,000ms)
    const fiveMinutesTenSecsAgo = Date.now() - (5 * 60 * 1000 + 10000);
    mockLocalStorage.setItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED, fiveMinutesTenSecsAgo.toString());
    mockLocalStorage.setItem(STORAGE_KEY_STUDENT_LAST_ACTIVE, fiveMinutesTenSecsAgo.toString());

    // isTokenExpired must return true!
    expect(useAuthStore.getState().isTokenExpired()).toBe(true);
  });

  it('4. Automatically marks token expired if student had no activity for MORE than 5 minutes', () => {
    const studentUser = {
      uid: 'student_user4',
      student_id: 4,
      name: 'תלמיד 4',
      role: 'student',
    };

    useAuthStore.getState().setUser(studentUser, 'student');

    // Simulate no activity for 6 minutes (360,000ms > 300,000ms)
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
    mockLocalStorage.setItem(STORAGE_KEY_STUDENT_LAST_ACTIVE, sixMinutesAgo.toString());
    mockLocalStorage.removeItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED);

    expect(useAuthStore.getState().isTokenExpired()).toBe(true);
  });

  it('5. Teacher sessions are NOT disconnected by the 5-minute rule (teachers use 8-hour token policy)', () => {
    const teacherUser = {
      uid: 'teacher_user1',
      name: 'מורה',
      email: 'teacher@school.edu',
      role: 'teacher',
    };

    useAuthStore.getState().setUser(teacherUser, 'teacher');

    // Simulate window close 10 minutes ago
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    mockLocalStorage.setItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED, tenMinutesAgo.toString());
    mockLocalStorage.setItem(STORAGE_KEY_STUDENT_LAST_ACTIVE, tenMinutesAgo.toString());

    // For teacher, 10 minutes is NOT expired (8 hours expiry)
    expect(useAuthStore.getState().isTokenExpired()).toBe(false);
  });

  it('6. touchStudentActivity clears the window-closed marker and refreshes active timestamp', () => {
    stampStudentWindowClosed();
    expect(mockLocalStorage.getItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED)).toBeDefined();

    touchStudentActivity();
    expect(mockLocalStorage.getItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED)).toBeNull();
    expect(mockLocalStorage.getItem(STORAGE_KEY_STUDENT_LAST_ACTIVE)).toBeDefined();
  });
});
