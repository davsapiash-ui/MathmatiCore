import { describe, it, expect, beforeEach } from 'vitest';
import { generatePedagogicalReportPDF } from '@/infrastructure/services/PedagogicalReportService';
import { useAdminStore } from '@/application/useAdminStore';
import type { SessionDocument } from '@/types';

describe('PHASE 4 EMPIRICAL AUDIT & INTEGRATION TEST SUITE (PRD v6.5)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // =========================================================================
  // TEST 1: PDF Generator Routing Logic & Absolute Anonymity (Module 23)
  // =========================================================================
  describe('TEST 1: PDF Generator Routing Logic & Absolute Anonymity (Module 23)', () => {
    it('enforces exact mathematical routing boundaries: 49%, 75%, 76%', () => {
      // 1. Boundary 49% -> Small homogeneous group, physical ten frames
      const sessionDoc49: SessionDocument = {
        session_id: 'session_02_student_3',
        class_id: 'class_1',
        session_number: 2,
        session_start_time: Date.now() - 1800000,
        session_deadline_time: Date.now() + 1800000,
        active_exercise_id: 'completed',
        is_completed: true,
        session_score_percent: 49,
        teacher_gate_approved: true,
        gate_approved_at: Date.now(),
        gate_approved_by: '1002220159',
        teacher_selected_path: 'remediation_path',
        matrix_recommended_path: 'remediation_path',
      };

      const report49 = generatePedagogicalReportPDF(sessionDoc49);
      expect(report49.score).toBe(49);
      expect(report49.routingGroup).toBe('Small homogeneous group, physical ten frames');
      expect(report49.studentDisplayName).toBe('תלמיד 3');

      // 2. Boundary 75% -> Heterogeneous peer discourse, abacus
      const sessionDoc75: SessionDocument = {
        ...sessionDoc49,
        session_id: 'session_02_student_7',
        session_score_percent: 75,
      };

      const report75 = generatePedagogicalReportPDF(sessionDoc75);
      expect(report75.score).toBe(75);
      expect(report75.routingGroup).toBe('Heterogeneous peer discourse, abacus');
      expect(report75.studentDisplayName).toBe('תלמיד 7');

      // 3. Boundary 76% -> Independent challenge track, whiteboard
      const sessionDoc76: SessionDocument = {
        ...sessionDoc49,
        session_id: 'session_02_student_12',
        session_score_percent: 76,
      };

      const report76 = generatePedagogicalReportPDF(sessionDoc76);
      expect(report76.score).toBe(76);
      expect(report76.routingGroup).toBe('Independent challenge track, whiteboard');
      expect(report76.studentDisplayName).toBe('תלמיד 12');
    });

    it('strictly reads session_score_percent from SessionDocument and preserves absolute anonymity (Zero PII)', () => {
      const doc: SessionDocument = {
        session_id: 'session_08_student_1',
        class_id: 'class_1',
        session_number: 8,
        session_start_time: Date.now(),
        session_deadline_time: Date.now() + 1800000,
        active_exercise_id: 'completed',
        is_completed: true,
        session_score_percent: 92,
        teacher_gate_approved: true,
        gate_approved_at: Date.now(),
        gate_approved_by: '1002220159',
        teacher_selected_path: 'green_path',
        matrix_recommended_path: 'green_path',
      };

      const report = generatePedagogicalReportPDF(doc);

      // Verify anonymity
      expect(report.studentDisplayName).toBe('תלמיד 1');
      expect(report.pdfHtml).toContain('תלמיד 1');
      expect(report.pdfHtml).not.toContain('@');
      expect(report.pdfHtml).not.toContain('039604483');
      expect(report.pdfHtml).not.toContain('undefined');
    });
  });

  // =========================================================================
  // TEST 2: Admin Cache Overview & Telemetry Isolation (Module 24 & 27)
  // =========================================================================
  describe('TEST 2: Admin Cache Overview & Raw Telemetry Isolation (Module 24 & 27)', () => {
    it('verifies useAdminStore reads from store_cache and holds zero raw telemetry records', () => {
      const adminStore = useAdminStore.getState();

      // Assert store_cache exists with aggregated overview
      expect(adminStore.cache).toBeDefined();
      expect(adminStore.cache?.totalStudents).toBeDefined();
      expect(adminStore.cache?.systemHealth).toBe('OPTIMAL');
      expect(Array.isArray(adminStore.cache?.activityTrends)).toBe(true);

      // Verify no raw telemetry array is exposed or stored in AdminState
      const adminStateKeys = Object.keys(adminStore);
      expect(adminStateKeys.includes('telemetry_logs')).toBe(false);
      expect(adminStateKeys.includes('raw_telemetry')).toBe(false);
      expect(adminStateKeys.includes('student_PII')).toBe(false);

      // Verify cache updates work cleanly without side-effects
      adminStore.updateStoreCache({ totalStudents: 24, averageMasteryScore: 88 });
      expect(useAdminStore.getState().cache?.totalStudents).toBe(24);
      expect(useAdminStore.getState().cache?.averageMasteryScore).toBe(88);
    });
  });
});
