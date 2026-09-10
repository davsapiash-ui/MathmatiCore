import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * חוקי Firestore על מסמך התלמיד ומסמך המפגש.
 *
 * שלושה דברים נמצאו כאן, וכולם נגעו באותם מסמכים:
 * 1. הסכמה דרשה `support_profile_version` בכל כתיבה. המורה יוצרת את מסמכי
 *    התלמידים בהפעלת מפגש בלי השדה הזה — בכוונה, כי כתיבת ערך קבוע בכל
 *    הפעלה הייתה מאפסת פרופיל שהותאם — ולכן כל יצירה נדחתה והאוסף נשאר
 *    ריק. הדוח הפדגוגי ומצבור הניהול קוראים בדיוק את המסמכים האלה.
 * 2. לומד יכול היה לכתוב לעצמו `support_profile_id`, בניגוד למודול 19 §ב
 *    ("Only authorized teachers may write this field"), והדוח הפדגוגי קורא
 *    את השדה הזה מהמסמך שלו.
 * 3. לומד יכול היה לכתוב לעצמו את המסלול שהמורה בחרה ואת חותמות האישור.
 */
const rules = readFileSync(resolve(__dirname, '../../../..', 'firestore.rules'), 'utf-8');

const section = (from: string, to: string) => {
  const start = rules.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const end = rules.indexOf(to, start);
  expect(end).toBeGreaterThan(start);
  return rules.slice(start, end);
};

describe('מסמך התלמיד', () => {
  it('גרסת פרופיל התמיכה נבדקת כשהיא קיימת, ואינה חוסמת יצירה בלעדיה', () => {
    const schema = section('function isValidStudentDoc', 'function supportProfileKeys');
    expect(schema).toContain("!('support_profile_version' in data) || data.support_profile_version is int");
    // הדרישה הישנה, שחסמה את כל האוסף, אינה קיימת עוד.
    expect(schema).not.toMatch(/&&\s*\n\s*data\.support_profile_version is int;/);
  });

  it('רק מורה רשאית לכתוב את שדות פרופיל התמיכה', () => {
    const helpers = section('function supportProfileKeys', '// 2. Telemetry Log Schema');
    for (const field of [
      'support_profile_id',
      'support_profile_version',
      'support_profile_updated_at',
      'support_profile_updated_by',
    ]) {
      expect(helpers).toContain(`'${field}'`);
    }
    expect(helpers).toContain('!request.resource.data.keys().hasAny(supportProfileKeys())');
    expect(helpers).toContain('.diff(resource.data).affectedKeys().hasAny(supportProfileKeys())');
  });

  it('שני נתיבי מסמך התלמיד אוכפים את אותו כלל, ביצירה ובעדכון', () => {
    const routing = section('match /students/{studentId}', '// Sessions Collection');
    expect(routing.match(/writerMayTouchSupportProfileOnCreate\(\)/g)).toHaveLength(2);
    expect(routing.match(/writerMayTouchSupportProfileOnUpdate\(\)/g)).toHaveLength(2);
    // הכלל הישן איחד create ו-update תחת allow write, בלי הבחנה.
    expect(routing).not.toContain('allow write: if (isTeacher() || isOwningStudent(studentId))');
  });
});

describe('מסמך המפגש', () => {
  it('לומד אינו קובע את המסלול שהמורה בחרה או את חותמות האישור', () => {
    const helper = section('function gateDecisionFieldsAreEmpty', '// --- Collections Routing ---');
    for (const field of ['teacher_selected_path', 'gate_approved_at', 'gate_approved_by']) {
      expect(helper).toContain(`request.resource.data.get('${field}', null) == null`);
    }
  });

  it('הכלל חל גם ביצירה וגם בעדכון', () => {
    const routing = section('match /sessions/{sessionId}', 'match /telemetry_logs');
    expect(routing.match(/gateDecisionFieldsAreEmpty\(\)/g)).toHaveLength(2);
    // דגל האישור עצמו ממשיך להיות מוגן כפי שהיה.
    expect(routing).toContain('request.resource.data.teacher_gate_approved == false');
    expect(routing).toContain(
      'request.resource.data.teacher_gate_approved == resource.data.teacher_gate_approved'
    );
  });

  it('הלקוח כותב את שלושת השדות כ-null, כך שהכלל אינו חוסם סיום מפגש 2', () => {
    const sync = readFileSync(
      resolve(__dirname, '../../infrastructure/services/FirebaseSyncService.ts'),
      'utf-8'
    );
    const fn = sync.slice(sync.indexOf('public async syncSession2Completion'));
    const body = fn.slice(0, fn.indexOf('public async fetchTeacherClassrooms'));
    expect(body).toContain('gate_approved_at: null');
    expect(body).toContain('gate_approved_by: null');
    expect(body).toContain('teacher_selected_path: null');
  });
});
