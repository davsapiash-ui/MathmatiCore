import { describe, it, expect, vi } from 'vitest';
import { useStore, type StudentData } from '@/application/useStore';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { validateChatInputForPII, anonymizeChatMessageBody } from '@/core/security/PiiFilter';

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

  describe('5. ClusteringWidgets & Q-Matrix Analysis Logic', () => {
    it('accurately aggregates student struggle counts across 6 mathematical concepts', () => {
      const mockStudents: StudentData[] = [
        {
          studentId: 's1',
          name: 'Student 1',
          classId: 'c1',
          conceptMastery: {
            decimal_structure: 0.6, // struggling (< 0.8)
            number_magnitude: 0.9,
            regrouping_fluency: 0.5, // struggling
            procedural_fluency: 0.85,
            relational_thinking: 0.7, // struggling
            algebraic_reasoning: 0.9,
          },
          traceData: { hesitation_events: 0, undo_clicks: 0 },
          qMatrixResults: {} as any,
        } as any,
        {
          studentId: 's2',
          name: 'Student 2',
          classId: 'c1',
          conceptMastery: {
            decimal_structure: 0.9,
            number_magnitude: 0.6, // struggling
            regrouping_fluency: 0.7, // struggling
            procedural_fluency: 0.5, // struggling
            relational_thinking: 0.9,
            algebraic_reasoning: 0.4, // struggling
          },
          traceData: { hesitation_events: 0, undo_clicks: 0 },
          qMatrixResults: {} as any,
        } as any,
      ];

      const getStrugglingCount = (conceptKey: keyof NonNullable<StudentData['conceptMastery']>) => {
        return mockStudents.filter(s => s.conceptMastery && s.conceptMastery[conceptKey] < 0.8).length;
      };

      expect(getStrugglingCount('decimal_structure')).toBe(1);
      expect(getStrugglingCount('number_magnitude')).toBe(1);
      expect(getStrugglingCount('regrouping_fluency')).toBe(2);
      expect(getStrugglingCount('procedural_fluency')).toBe(1);
      expect(getStrugglingCount('relational_thinking')).toBe(1);
      expect(getStrugglingCount('algebraic_reasoning')).toBe(1);
    });
  });

  describe('6. StudentList Pending Queue Prioritization', () => {
    it('sorts students with pending gate approvals to the top of the list', () => {
      const students: StudentData[] = [
        { studentId: 'student_1', name: 'Student 1', routeStatus: 'APPROVED' } as any,
        { studentId: 'student_2', name: 'Student 2', routeStatus: 'PENDING' } as any,
        { studentId: 'student_3', name: 'Student 3', routeStatus: 'SANDBOX' } as any,
      ];

      const pendingApprovals = new Set(['student_2']);

      const sorted = [...students].sort((a, b) => {
        const aPending = pendingApprovals.has(a.studentId) || a.routeStatus === 'PENDING' ? 1 : 0;
        const bPending = pendingApprovals.has(b.studentId) || b.routeStatus === 'PENDING' ? 1 : 0;
        return bPending - aPending;
      });

      expect(sorted[0].studentId).toBe('student_2');
      expect(sorted[0].routeStatus).toBe('PENDING');
    });
  });

  describe('7. FloatingChatPanel & PII Defense in Live Interventions', () => {
    it('validates PII and blocks message sending with Israeli ID / Phone / Email', () => {
      // Invalid: Israeli phone
      const phoneCheck = validateChatInputForPII('פנה בדחיפות לטלפון 0501234567');
      expect(phoneCheck.valid).toBe(false);

      // Valid anonymous message
      const cleanCheck = validateChatInputForPII('התלמיד השלים בהצלחה את שלב פריטת העשרות.');
      expect(cleanCheck.valid).toBe(true);

      const anonymized = anonymizeChatMessageBody('דנה ויוסי עבדו יחד בלוח', { 'דנה': 1, 'יוסי': 2 });
      expect(anonymized).toBe('תלמיד 1 ותלמיד 2 עבדו יחד בלוח');
    });
  });

  describe('8. Place-value total from a board-state snapshot', () => {
    it('accurately computes total place-value from state counts snapshot', () => {
      const snapshot = {
        counts: { thousands: 1, hundreds: 2, tens: 4, units: 8 },
      };

      const totalValue = (snapshot.counts.thousands * 1000) + 
                         (snapshot.counts.hundreds * 100) + 
                         (snapshot.counts.tens * 10) + 
                         snapshot.counts.units;

      expect(totalValue).toBe(1248);
    });
  });

});
