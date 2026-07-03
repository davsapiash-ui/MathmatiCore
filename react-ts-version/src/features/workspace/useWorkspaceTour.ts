import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

const HAS_SEEN_TOUR_KEY = 'mathmaticore_has_seen_tour';

export function useWorkspaceTour() {
  const driverObj = useRef<any>(null);
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);

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
          element: '#tour-task-card',
          popover: {
            title: 'ברוכים הבאים למשימה!',
            description: 'כאן מופיעה המשימה שלך. קרא אותה היטב לפני שתתחיל לפתור.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-block-palette',
          popover: {
            title: 'קופסת הכלים',
            description: 'מכאן תוכל לגרור יחידות, עשרות, מאות ואלפים לתוך לוח המספרים.',
            side: 'top',
            align: 'center'
          }
        },
        {
          element: '#tour-place-value-board',
          popover: {
            title: 'בית המספרים',
            description: 'כאן תבנה את התשובה שלך! גרור את הקוביות לעמודות המתאימות: יחידות, עשרות, מאות ואלפים.',
            side: 'right',
            align: 'start'
          }
        },
        {
          element: '#tour-column-units',
          popover: {
            title: 'המרה ואריזה',
            description: 'זכור: אם תאסוף 10 יחידות בטור אחד, יופיע כפתור שיאפשר לך לארוז אותן לעשרת אחת שלמה!',
            side: 'left',
            align: 'center'
          }
        },
        {
          element: '#tour-action-buttons',
          popover: {
            title: 'סיימת?',
            description: 'בסיום המשימה, לחץ כאן כדי להתקדם למשימה הבאה. בהצלחה!',
            side: 'top',
            align: 'end'
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

  // Auto-start on meeting 1 if not seen
  useEffect(() => {
    if (sessionNumber === 1) {
      const hasSeen = localStorage.getItem(HAS_SEEN_TOUR_KEY);
      if (!hasSeen) {
        // Small delay to ensure UI is mounted and blocks are rendered
        const timer = setTimeout(() => {
          startTour();
          localStorage.setItem(HAS_SEEN_TOUR_KEY, 'true');
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [sessionNumber]);

  return { startTour };
}
