import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { create } from 'zustand';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

interface WorkspaceTourState {
  hasSeenWorkspaceTour: boolean;
  completeWorkspaceTour: () => void;
}

const isWebdriver = typeof navigator !== 'undefined' && navigator.webdriver;
const e2eBypass = typeof window !== 'undefined' && ((window as any).__E2E_BYPASS_TOUR__ === true || isWebdriver);

export const useWorkspaceTourStore = create<WorkspaceTourState>((set) => ({
  hasSeenWorkspaceTour: e2eBypass, // In memory only. True bypasses the tour.
  completeWorkspaceTour: () => set({ hasSeenWorkspaceTour: true }),
}));

export function useWorkspaceTour() {
  const driverObj = useRef<any>(null);
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const { hasSeenWorkspaceTour, completeWorkspaceTour } = useWorkspaceTourStore();

  useEffect(() => {
    driverObj.current = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      showButtons: ['next', 'previous', 'close'],
      overlayColor: 'rgba(15, 23, 42, 0.75)',
      nextBtnText: 'התקדם',
      prevBtnText: 'הקודם',
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
            title: 'מחסן הכלים',
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
            description: 'זכור: אם תאסוף 10 יחידות או יותר בטור אחד, תוכל לגרור אחת מהן לטור הבא כדי לקבץ אותן לעשרת שלמה!',
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
      if (!hasSeenWorkspaceTour) {
        // Small delay to ensure UI is mounted and blocks are rendered
        const timer = setTimeout(() => {
          startTour();
          completeWorkspaceTour();
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [sessionNumber, hasSeenWorkspaceTour, completeWorkspaceTour]);

  return { startTour };
}
