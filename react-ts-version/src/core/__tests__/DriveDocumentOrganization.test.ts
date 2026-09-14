import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load functions/lib compiled module for runtime logic testing
const {
  DRIVE_FOLDERS,
  GOOGLE_DRIVE_FOLDER_ID,
  buildDriveFileName,
  classifyLooseDriveFile,
  formatIsraelTimestamp,
  formatIsraelDateTime,
  formatStudentToken,
  formatSessionToken,
  formatClassToken,
} = require('../../../../functions/lib/exportDriveReport');

const {
  renderProvenanceBlockHtml,
  renderProvenanceCsvHeader,
  pedagogicalReportHtml,
  classReportHtml,
  adminReportHtml,
} = require('../../../../functions/lib/reportHtml');

// Load source files for static source-pinning and Zero PII validation
const indexSrc = readFileSync(resolve(__dirname, '../../../../functions/src/index.ts'), 'utf-8');
const driveSrc = readFileSync(resolve(__dirname, '../../../../functions/src/exportDriveReport.ts'), 'utf-8');
const pedagogicalSrc = readFileSync(resolve(__dirname, '../../../../functions/src/pedagogicalReport.ts'), 'utf-8');
const classReportSrc = readFileSync(resolve(__dirname, '../../../../functions/src/classReport.ts'), 'utf-8');
const reportHtmlSrc = readFileSync(resolve(__dirname, '../../../../functions/src/reportHtml.ts'), 'utf-8');
const adminSettingsViewSrc = readFileSync(resolve(__dirname, '../../presentation/pages/admin/AdminSettingsView.tsx'), 'utf-8');

