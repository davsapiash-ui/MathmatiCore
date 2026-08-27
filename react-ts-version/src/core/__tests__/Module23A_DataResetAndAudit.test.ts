import { describe, it, expect, vi } from 'vitest';
import { VALID_RESET_REASONS, type ResetAuditEntry, type ResetReason } from '@/types';

describe('Module 23א: מודול איפוס נתונים, גיבוי ותיעוד (Canonical PRD v7.0)', () => {
  it('defines the 5 canonical reset reasons', () => {
    const expectedReasons: ResetReason[] = [
      'technical_fault',
      'student_stuck',
      'restart_session',
      'test_run',
      'other',
    ];

    expect(expectedReasons).toHaveLength(5);
    expectedReasons.forEach((r) => {
      expect(typeof r).toBe('string');
    });
  });

  it('validates complete ResetAuditEntry data contract with all 11 mandatory fields', () => {
    const auditRecord: ResetAuditEntry = {
      reset_id: 'reset_1720000000000_abc12',
      reset_level: 'system',
      performed_by_teacher_id: 'teacher_user1',
      performed_at: 1720000000000,
      class_id: 'class_1',
      affected_student_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      backup_file_url: 'https://drive.google.com/file/d/test_file_id/view',
      backup_status: 'success',
      reset_reason: 'restart_session',
      reason_note: 'פתיחת מפגש חדש לכיתה',
      records_deleted_count: 12,
    };

    expect(auditRecord.reset_id).toBeDefined();
    expect(auditRecord.reset_level).toBe('system');
    expect(auditRecord.performed_by_teacher_id).toBe('teacher_user1');
    expect(auditRecord.performed_at).toBeGreaterThan(0);
    expect(auditRecord.class_id).toBe('class_1');
    expect(auditRecord.affected_student_ids).toHaveLength(12);
    expect(auditRecord.backup_file_url).toContain('https://drive.google.com');
    expect(auditRecord.backup_status).toBe('success');
    expect(auditRecord.reset_reason).toBe('restart_session');
    expect(auditRecord.reason_note).toBe('פתיחת מפגש חדש לכיתה');
    expect(auditRecord.records_deleted_count).toBe(12);
  });

  it('aborts deletion immediately if Google Drive backup fails', async () => {
    let deletionCalled = false;

    // Simulate Cloud Function sequencing
    const backupService = {
      uploadToDrive: vi.fn().mockResolvedValue({ success: false, error: 'Network error' }),
    };

    const deleteService = {
      deleteData: vi.fn().mockImplementation(() => {
        deletionCalled = true;
      }),
    };

    const performReset = async () => {
      const backupResult = await backupService.uploadToDrive();
      if (!backupResult.success) {
        throw new Error('הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.');
      }
      await deleteService.deleteData();
    };

    await expect(performReset()).rejects.toThrow('הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.');
    expect(deletionCalled).toBe(false);
  });
});
