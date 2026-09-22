/**
 * מי צוות ומי לומד — לפי המזהה בלבד.
 *
 * הלומדים הם מזהים אנונימיים 1–12 (`student_user4`, `student_4`, `user4`, `4`).
 * כל השאר — "admin", "teacher", כתובת דוא"ל, מזהה Auth של Firebase (28 תווים),
 * מספר ת"ז מוסדי — הוא צוות.
 *
 * הכלל ישב בתוך useChatStore ושימש רק את הצ׳אט; יומן הביקורת ניחש לבד עם כלל
 * חלקי ("לא admin, לא teacher, אין @") ולכן טיפל במזהה Auth של מורה כבלומד:
 * הכניסה שלה נדחפה ל-`users/students/<uid>/radar_history` ול-`radar_alerts`
 * במקום ל-`audit_logs`. כלל אחד, במקום אחד, לשני הצרכנים.
 */
export function isTeacherOrAdminId(id?: string | null): boolean {
  if (!id) return false;
  const clean = id.trim().toLowerCase();
  if (
    clean.startsWith('student_') ||
    clean.startsWith('user') ||
    /^(1[0-2]|[1-9])$/.test(clean)
  ) {
    return false;
  }
  return (
    clean === 'admin' ||
    clean === 'teacher' ||
    clean.startsWith('admin_') ||
    clean.startsWith('teacher_') ||
    clean.includes('@') ||
    /^\d{8,10}$/.test(clean) ||
    (clean.length >= 20 && !clean.includes(' ') && !clean.includes(';') && !clean.includes('<'))
  );
}
