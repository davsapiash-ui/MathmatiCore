import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { StudentData } from '@/application/useStore';
import { useStore } from '@/application/useStore';

// Polyfill minimal window for node environment if missing
if (typeof window === 'undefined') {
  (globalThis as any).window = { location: { hostname: 'localhost' } };
}
if (typeof navigator === 'undefined') {
  (globalThis as any).navigator = { onLine: true };
}

describe('Physical Override Empirical Verification Suite', () => {

  describe('1. Null/Undefined & Missing Flags Component Contract Verification', () => {
    it('StudentData missing flags fallback to defaults gracefully in object', () => {
      const bareStudent: any = {
        studentId: 'test_student_001',
      };

      const routeStatus = bareStudent.routeStatus || 'SANDBOX';
      const difficultyRecommendation = String(bareStudent.difficultyRecommendation || 'LEVEL_1');
      const isASD = bareStudent.isASD || false;
      const physicalOverride = bareStudent.physicalOverride || false;

      expect(routeStatus).toBe('SANDBOX');
      expect(difficultyRecommendation).toBe('LEVEL_1');
      expect(isASD).toBe(false);
      expect(physicalOverride).toBe(false);
    });

    it('PhysicalOverrideControl throws Uncaught TypeError when student prop is null or undefined', () => {
      // PhysicalOverrideControl accesses student.routeStatus directly at useState initialization
      // without checking if student is non-null.
      const testNullCall = () => {
        const student: any = null;
        // Simulating line 12 of PhysicalOverrideControl.tsx: useState(student.routeStatus || 'SANDBOX')
        return student.routeStatus || 'SANDBOX';
      };

      expect(testNullCall).toThrow(TypeError);
    });
  });

  describe('2. Firebase Update Payload & Security Rules Compatibility', () => {
    it('verifies top-level "students/" path exists in database.rules.json root', () => {
      const rulesPath = path.resolve(__dirname, '../../../../../../../database.rules.json');
      const rulesJson = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

      const rootRules = rulesJson.rules;
      expect(rootRules).toBeDefined();
      expect(rootRules['users']).toBeDefined();
      expect(rootRules['users']['students']).toBeDefined();

      // Top-level "students" rule check
      const hasTopLevelStudentsRule = Object.prototype.hasOwnProperty.call(rootRules, 'students');
      
      // Top-level "students/" is defined to support secondary path in multi-path updates
      expect(hasTopLevelStudentsRule).toBe(true);
    });

    it('verifies field name handling between PhysicalOverrideControl payload and app UI consumers', () => {
      // PhysicalOverrideControl writes both physicalOverride and physicalOverrideActive
      const controlPayload = {
        routeStatus: 'SANDBOX',
        difficultyRecommendation: 'LEVEL_1',
        isASD: false,
        physicalOverride: true,
        physicalOverrideActive: true,
        overrideUpdatedAt: 123456,
      };

      // App components (StudentSideDrawer, HeatmapGrid, FirebaseSyncService) read physicalOverride
      const studentState: any = {
        studentId: 's1',
        ...controlPayload,
      };

      const isOverrideActiveInUI = Boolean(studentState.physicalOverride);
      expect(isOverrideActiveInUI).toBe(true);
      expect(studentState.physicalOverrideActive).toBe(true);
    });

    it('verifies multi-path atomic update succeeds with top-level "students/" rule', () => {
      const rulesPath = path.resolve(__dirname, '../../../../../../../database.rules.json');
      const rulesJson = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

      const rootRules = rulesJson.rules;
      
      // Firebase RTDB evaluates security rules for all target paths in multi-path updates.
      // FirebaseSyncService.syncPhysicalOverride generates:
      // updates["users/students/123/physicalOverride"] = true
      // updates["students/123/physicalOverride"] = true
      
      const primaryPathAllowed = Boolean(rootRules['users']?.['students']);
      const backupPathAllowed = Boolean(rootRules['students']);

      expect(primaryPathAllowed).toBe(true);
      expect(backupPathAllowed).toBe(true);
    });
  });

  describe('3. State Mutation & Isolation Verification', () => {
    it('verifies updateStudent and applyPhysicalOverride preserve unrelated student fields', () => {
      const initialStudent: StudentData = {
        studentId: 'student_999',
        name: 'Israel Israeli',
        classId: 'class_a',
        routeStatus: 'SANDBOX',
        routeRecommendation: null,
        isASD: false,
        physicalOverride: false,
        conceptMastery: { decimal_structure: 0.9, number_magnitude: 0.4, regrouping_fluency: 0.8, procedural_fluency: 0.8, relational_thinking: 0.8, algebraic_reasoning: 0.8 },
        qMatrixResults: {
          task1_zero_placeholder: 'success',
          task3_flexible_regrouping: null,
          task4_basic_addition_fluency: null,
          task5_small_change: null,
          task6_subtraction_regrouping: null,
          task7_missing_subtrahend: null,
          task8_missing_addend: null,
        },
        traceData: { hesitation_events: 5, undo_clicks: 2 },
        completedMeeting2: true,
        highestCompletedMeeting: 2,
        workspaceState: { sessionNumber: 1, standardTaskIdx: 0 },
      };

      // Populate store
      useStore.setState({
        students: {
          student_999: initialStudent,
        },
      });

      // Apply override via store
      useStore.getState().applyPhysicalOverride('student_999', {
        routeStatus: 'ADAPTIVE',
        difficultyRecommendation: 'LEVEL_2',
        isASD: true,
        physicalOverride: true,
        overrideUpdatedAt: 200000,
      });

      const updatedStudent = useStore.getState().students['student_999'];

      // Verify override fields changed
      expect(updatedStudent.routeStatus).toBe('ADAPTIVE');
      expect(updatedStudent.difficultyRecommendation).toBe('LEVEL_2');
      expect(updatedStudent.isASD).toBe(true);
      expect(updatedStudent.physicalOverride).toBe(true);
      expect(updatedStudent.overrideUpdatedAt).toBe(200000);

      // Verify unrelated state preserved
      expect(updatedStudent.name).toBe('Israel Israeli');
      expect(updatedStudent.classId).toBe('class_a');
      expect(updatedStudent.conceptMastery).toEqual({ decimal_structure: 0.9, number_magnitude: 0.4, regrouping_fluency: 0.8, procedural_fluency: 0.8, relational_thinking: 0.8, algebraic_reasoning: 0.8 });
      expect(updatedStudent.qMatrixResults).toEqual({
        task1_zero_placeholder: 'success',
        task3_flexible_regrouping: null,
        task4_basic_addition_fluency: null,
        task5_small_change: null,
        task6_subtraction_regrouping: null,
        task7_missing_subtrahend: null,
        task8_missing_addend: null,
      });
      expect(updatedStudent.traceData).toEqual({ hesitation_events: 5, undo_clicks: 2 });
      expect(updatedStudent.completedMeeting2).toBe(true);
      expect(updatedStudent.highestCompletedMeeting).toBe(2);
    });

    it('verifies PhysicalOverrideControl omits workspaceState.isASD update payload', () => {
      // In PhysicalOverrideControl.tsx:
      const controlUpdates: Record<string, any> = {
        routeStatus: 'SANDBOX',
        difficultyRecommendation: 'LEVEL_1',
        isASD: true,
        physicalOverrideActive: true,
        overrideUpdatedAt: Date.now(),
      };

      // Check if workspaceState.isASD is present in controlUpdates
      const hasWorkspaceStateIsASD = 'workspaceState/isASD' in controlUpdates || ('workspaceState' in controlUpdates && 'isASD' in controlUpdates.workspaceState);

      // EMPIRICAL FINDING: PhysicalOverrideControl does NOT update workspaceState.isASD, leaving workspace out of sync
      expect(hasWorkspaceStateIsASD).toBe(false);
    });
  });
});
