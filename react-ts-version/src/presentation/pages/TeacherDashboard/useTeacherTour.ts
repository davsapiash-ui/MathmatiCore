import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_STORAGE_KEY = 'mc_teacher_tour_seen';

const isTourSeenInStorage = (): boolean => {
  try {
    const g = globalThis as any;
    const isWebdriver = typeof navigator !== 'undefined' && navigator.webdriver;
    if (g['__E2E_BYPASS_TOUR__'] === true || isWebdriver) return true;
    const s = g['sessionStorage'] || g['localStorage'];
    if (s) {
      return s.getItem(TOUR_STORAGE_KEY) === 'true';
    }
  } catch {}
  return false;
};

const setTourSeenInStorage = () => {
  try {
    const g = globalThis as any;
    const s = g['sessionStorage'] || g['localStorage'];
    if (s) {
      s.setItem(TOUR_STORAGE_KEY, 'true');
    }
  } catch {}
};

export function useTeacherTour() {
  const driverObj = useRef<any>(null);

  useEffect(() => {
    driverObj.current = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: 'rgba(15, 23, 42, 0.75)',
      nextBtnText: 'הבא',
      prevBtnText: 'הקודם',
      doneBtnText: 'הבנתי, תודה!',
      progressText: '{{current}} מתוך {{total}}',
      popoverClass: 'ws-tour-popover font-display',
      onDestroyStarted: () => {
        setTourSeenInStorage();
        if (driverObj.current) {
          driverObj.current.destroy();
        }
      },
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
        },
        {
          element: '#tour-tab-approvals',
          popover: {
            title: 'אישור משימות AI',
            description: 'משימות שנבדקו על ידי מנוע ה-AI ימתינו לאישורך כאן לפני שהתלמיד יוכל להמשיך.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-tab-class_management',
          popover: {
            title: 'ניהול כיתה',
            description: 'צפייה בסטטוס ההתקדמות של התלמידים, נתוני אבחון ואפשרויות איפוס במידת הצורך.',
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
    if (!isTourSeenInStorage()) {
      const timer = setTimeout(() => {
        startTour();
        setTourSeenInStorage();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  return { startTour };
}
