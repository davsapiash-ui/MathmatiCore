import { describe, test, expect } from 'vitest';

// Initialize global window object for Node environment prior to loading firebase.ts
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: { hostname: 'localhost', href: 'http://localhost:3000' },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn: any, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: any) => clearTimeout(id),
    navigator: { userAgent: 'node', onLine: true },
  };
}

describe('Empirical Verification: Static Imports & Zustand Store Initialization', () => {
  test('1. Former dynamic import targets (AuditLogger, SocraticEngine, useWorkspaceStore) export valid instances/classes', async () => {
    const { AuditLogger } = await import('@/infrastructure/services/AuditLogger');
    const { SocraticEngine } = await import('@/infrastructure/services/SocraticEngine');
    const { useWorkspaceStore } = await import('@/application/useWorkspaceStore');

    expect(AuditLogger).toBeDefined();
    expect(typeof AuditLogger.log).toBe('function');

    expect(SocraticEngine).toBeDefined();
    expect(typeof SocraticEngine.getSocraticHint).toBe('function');

    expect(useWorkspaceStore).toBeDefined();
    expect(typeof useWorkspaceStore.getState).toBe('function');
    expect(typeof useWorkspaceStore.setState).toBe('function');
  });

  test('2. Zustand store initialization: useWorkspaceStore initializes cleanly without circular dependency errors', async () => {
    const { useWorkspaceStore } = await import('@/application/useWorkspaceStore');
    const wsState = useWorkspaceStore.getState();
    expect(wsState).toBeDefined();
    expect(wsState.sessionNumber).toBe(1);
    expect(wsState.boardOpen).toBe(true);
    expect(typeof wsState.initSession).toBe('function');
    expect(typeof wsState.proceed).toBe('function');
    expect(typeof wsState.requestHelp).toBe('function');
  });

  test('3. Zustand store initialization: useAuthStore initializes cleanly with AuditLogger static import', async () => {
    const { useAuthStore } = await import('@/application/useAuthStore');
    const authState = useAuthStore.getState();
    expect(authState).toBeDefined();
    expect(authState.isAuthenticated).toBe(false);
    expect(authState.user).toBeNull();
    expect(typeof authState.setUser).toBe('function');
    expect(typeof authState.logout).toBe('function');
  });

  test('4. Zustand store initialization: useAdminStore initializes cleanly with AuditLogger static import', async () => {
    const { useAdminStore } = await import('@/application/useAdminStore');
    const adminState = useAdminStore.getState();
    expect(adminState).toBeDefined();
    expect(adminState.globalStudentLimit).toBe(12);
    expect(Array.isArray(adminState.schools)).toBe(true);
    expect(typeof adminState.setGlobalStudentLimit).toBe('function');
  });

  test('5. Inter-store method invocation and logging work without circular dependency traps', async () => {
    const { useAuthStore } = await import('@/application/useAuthStore');
    const { useWorkspaceStore } = await import('@/application/useWorkspaceStore');

    // Test auth store state update (triggers AuditLogger.log inside set)
    const mockUser = { uid: 'student_1', name: 'תלמיד 1', email: 'student_1@mathmaticore.local' };
    useAuthStore.getState().setUser(mockUser, 'student');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user).toEqual(mockUser);

    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();

    // Test workspace store helper methods
    expect(typeof useWorkspaceStore.getState().initSession).toBe('function');
  });
});