describe('Drive Document Organization & Governance (Task Spec 2026-09-09)', () => {
  describe('1. Cloud Functions Architecture & Public Endpoints Elimination', () => {
    it('has no onRequest with invoker: "public" in index.ts', () => {
      expect(indexSrc).not.toMatch(/invoker:\s*["']public["']/);
      expect(indexSrc).not.toMatch(/\bonRequest\s*\(/);
    });

    it('removed test endpoints triggerTestDriveReport and triggerExecutiveDriveReport from index.ts', () => {
      expect(indexSrc).not.toContain('triggerTestDriveReport');
      expect(indexSrc).not.toContain('triggerExecutiveDriveReport');
    });

    it('exports tidyDriveFolder callable from index.ts for admin maintenance', () => {
      expect(indexSrc).toMatch(/export\s*\{[^}]*tidyDriveFolder[^}]*\}\s*from\s*["']\.\/exportDriveReport["']/);
      expect(driveSrc).toMatch(/export const tidyDriveFolder = onCall\(/);
    });
  });

  describe('2. Drive Folder Structure & Root Upload Prevention', () => {
    it('defines the 5 primary type folders directly in shared drive plus archive folder', () => {
      expect(DRIVE_FOLDERS.learnerReports).toBe('01 דוחות תלמידים');
      expect(DRIVE_FOLDERS.researchData).toBe('02 נתוני מחקר');
      expect(DRIVE_FOLDERS.resetBackups).toBe('03 גיבויי איפוס');
      expect(DRIVE_FOLDERS.adminReports).toBe('04 דוחות מנהל');
      expect(DRIVE_FOLDERS.classReports).toBe('05 דוחות כיתה');
      expect(DRIVE_FOLDERS.archive).toBe('99 ארכיון');
    });

    it('resolveDriveFolder refuses to return the shared root folder ID', () => {
      expect(driveSrc).toMatch(/if\s*\(!pathSegments\s*\|\|\s*pathSegments\.length\s*===\s*0\)\s*\{\s*return null;\s*\}/);
      expect(driveSrc).not.toMatch(/return\s+GOOGLE_DRIVE_FOLDER_ID;/);
    });

    it('uploadBufferToDrive rejects root folder and null parent targets', () => {
      expect(driveSrc).toMatch(/if\s*\(!parentFolderId\s*\|\|\s*parentFolderId\s*===\s*GOOGLE_DRIVE_FOLDER_ID\)/);
      expect(driveSrc).toMatch(/cannot upload to root or null folder/);
    });

    it('getOrCreateDriveFolder throws error instead of falling back to parent on failure', () => {
      expect(driveSrc).toMatch(/throw new Error\(`Failed to (?:search|create) Drive folder/);
      expect(driveSrc).not.toMatch(/return parentId;[\s\n]*\/\/ fallback/);
    });
  });

  describe('3. Deterministic Hebrew File Naming Convention (buildDriveFileName)', () => {
    const fixedDate = new Date('2026-09-09T14:30:00+03:00');

    it('formats single learner report with padded student and session tokens', () => {
      const name = buildDriveFileName({
        kind: 'learner_report',
        studentNumber: 2,
        sessionNumber: 2,
        classId: 'class_1',
        date: fixedDate,
      });
      expect(name).toBe('דוח-תלמיד_תלמיד-02_מפגש-02_כיתה-1_2026-09-09_1430.pdf');
    });

    it('formats class report PDF and CSV with padded session token', () => {
      const pdfName = buildDriveFileName({
        kind: 'class_report_pdf',
        sessionNumber: 2,
        classId: 'class_1',
        date: fixedDate,
      });
      const csvName = buildDriveFileName({
        kind: 'class_report_csv',
        sessionNumber: 2,
        classId: 'class_1',
        date: fixedDate,
      });
      expect(pdfName).toBe('דוח-כיתה_מפגש-02_כיתה-1_2026-09-09_1430.pdf');
      expect(csvName).toBe('טבלת-כיתה_מפגש-02_כיתה-1_2026-09-09_1430.csv');
    });

    it('formats research datasets for all sessions and single sessions', () => {
      const allName = buildDriveFileName({
        kind: 'research_dataset',
        researchType: 'פעולות',
        sessionNumber: 'all',
        classId: 'class_1',
        date: fixedDate,
      });
      const singleName = buildDriveFileName({
        kind: 'research_dataset',
        researchType: 'הקלטות',
        sessionNumber: 3,
        classId: 'class_1',
        date: fixedDate,
      });
      expect(allName).toBe('מחקר-פעולות_כל-המפגשים_כיתה-1_2026-09-09_1430.csv');
      expect(singleName).toBe('מחקר-הקלטות_מפגש-03_כיתה-1_2026-09-09_1430.csv');
    });

    it('formats reset backups for system-wide and single student scopes', () => {
      const sysName = buildDriveFileName({
        kind: 'reset_backup',
        resetLevel: 'system',
        classId: 'class_1',
        date: fixedDate,
      });
      const stuName = buildDriveFileName({
        kind: 'reset_backup',
        resetLevel: 'single_student',
        studentNumber: 4,
        sessionNumber: 2,
        classId: 'class_1',
        date: fixedDate,
      });
      expect(sysName).toBe('גיבוי-איפוס_מערכת_כיתה-1_2026-09-09_1430.json');
      expect(stuName).toBe('גיבוי-איפוס_תלמיד-04_מפגש-02_כיתה-1_2026-09-09_1430.json');
    });

    it('formats admin report', () => {
      const name = buildDriveFileName({
        kind: 'admin_report',
        date: fixedDate,
      });
      expect(name).toBe('דוח-מנהל-מערכת_2026-09-09_1430.pdf');
    });

    it('never emits raw Unix epoch ms timestamps in file names', () => {
      const kinds = ['learner_report', 'class_report_pdf', 'class_report_csv', 'research_dataset', 'reset_backup', 'admin_report'] as const;
      for (const kind of kinds) {
        const name = buildDriveFileName({ kind, studentNumber: 1, sessionNumber: 1, classId: 'class_1' });
        expect(name).not.toMatch(/\b17\d{11}\b/);
        expect(name).toMatch(/_\d{4}-\d{2}-\d{2}_\d{4}\./);
      }
    });
  });

  describe('4. Loose File Classification Engine (classifyLooseDriveFile)', () => {
    it('marks test endpoint artifacts for trash', () => {
      const testFiles = [
        'PedagogicalReport_session1_student1_1725890000000.pdf',
        'MathmatiCore_Executive_Report_1725890000000.pdf',
        'MathmatiCore_Research_Data_s1_1725890000000.csv',
        'Executive_Report_12345.pdf',
      ];
      for (const f of testFiles) {
        expect(classifyLooseDriveFile(f)).toEqual({ action: 'trash', reason: 'test_endpoint_artifact' });
      }
    });

    it('classifies new and legacy learner reports to 01 דוחות תלמידים / מפגש N', () => {
      expect(classifyLooseDriveFile('דוח-תלמיד_תלמיד-02_מפגש-02_כיתה-1_2026-09-09_1430.pdf')).toEqual({
        action: 'move',
        targetFolderSegments: ['01 דוחות תלמידים', 'מפגש 2'],
      });
      expect(classifyLooseDriveFile('דוח_תלמיד02_מפגש02_2026-09-09_14-30.pdf')).toEqual({
        action: 'move',
        targetFolderSegments: ['01 דוחות תלמידים', 'מפגש 2'],
      });
    });

    it('classifies class reports to 05 דוחות כיתה / מפגש N', () => {
      expect(classifyLooseDriveFile('דוח-כיתה_מפגש-03_כיתה-1_2026-09-09_1430.pdf')).toEqual({
        action: 'move',
        targetFolderSegments: ['05 דוחות כיתה', 'מפגש 3'],
      });
      expect(classifyLooseDriveFile('טבלת-כיתה_מפגש-03_כיתה-1_2026-09-09_1430.csv')).toEqual({
        action: 'move',
        targetFolderSegments: ['05 דוחות כיתה', 'מפגש 3'],
      });
    });

    it('classifies research datasets to 02 נתוני מחקר / scope / date', () => {
      expect(classifyLooseDriveFile('מחקר-פעולות_כל-המפגשים_כיתה-1_2026-09-09_1430.csv')).toEqual({
        action: 'move',
        targetFolderSegments: ['02 נתוני מחקר', 'כל המפגשים', '2026-09-09'],
      });
      expect(classifyLooseDriveFile('מחקר-מפגשים_מפגש-04_כיתה-1_2026-09-09_1430.csv')).toEqual({
        action: 'move',
        targetFolderSegments: ['02 נתוני מחקר', 'מפגש 4', '2026-09-09'],
      });
    });

    it('classifies reset backups to 03 גיבויי איפוס', () => {
      expect(classifyLooseDriveFile('גיבוי-איפוס_מערכת_כיתה-1_2026-09-09_1430.json')).toEqual({
        action: 'move',
        targetFolderSegments: ['03 גיבויי איפוס'],
      });
      expect(classifyLooseDriveFile('Backup_system_2026-09-09.json')).toEqual({
        action: 'move',
        targetFolderSegments: ['03 גיבויי איפוס'],
      });
    });

    it('classifies admin reports to 04 דוחות מנהל', () => {
      expect(classifyLooseDriveFile('דוח-מנהל-מערכת_2026-09-09_1430.pdf')).toEqual({
        action: 'move',
        targetFolderSegments: ['04 דוחות מנהל'],
      });
      expect(classifyLooseDriveFile('MathmatiCore_Admin_Report_1725890000000.pdf')).toEqual({
        action: 'move',
        targetFolderSegments: ['04 דוחות מנהל'],
      });
    });

    it('archives unrecognized loose files to 99 ארכיון', () => {
      expect(classifyLooseDriveFile('unknown_research_summary.docx')).toEqual({
        action: 'archive',
        targetFolderSegments: ['99 ארכיון'],
      });
    });
  });

  describe('5. In-Document Provenance Metadata Integrity', () => {
    const sampleProvenance = {
      documentTypeDescription: 'דוח פדגוגי מסכם ללומד יחיד עבור מפגש 2',
      scopeDescription: 'כיתה 1 | מפגש 2 | תלמיד 2',
      dataRange: '2026-09-09 10:00 — 2026-09-09 10:45',
      generatedAtIsrael: '2026-09-09 14:30',
      generatedByRole: 'מורת הכיתה',
      dataSource: 'אירועי טלמטריה מתועדים, מפגש 2',
      aiLayerStatus: 'שכבת ניתוח בינה מלאכותית פעילה',
    };

    it('renderProvenanceBlockHtml contains all 7 mandatory labels', () => {
      const html = renderProvenanceBlockHtml(sampleProvenance);
      expect(html).toContain('מה המסמך הזה:');
      expect(html).toContain('כיתה / מפגש / לומד:');
      expect(html).toContain('טווח הנתונים:');
      expect(html).toContain('נוצר בתאריך:');
      expect(html).toContain('הופק על ידי:');
      expect(html).toContain('מקור הנתונים:');
      expect(html).toContain('שכבת הבינה:');
      expect(html).toContain('provenance-card');
    });

    it('renderProvenanceCsvHeader outputs comment lines with all 7 mandatory labels plus row count', () => {
      const header = renderProvenanceCsvHeader(sampleProvenance, 42);
      expect(header).toMatch(/^# מה המסמך הזה: דוח פדגוגי/m);
      expect(header).toMatch(/^# כיתה \/ מפגש \/ לומד: כיתה 1/m);
      expect(header).toMatch(/^# טווח הנתונים: 2026-09-09/m);
      expect(header).toMatch(/^# נוצר בתאריך: 2026-09-09/m);
      expect(header).toMatch(/^# הופק על ידי: מורת הכיתה/m);
      expect(header).toMatch(/^# מקור הנתונים: אירועי טלמטריה/m);
      expect(header).toMatch(/^# שכבת הבינה: שכבת ניתוח/m);
      expect(header).toMatch(/^# מספר שורות: 42$/m);
    });

    it('HTML templates embed provenance block directly under header', () => {
      const pedHtml = pedagogicalReportHtml({
        session_number: 2,
        anonymous_student_label: 'תלמיד 2',
        score_percent: 85,
        matrix_recommended_path: 'green_path',
        exercise_narratives: ['תרגיל ראשון'],
        provenance: sampleProvenance,
      });
      expect(pedHtml).toContain('class="provenance-card"');
      expect(pedHtml).toContain('מורת הכיתה');

      const classHtml = classReportHtml({
        session_number: 2,
        aggregates: {
          learners_with_data: 2,
          learners_without_data: [],
          score_mean: 80,
          score_median: 80,
          score_min: 70,
          score_max: 90,
          tiers: { below_50: [], between_50_75: [], above_75: [] },
          paths: { green_path: 1, remediation_path: 1 },
          active_minutes_mean: 15,
          recording_minutes_total: 0,
          events_total: 20,
          digits_entered_total: 10,
          wrong_digits_total: 2,
          wrong_digits_by_column: { units: 1, tens: 1, hundreds: 0, thousands: 0 },
          deletions_total: 0,
          undos_total: 0,
          hesitations_total: 1,
          hesitation_seconds_total: 5,
          regroupings_total: 0,
          socratic_cards_total: 0,
          socratic_triggers: {},
          error_categories: {},
          reflections_submitted: 1,
          exercises: [],
        },
        learners: [],
        provenance: sampleProvenance,
      });
      expect(classHtml).toContain('class="provenance-card"');

      const admHtml = adminReportHtml({
        schoolsCount: 1,
        teachersCount: 2,
        studentsCount: 12,
        alertsCount: 0,
        timestamp: '2026-09-09 14:30',
        provenance: sampleProvenance,
      });
      expect(admHtml).toContain('class="provenance-card"');
    });
  });

  describe('6. Zero PII Enforcement in Document Generation', () => {
    it('does not leak user emails in report bodies, filenames or CSV rows', () => {
      // Ensure no token.email or userEmail leaks into generated files
      expect(pedagogicalSrc).not.toMatch(/token\.email/);
      expect(classReportSrc).not.toMatch(/token\.email/);
      expect(reportHtmlSrc).not.toMatch(/token\.email/);

      // Verify role abstraction in admin report and exports
      expect(driveSrc).toMatch(/roleLabel\s*=\s*isTeacher\s*\?\s*"מורת הכיתה"\s*:\s*"מנהל המערכת"/);
      expect(pedagogicalSrc).toMatch(/generatedByRole:\s*"מורת הכיתה"/);
      expect(classReportSrc).toMatch(/generatedByRole:\s*"מורת הכיתה"/);
    });

    it('strictly clamps student IDs to anonymous numbers 1–12', () => {
      expect(pedagogicalSrc).toMatch(/Math\.min\(12,\s*Math\.max\(1,\s*parseInt\(studentDigits,\s*10\)\)\)/);
      expect(classReportSrc).toMatch(/studentNumber\(v:\s*unknown\):\s*number\s*\|\s*null/);
      expect(classReportSrc).toMatch(/n\s*>=\s*1\s*&&\s*n\s*<=\s*12/);
    });
  });

  describe('7. Admin UI Drive Organization Controls (AdminSettingsView)', () => {
    it('includes Drive Tidy maintenance card and trigger button', () => {
      expect(adminSettingsViewSrc).toContain('סידור תיקיית הדרייב (Google Drive)');
      expect(adminSettingsViewSrc).toContain('סדר את תיקיית הדרייב');
    });

    it('requires confirmation dialog before calling tidyDriveFolder', () => {
      expect(adminSettingsViewSrc).toContain('אישור סידור תיקיית הדרייב');
      expect(adminSettingsViewSrc).toContain('setIsTidyConfirmOpen(true)');
      expect(adminSettingsViewSrc).toContain('tidyDriveFolder');
    });

    it('displays comprehensive results breakdown in Hebrew', () => {
      expect(adminSettingsViewSrc).toContain('תוצאות סידור תיקיית הדרייב:');
      expect(adminSettingsViewSrc).toContain('תיקיות שנוצרו');
      expect(adminSettingsViewSrc).toContain('קבצים שהועברו');
      expect(adminSettingsViewSrc).toContain('קבצים באשפה');
      expect(adminSettingsViewSrc).toContain('כשלים / שגיאות');
    });
  });
});
