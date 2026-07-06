import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const HAS_SEEN_TEACHER_TOUR_KEY = 'mathmaticore_has_seen_teacher_tour';

export function useTeacherTour() {
  const driverObj = useRef<any>(null);

  useEffect(() => {
    driverObj.current = driver({
      showProgress: true,
      animate: true,
      allowClose: false,
      overlayColor: 'rgba(15, 23, 42, 0.75)',
      nextBtnText: 'הבא >',
      prevBtnText: '< הקודם',
      doneBtnText: 'הבנתי, בוא נתחיל!',
      progressText: '{{current}} מתוך {{total}}',
      popoverClass: 'ws-tour-popover font-display',
      steps: [
        {
          element: '#tour-tab-clustering',
          popover: {
            title: 'מיפוי כיתתי',
            description: 'כאן תוכלי לראות בזמן אמת את פילוג הכיתה לפי מיומנויות, עם אפשרות לחלק למשימות מותאמות.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-tab-alerts',
          popover: {
            title: 'רדאר סמוי',
            description: 'כאן תקבלי התראות בזמן אמת על תלמידים שמראים סימני תסכול או היסוס בזמן פתרון משימה.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-tab-reports',
          popover: {
            title: 'דו"חות אישיים',
            description: 'במסך זה ניתן לצפות בפרופיל של כל תלמיד בנפרד ולצפות בשחזורים מדויקים של פעולותיו.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-tab-chat',
          popover: {
            title: 'תקשורת אישית',
            description: 'מכאן ניתן לנהל צ׳אט עם התלמידים, לשלוח רמזים, ולראות הודעות נכנסות.',
            side: 'left',
            align: 'start'
          }
        }
      ]
    });
  }, []);

  const startTour = () => {
    if (driverObj.current) {
      driverObj.current.drive();
    }
  };

  useEffect(() => {
    const hasSeen = localStorage.getItem(HAS_SEEN_TEACHER_TOUR_KEY);
    if (!hasSeen) {
      // Small delay to ensure UI is mounted
      const timer = setTimeout(() => {
        startTour();
        localStorage.setItem(HAS_SEEN_TEACHER_TOUR_KEY, 'true');
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  return { startTour };
}
