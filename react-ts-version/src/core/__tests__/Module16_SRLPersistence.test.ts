import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { srlReflectionDocId, toSRLEffortLevel, toSRLStrategies } from '../srlReflection';

/**
 * מודול 16 — לוח הרפלקציה של מפגש 8.
 *
 * המסך אסף את שלושת השלבים כהלכה ואז זרק את כולם: בסיום נשלחה רק רמת
 * המאמץ, אל `syncRouteRecommendation`, שכותבת אותה לשדה `routeRecommendation`
 * (צבע מסלול שהדשבורד משווה ל-'YELLOW') וגם דורסת את `routeStatus` ל-'PENDING'
 * — כלומר מבטלת את החלטת שער המורה בסיום המפגש האחרון.
 *
 * במקביל, `srl_reflections` נקרא בשני מקומות בשרת (דוח הכיתה וייצוא המחקר)
 * ואף אחד לא כתב אליו, כך ששניהם דיווחו אפס רפלקציות תמיד.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const repo = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf-8');

describe('הרפלקציה נשמרת, ולא לשדה של מישהו אחר', () => {
  const workspace = src('features/workspace/StudentWorkspacePage.tsx');

  it('סיום מפגש 8 שומר רפלקציה', () => {
    expect(workspace).toContain('submitSRLReflection(');
  });

  it('סיום מפגש 8 אינו נוגע עוד בהמלצת המסלול או בסטטוס השער', () => {
    const screen = workspace.slice(workspace.indexOf('<Session8ReflectionScreen'));
    const block = screen.slice(0, screen.indexOf('/>'));
    expect(block).not.toContain('syncRouteRecommendation');
  });

  it('המסך מעביר את שלושת השלבים במלואם, לא רק את רמת המאמץ', () => {
    const screen = src('presentation/components/student/Session8ReflectionScreen.tsx');
    expect(screen).toContain('onComplete: (result: SRLReflectionResult) => void');
    expect(screen).toContain('strategies: selectedStrategies');
    expect(screen).toContain('persistenceIndex: persistenceRatio');
    expect(screen).not.toContain("onComplete(effortLevel || 'MEDIUM')");
  });

  it('רפלקציית מפגש 2 נכתבת במזהה שהחוקים מתירים ללומד', () => {
    // push() מייצר מפתח אקראי, ולכן כל כתיבה לצומת המשותף נדחתה בשקט.
    const reflection = src('features/workspace/ReflectionScreen.tsx');
    expect(reflection).toContain('reflections/reflection_02_student_${studentNumber}');
    expect(reflection).not.toContain("push(ref(database, 'reflections')");
  });
});

describe('מסמך הרפלקציה תואם את מה שחוקי Firestore מתירים', () => {
  const rules = repo('firestore.rules');
  const module = src('core/srlReflection.ts');

  it('מזהה המסמך הוא מפתח האידמפוטנטיות שהאפיון דורש', () => {
    // חוקי Firestore מתירים create בלבד, כך שהכתיבה הראשונה קובעת.
    expect(srlReflectionDocId(7)).toBe('session_08_student_7');
    expect(rules).toContain('allow update: if false;');
  });

  it('כל שדה שהמודול כותב נמצא ברשימת השדות המותרת', () => {
    const schema = rules.slice(rules.indexOf('function isValidSRLReflectionDoc'));
    const allowlist = schema.slice(0, schema.indexOf(']'));
    for (const field of [
      'student_id', 'session_id', 'session_number', 'effort_level',
      'selected_strategies', 'persistence_index', 'undo_count',
      'error_count', 'guess_count', 'submitted_at',
    ]) {
      expect(allowlist).toContain(`'${field}'`);
      expect(module).toContain(`${field}:`);
    }
  });

  it('החוקים דורשים מפגש 8 ומדד התמדה בטווח 0 עד 100', () => {
    const schema = rules.slice(rules.indexOf('function isValidSRLReflectionDoc'));
    const body = schema.slice(0, schema.indexOf('match /support_tickets'));
    expect(body).toContain('data.session_number == 8');
    expect(body).toContain('data.persistence_index >= 0 && data.persistence_index <= 100');
    expect(body).toContain("data.effort_level in ['LOW', 'MEDIUM', 'HIGH']");
  });
});

describe('המרת ערכי המסך לערכים הקנוניים של האפיון', () => {
  it('רמת מאמץ', () => {
    expect(toSRLEffortLevel('EASY')).toBe('LOW');
    expect(toSRLEffortLevel('MEDIUM')).toBe('MEDIUM');
    expect(toSRLEffortLevel('HARD')).toBe('HIGH');
    // ילד שלא בחר מגיע לשלב הסיום עם ברירת מחדל, לא עם ערך שהחוקים ידחו.
    expect(toSRLEffortLevel(null)).toBe('MEDIUM');
  });

  it('אסטרטגיות — שלוש בלבד, בלי כפילויות ובלי ערכים לא מוכרים', () => {
    expect(toSRLStrategies(['undo', 'memory', 'hints'])).toEqual([
      'UNDO_BUTTON', 'MEMORY_CIRCLES', 'SOCRATIC_CARD',
    ]);
    expect(toSRLStrategies(['undo', 'undo'])).toEqual(['UNDO_BUTTON']);
    expect(toSRLStrategies(['שתול'])).toEqual([]);
    expect(toSRLStrategies([])).toEqual([]);
  });
});
