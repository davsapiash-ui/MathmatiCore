import { useEffect } from 'react';
import { useStore } from '@/application/useStore';
import { currentStudentUid } from '@/application/useAuthStore';

/**
 * מסמך העיצוב §1.3 — "מצב שקט חזותי".
 *
 * שקט חזותי הוא תכונה של הלומד, לא של מסך מסוים. הגרסה הראשונה סימנה
 * אותו רק על שורש מרחב העבודה, ולכן הלובי — המסך שילד רגיש חושית בוהה
 * בו הכי הרבה זמן, בהמתנה לפתיחת השיעור — המשיך להציג שעון חול פועם
 * ונקודה מהבהבת.
 *
 * הסימון נכתב על אלמנט השורש של המסמך, כך שכללי ה-CSS של מצב השקט חלים
 * על כל מסך שהילד רואה: הלובי, מרחב העבודה, מסכי ההמתנה והשכבות
 * הצפות שנפתחות דרך פורטלים מחוץ לעץ הרכיבים.
 *
 * המקור הוא הסימון שהמורה קובעת בתנאי הלמידה של הלומד.
 */
export function useQuietMode(): boolean {
  const uid = currentStudentUid();
  const isQuiet = useStore((s) => (uid ? Boolean(s.students[uid]?.isASD) : false));

  useEffect(() => {
    const root = document.documentElement;
    if (isQuiet) root.setAttribute('data-quiet', 'true');
    else root.removeAttribute('data-quiet');
    return () => root.removeAttribute('data-quiet');
  }, [isQuiet]);

  return isQuiet;
}
