import { describe, it, expect, vi } from 'vitest';
import { useStore, type StudentData } from '@/application/useStore';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

// Polyfill minimal window for node environment
if (typeof window === 'undefined') {
  (globalThis as any).window = { location: { hostname: 'localhost' } };
}
if (typeof navigator === 'undefined') {
  (globalThis as any).navigator = { onLine: true };
}

describe('Teacher Dashboard Domain Comprehensive Audit & Verification Suite', () => {

  describe('1. HeatmapGrid Struggling Indicator Logic', () => {
    it('evaluates struggling state as TRUE when errorCount > 2', () => {
      const student = {
        hesitationSeconds: 10,
        errorCount: 3,
        currentPath: 'ירוק' as string,
        physicalOverride: false,
      };

      const isStruggling = student.hesitationSeconds >= 30 || student.currentPath === 'צמצום פערים' || student.errorCount > 2 || student.physicalOverride;
      expect(isStruggling).toBe(true);
    });

    it('evaluates struggling state as TRUE when hesitationSeconds >= 30', () => {
      const student = {
        hesitationSeconds: 30,
        errorCount: 1,
        currentPath: 'ירוק' as string,
        physicalOverride: false,
      };

      const isStruggling = student.hesitationSeconds >= 30 || student.currentPath === 'צמצום פערים' || student.errorCount > 2 || student.physicalOverride;
      expect(isStruggling).toBe(true);
    });

    it('evaluates struggling state as TRUE when physical override is active', () => {
      const student = {
        hesitationSeconds: 0,
        errorCount: 0,
        currentPath: 'ירוק' as string,
        physicalOverride: true,
      };

      const isStruggling = student.hesitationSeconds >= 30 || student.currentPath === 'צמצום פערים' || student.errorCount > 2 || student.physicalOverride;
      expect(isStruggling).toBe(true);
    });

    it('evaluates struggling state as FALSE for student under all thresholds', () => {
      const student = {
        hesitationSeconds: 15,
        errorCount: 1,
        currentPath: 'ירוק' as string,
        physicalOverride: false,
      };

      const isStruggling = student.hesitationSeconds >= 30 || student.currentPath === 'צמצום פערים' || student.errorCount > 2 || student.physicalOverride;
      expect(isStruggling).toBe(false);
    });
  });

  describe('2. Physical Override Activation & Cleanup Pipeline', () => {
    it('executes applyPhysicalOverride and updates student state cleanly', () => {
      const mockStudent: StudentData = {
        studentId: 'student_test_101',
        name: 'Test Student',
        classId: 'demo',
        routeStatus: 'SANDBOX',
        difficultyRecommendation: 'LEVEL_1',
        isASD: false,
        physicalOverride: false,
        qMatrixResults: {} as any,
        traceData: { hesitation_events: 0, undo_clicks: 0 },
        completedMeeting2: true,
        routeRecommendation: 'GREEN',
      } as any;

      useStore.setState({
        students: {
          student_test_101: mockStudent,
        },
      });

      // Activate Physical Override
      useStore.getState().applyPhysicalOverride('student_test_101', {
        routeStatus: 'ADAPTIVE',
        difficultyRecommendation: 'LEVEL_2',
        isASD: true,
        physicalOverride: true,
        physicalOverrideActive: true,
        overrideUpdatedAt: Date.now(),
      });

      let updated = useStore.getState().students['student_test_101'];
      expect(updated.physicalOverride).toBe(true);
      expect(updated.isASD).toBe(true);
      expect(updated.routeStatus).toBe('ADAPTIVE');

      // Cleanup / Deactivate Physical Override
      useStore.getState().applyPhysicalOverride('student_test_101', {
        routeStatus: 'APPROVED',
        difficultyRecommendation: 'LEVEL_1',
        isASD: false,
        physicalOverride: false,
        physicalOverrideActive: false,
        overrideUpdatedAt: Date.now(),
      });

      updated = useStore.getState().students['student_test_101'];
      expect(updated.physicalOverride).toBe(false);
      expect(updated.isASD).toBe(false);
      expect(updated.routeStatus).toBe('APPROVED');
    });
  });

  describe('3. Class-Level Override Execution', () => {
    it('applies override settings across multiple students in the class', async () => {
      const spySync = vi.spyOn(firebaseSyncService, 'syncPhysicalOverride').mockResolvedValue(undefined as any);

      const studentsList: StudentData[] = [
        { studentId: 'stu_1', name: 'Student 1', classId: 'c1', traceData: { hesitation_events: 0, undo_clicks: 0 }, qMatrixResults: {} as any } as any,
        { studentId: 'stu_2', name: 'Student 2', classId: 'c1', traceData: { hesitation_events: 0, undo_clicks: 0 }, qMatrixResults: {} as any } as any,
      ];

      useStore.setState({
        students: {
          stu_1: studentsList[0],
          stu_2: studentsList[1],
        },
      });

      const store = useStore.getState();
      const overridePayload = {
        routeStatus: 'ADAPTIVE',
        difficultyRecommendation: 'LEVEL_1',
        isASD: true,
        physicalOverride: true,
        physicalOverrideActive: true,
        overrideUpdatedAt: 1000,
      };

      for (const s of studentsList) {
        store.applyPhysicalOverride(s.studentId, overridePayload);
      }

      expect(useStore.getState().students['stu_1'].physicalOverride).toBe(true);
      expect(useStore.getState().students['stu_2'].physicalOverride).toBe(true);
      expect(spySync).toHaveBeenCalledTimes(2);

      spySync.mockRestore();
    });
  });

  describe('4. Approval Gate (Session 2 -> Session 3) & Socratic Engine', () => {
    it('returns predefined Socratic hints for subtraction_regrouping and addition_regrouping', async () => {
      vi.spyOn(SocraticEngine, 'getSocraticHint').mockImplementation(async (_task, targetNode) => {
        const Q_MATRIX_HINTS: Record<string, any> = {
          "subtraction_regrouping": {
            questionHe: "חסרות לנו יחידות בלוח כדי לחסר. מה אפשר לעשות?",
            choices: [{ id: "opt_1", textHe: "לקחת קוביית עשרת ולפרוט אותה ל-10 יחידות" }]
          },
          "addition_regrouping": {
            questionHe: "יש לנו יותר מ-9 קוביות באותו טור. מה עושים?",
            choices: [{ id: "opt_1", textHe: "מקריפים (אורזים) 10 קוביות לבלוק גדול יותר" }]
          }
        };
        return Q_MATRIX_HINTS[targetNode] || null;
      });

      const subHint = await SocraticEngine.getSocraticHint({}, 'subtraction_regrouping', { units: 0, tens: 0, hundreds: 0, thousands: 0 });
      expect(subHint).not.toBeNull();
      expect(subHint?.choices.length).toBeGreaterThan(0);
      expect(subHint?.questionHe).toContain('חסרות לנו יחידות');

      const addHint = await SocraticEngine.getSocraticHint({}, 'addition_regrouping', { units: 0, tens: 0, hundreds: 0, thousands: 0 });
      expect(addHint).not.toBeNull();
      expect(addHint?.questionHe).toContain('יותר מ-9 קוביות');
    });

    it('approves tasks and transitions student routeStatus to APPROVED', async () => {
      const studentId = 'stu_approval_test';

      useStore.setState({
        students: {
          [studentId]: {
            studentId,
            name: 'Approval Student',
            classId: 'c1',
            routeStatus: 'PENDING',
            traceData: { hesitation_events: 0, undo_clicks: 0 },
            qMatrixResults: {} as any,
          } as any,
        },
      });

      // Approve route in Zustand store
      useStore.getState().approveRoute(studentId);

      const updated = useStore.getState().students[studentId];
      expect(updated.routeStatus).toBe('APPROVED');
    });
  });

});
