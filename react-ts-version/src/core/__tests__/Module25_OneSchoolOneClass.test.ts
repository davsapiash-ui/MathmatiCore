import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PILOT_SCHOOL_ID, PILOT_SCHOOL_NAME, PILOT_CLASS_ID, PILOT_CLASS_NAME } from '@/core/pilotInstitution';

/**
 * PRD Module 25 §ב.1: "הגדרת בית ספר יחיד בשם 'בית ספר ביקורת' וכיתה פעילה אחת
 * בלבד בשם 'המבקרים'."
 *
 * Until 15.9.2026 the admin wizard allowed five schools and five classes per
 * teacher, the admin screen showed "0 / 5", both screens carried a notice that
 * they were "ערוכים לתמיכה בריבוי מוסדות וכיתות", and the deviation register
 * described the PRD as silent on the matter. The PRD fixes one of each; the
 * owner ruled the code follows it — no multi-institution preparation at all.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');
const wizard = read('../../presentation/pages/admin/AdminWizardModal.tsx');
const schoolsView = read('../../presentation/pages/admin/AdminSchoolsView.tsx');
const login = read('../../presentation/pages/Login.tsx');
const dashboard = read('../../presentation/pages/TeacherDashboard.tsx');
const store = read('../../application/useAdminStore.ts');
const service = read('../../infrastructure/services/FirebaseSyncService.ts');
const server = read('../../../../functions/src/authenticateStudentSession.ts');
const rtdbRules = JSON.parse(read('../../../../database.rules.json'));
const firestoreRules = read('../../../../firestore.rules');

describe('Module 25 §ב.1 — one school, one class', () => {
  it('the constants are the names the spec fixes', () => {
    expect(PILOT_SCHOOL_ID).toBe('school_bikorot');
    expect(PILOT_SCHOOL_NAME).toBe('בית ספר ביקורת');
    expect(PILOT_CLASS_ID).toBe('class_1');
    expect(PILOT_CLASS_NAME).toBe('המבקרים');
  });

  it('no "up to five" limits and no multi-institution notice remain', () => {
    for (const [name, src] of [['wizard', wizard], ['schoolsView', schoolsView]] as const) {
      expect(src, name).not.toContain('5 מוסדות');
      expect(src, name).not.toContain('5 כיתות');
      expect(src, name).not.toContain('/ 5');
      expect(src, name).not.toContain('/5)');
      expect(src, name).not.toContain('ריבוי מוסדות');
      expect(src, name).not.toContain('אינו זמין בגרסת הפיילוט');
      expect(src, name).not.toContain('הכנה לעתיד');
    }
  });

  it('the wizard never asks for a school name and refuses a second institution', () => {
    expect(wizard).not.toContain('placeholder="לדוגמה: בית ספר');
    expect(wizard).toContain('<span>{PILOT_SCHOOL_NAME}</span>');
    expect(wizard).toContain('if (schools.length > 0 || classes.length > 0) {');
    expect(wizard).toContain('if (mode === "add_class" && classes.length > 0) {');
  });

  it('the store and the service use fixed ids — never a generated key', () => {
    expect(store).not.toMatch(/`school_\$\{/);
    expect(store).not.toMatch(/`class_\$\{/);
    expect(service).not.toContain("push(ref(database, 'schools'))");
    expect(service).not.toContain("push(ref(database, 'classes'))");
  });

  it('the login screen offers only the pilot school and class', () => {
    expect(login).not.toContain('useAdminStore');
    expect(login).toContain('const schoolsList = PILOT_SCHOOLS;');
    expect(login).toContain('const classesForSelectedSchool = PILOT_CLASSES;');
  });

  it('the teacher dashboard activates the pilot class, not whichever class is first', () => {
    expect(dashboard).not.toContain("classes[0]?.id || 'class_1'");
    expect(dashboard).toContain('const classId = PILOT_CLASS_ID;');
  });

  it('the server signs a learner into the pilot class only', () => {
    expect(server).toContain('if (classId !== "class_1") {');
  });

  it('the database rules accept writes to the pilot school and class ids only', () => {
    expect(rtdbRules.rules.schools.$schoolId['.validate']).toBe("$schoolId == 'school_bikorot'");
    expect(rtdbRules.rules.classes.$classId['.validate']).toBe("$classId == 'class_1'");
    expect(rtdbRules.rules.public_classes.$classId['.validate']).toBe("$classId == 'class_1'");
    expect(firestoreRules).toContain("allow create, update: if isAdmin() && schoolId == 'school_bikorot';");
    expect(firestoreRules).toContain("allow create, update: if classId == 'class_1' && (isTeacherOfClass(classId) || isAdmin()) && isValidClassDoc();");
  });
});
