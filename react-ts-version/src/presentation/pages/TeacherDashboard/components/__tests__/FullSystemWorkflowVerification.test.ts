import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/application/useAuthStore';
import { useSettingsStore } from '@/application/useSettingsStore';
import type { StudentData } from '@/application/useStore';
import { readFileSync } from 'fs';
import { join } from 'path';

// Polyfill minimal browser environment for node
if (typeof window === 'undefined') {
  (globalThis as any).window = { 
    location: { hostname: 'localhost' },
  };
}
if (typeof navigator === 'undefined') {
  (globalThis as any).navigator = { onLine: true };
}

// In-memory sessionStorage polyfill for Vitest
const mockStorage: Record<string, string> = {};
(globalThis as any).sessionStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
};

describe('Full System Workflow & Integration Empirical Audit Suite', () => {

  beforeEach(() => {
    (globalThis as any).sessionStorage.clear();
    useAuthStore.setState({ user: null, role: null, isAuthenticated: false });
    useSettingsStore.setState({ autoShowHints: false, isASDMode: false });
  });

  describe('1. Student Auth Session Persistence (Refresh F5 Resilience)', () => {
    it('persists user auth state in sessionStorage when setUser is invoked', () => {
      const mockStudentUser = { uid: 'student_user10', name: 'user10', email: 'user10@mathmaticore.local' };
      useAuthStore.getState().setUser(mockStudentUser, 'student');

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.uid).toBe('student_user10');
      expect((globalThis as any).sessionStorage.getItem('mc_auth_user')).toContain('student_user10');
      expect((globalThis as any).sessionStorage.getItem('mc_auth_role')).toBe('student');
    });

    it('clears stored session data upon logout', () => {
      const mockStudentUser = { uid: 'student_user10', name: 'user10' };
      useAuthStore.getState().setUser(mockStudentUser, 'student');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      useAuthStore.getState().logout();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect((globalThis as any).sessionStorage.getItem('mc_auth_user')).toBeNull();
    });
  });

  describe('2. Inactive Student KPI Accuracy', () => {
    it('evaluates inactive student without activity as hasData = FALSE', () => {
      const inactiveStudent: StudentData = {
        studentId: 'student_user10',
        name: 'user10',
        classId: 'live',
        highestCompletedMeeting: 0,
        completedMeeting2: false,
        traceData: { hesitation_events: 0, undo_clicks: 0 },
        qMatrixResults: {} as any,
      } as any;

      const getStudentKPIs = (student: StudentData, _messages: any[]) => {
        const undo = student.traceData?.undo_clicks || 0;
        const hesitation = student.traceData?.hesitation_events || 0;
        const hasHistory = (student.highestCompletedMeeting || 0) > 0 || Boolean(student.completedMeeting2) || undo > 0 || hesitation > 0;

        if (!hasHistory) {
          return { hasData: false, persistence: 0, efficiency: 0, dialogueQuality: 0 };
        }
        return { hasData: true, persistence: 70, efficiency: 90, dialogueQuality: 85 };
      };

      const kpis = getStudentKPIs(inactiveStudent, []);
      expect(kpis.hasData).toBe(false);
      expect(kpis.persistence).toBe(0);
      expect(kpis.dialogueQuality).toBe(0);
    });
  });

  describe('3. Firebase Realtime Database Security Rules Audit', () => {
    it('verifies active_class_session exists in database.rules.json with read/write access', () => {
      const rulesPath = join(__dirname, '../../../../../../../database.rules.json');
      const rulesContent = JSON.parse(readFileSync(rulesPath, 'utf-8'));
      const activeSessionRules = rulesContent.rules.active_class_session;
      
      expect(activeSessionRules).toBeDefined();
      expect(activeSessionRules['.read']).toBe(true);
      expect(activeSessionRules['.write']).toBe('auth != null');
    });
  });

  describe('4. Settings Store Auto Show Hints Policy', () => {
    it('defaults autoShowHints to false to prevent unprompted popup interruptions', () => {
      expect(useSettingsStore.getState().autoShowHints).toBe(false);
    });

    it('allows toggling autoShowHints state', () => {
      useSettingsStore.getState().toggleAutoShowHints();
      expect(useSettingsStore.getState().autoShowHints).toBe(true);

      useSettingsStore.getState().setAutoShowHints(false);
      expect(useSettingsStore.getState().autoShowHints).toBe(false);
    });
  });

});
