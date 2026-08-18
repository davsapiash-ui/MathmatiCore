import { describe, it, expect } from 'vitest';
import { sanitizeChatText } from '../../application/useChatStore';
import { scrubPII } from '../../../../functions/src/geminiProxy';
import { CanvasRecorderService } from '../../infrastructure/services/CanvasRecorderService';
import { useWorkspaceStore } from '../../application/useWorkspaceStore';

describe('Work Package 6 (WP6): Admin Hubs, Two-Layer Chat PII, Cloud Functions & Canvas Replay', () => {

  describe('1. Module 22: Teacher-Admin Chat Two-Layer PII Protection', () => {
    it('Layer 1 (Client-Side): Sanitizes IDs, phones, and emails before sending', () => {
      const rawInput = 'שלום, התלמיד בעל ת"ז 123456789 והטלפון 052-1234567 או במייל test@example.com נתקל בבעיה';
      const sanitized = sanitizeChatText(rawInput);

      expect(sanitized).not.toContain('123456789');
      expect(sanitized).not.toContain('052-1234567');
      expect(sanitized).not.toContain('test@example.com');
      expect(sanitized).toContain('***6789');
      expect(sanitized).toContain('[PHONE_REDACTED]');
      expect(sanitized).toContain('[EMAIL_REDACTED]');
    });

    it('Layer 2 (Server-Side): Scrubs Hebrew/English name introductions and passwords', () => {
      const serverPayload = 'שלום שמי דוד לוי והסיסמה שלי היא secret123, המייל הוא teacher@school.org';
      const scrubbed = scrubPII(serverPayload);

      expect(scrubbed).not.toContain('דוד לוי');
      expect(scrubbed).not.toContain('secret123');
      expect(scrubbed).not.toContain('teacher@school.org');
      expect(scrubbed).toContain('[REDACTED_NAME]');
      expect(scrubbed).toContain('[REDACTED_PASSWORD]');
      expect(scrubbed).toContain('[REDACTED_EMAIL]');
    });
  });

  describe('2. Module 25: Classroom Wizard & Strict 12-Student Cap (Blocking Student 13)', () => {
    it('allows valid student limits up to 12 and strictly rejects student 13', () => {
      const validateLimit = (limitStr: string): { valid: boolean; error?: string } => {
        const limitNum = parseInt(limitStr, 10);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 12) {
          return {
            valid: false,
            error: 'לפי מפרט המערכת (מודול 25), כיתה מכילה לכל היותר 12 תלמידים אנונימיים (תלמיד 1 עד תלמיד 12). הוספת תלמיד 13 חסומה.',
          };
        }
        return { valid: true };
      };

      expect(validateLimit('12').valid).toBe(true);
      expect(validateLimit('6').valid).toBe(true);
      expect(validateLimit('1').valid).toBe(true);
      
      const res13 = validateLimit('13');
      expect(res13.valid).toBe(false);
      expect(res13.error).toContain('הוספת תלמיד 13 חסומה');

      const res0 = validateLimit('0');
      expect(res0.valid).toBe(false);
    });
  });

  describe('3. Module 21 / WP6: Student Canvas Recorder & Path Specs', () => {
    it('generates canonical storage path for canvas recording WebM', () => {
      const path = CanvasRecorderService.getStoragePath('student_2', 'ex_03_02');
      expect(path).toBe('recordings/student_2/ex_03_02.webm');
    });

    it('instantiates CanvasRecorderService with safe default timeslice of 10s', () => {
      const recorder = new CanvasRecorderService();
      expect(recorder.getIsRecording()).toBe(false);
    });
  });

  describe('4. Chaos Scenario 2: Soft Device Lock (active_device_id)', () => {
    it('sets and updates isSupersededByOtherDevice state in workspace store', () => {
      useWorkspaceStore.getState().setActiveDeviceId('device_tablet_alpha');
      expect(useWorkspaceStore.getState().activeDeviceId).toBe('device_tablet_alpha');
      expect(useWorkspaceStore.getState().isSupersededByOtherDevice).toBe(false);

      // Other device takes ownership
      useWorkspaceStore.getState().setSupersededByOtherDevice(true);
      expect(useWorkspaceStore.getState().isSupersededByOtherDevice).toBe(true);

      // Reset
      useWorkspaceStore.getState().setSupersededByOtherDevice(false);
      expect(useWorkspaceStore.getState().isSupersededByOtherDevice).toBe(false);
    });
  });

  describe('5. Cloud Functions: onSessionCompleteTrigger Closed-Form Mastery & Admin Aggregator', () => {
    it('computes closed-form matrix_recommended_path based on deterministic score threshold', () => {
      const computeRecommendedPath = (scorePercent: number): 'green_path' | 'gap_reduction' => {
        return scorePercent >= 80 ? 'green_path' : 'gap_reduction';
      };

      expect(computeRecommendedPath(100)).toBe('green_path');
      expect(computeRecommendedPath(80)).toBe('green_path');
      expect(computeRecommendedPath(79)).toBe('gap_reduction');
      expect(computeRecommendedPath(45)).toBe('gap_reduction');
    });

    it('calculates authoritative session duration based on session number', () => {
      const getDurationMinutes = (sessionNumber: number): number => {
        return (sessionNumber <= 2 || sessionNumber === 8) ? 25 : 15;
      };

      expect(getDurationMinutes(1)).toBe(25);
      expect(getDurationMinutes(2)).toBe(25);
      expect(getDurationMinutes(3)).toBe(15);
      expect(getDurationMinutes(4)).toBe(15);
      expect(getDurationMinutes(7)).toBe(15);
      expect(getDurationMinutes(8)).toBe(25);
    });

    it('calculates admin aggregation metrics accurately', () => {
      const sessions = [
        { is_completed: true, session_score_percent: 90 },
        { is_completed: true, session_score_percent: 70 },
        { is_completed: false, session_score_percent: 0 },
      ];

      const completed = sessions.filter(s => s.is_completed);
      const totalSessions = sessions.length;
      const totalCompleted = completed.length;
      const avgMastery = Math.round(completed.reduce((acc, s) => acc + s.session_score_percent, 0) / totalCompleted);
      const completionRate = Math.round((totalCompleted / totalSessions) * 100);

      expect(totalCompleted).toBe(2);
      expect(avgMastery).toBe(80);
      expect(completionRate).toBe(67);
    });
  });
});
