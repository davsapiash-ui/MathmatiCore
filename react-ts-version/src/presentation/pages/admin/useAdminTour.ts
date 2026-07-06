import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const HAS_SEEN_ADMIN_TOUR_KEY = 'mathmaticore_has_seen_admin_tour';

export function useAdminTour() {
  const driverObj = useRef<any>(null);

  useEffect(() => {
    driverObj.current = driver({
      showProgress: true,
      animate: true,
      allowClose: false,
      overlayColor: 'rgba(15, 23, 42, 0.75)',
      nextBtnText: 'הבא',
      prevBtnText: 'הקודם',
      doneBtnText: 'הבנתי, בוא נתחיל!',
      progressText: '{{current}} מתוך {{total}}',
      popoverClass: 'ws-tour-popover font-display',
      steps: [
        {
          element: '#tour-admin-overview',
          popover: {
            title: 'סקירה כללית',
            description: 'כאן תראה את לוח הבקרה הראשי של המערכת, כולל סטטיסטיקות כלליות על תלמידים ומוסדות.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-admin-schools',
          popover: {
            title: 'מוסדות ומורים',
            description: 'ניהול בתי ספר, הוספה או הסרה של מורים, ושיוך כיתות מתבצעים כאן.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-admin-curriculum',
          popover: {
            title: 'הגדרות פדגוגיה',
            description: 'קביעת תוכניות לימודים, ניהול משימות וכיול הקושי של סוכן ה-AI.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-admin-security',
          popover: {
            title: 'אבטחה והרשאות',
            description: 'מערך ההרשאות (Role-Based Access Control) של המערכת, שמונע גישה לא מורשית למסכים מסווגים.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-admin-chat',
          popover: {
            title: 'צ\'אט הודעות',
            description: 'כאן תוכל לשלוח הודעות פרטיות לצוות המורים, לראות את הדיווחים שלהם בזמן אמת ולתת תמיכה.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-admin-settings',
          popover: {
            title: 'מערכת ונגישות (UDL)',
            description: 'הגדרות מערכת גלובליות, כולל מצבי עיצוב נגיש, צבעים ופרמטרים מערכתיים אחרים.',
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
    const hasSeen = localStorage.getItem(HAS_SEEN_ADMIN_TOUR_KEY);
    if (!hasSeen) {
      // Small delay to ensure UI is mounted
      const timer = setTimeout(() => {
        startTour();
        localStorage.setItem(HAS_SEEN_ADMIN_TOUR_KEY, 'true');
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  return { startTour };
}
