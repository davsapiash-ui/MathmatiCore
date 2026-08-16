import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { create } from 'zustand';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

interface WorkspaceTourState {
  hasSeenWorkspaceTour: boolean;
  completeWorkspaceTour: () => void;
  resetWorkspaceTour: () => void;
}

const getInitialSeenState = (): boolean => {
  if (typeof window === 'undefined') return false;
  if ((window as any).__E2E_BYPASS_TOUR__ === true || (navigator && navigator.webdriver)) {
    return true;
  }
  try {
    const saved = localStorage.getItem('mathmaticore_has_seen_workspace_tour');
    if (saved === 'true') return true;
  } catch (_e) {
    // Ignore storage errors
  }
  return false;
};

export const useWorkspaceTourStore = create<WorkspaceTourState>((set) => ({
  hasSeenWorkspaceTour: getInitialSeenState(),
  completeWorkspaceTour: () => {
    try {
      localStorage.setItem('mathmaticore_has_seen_workspace_tour', 'true');
    } catch (_e) {}
    set({ hasSeenWorkspaceTour: true });
  },
  resetWorkspaceTour: () => {
    try {
      localStorage.removeItem('mathmaticore_has_seen_workspace_tour');
    } catch (_e) {}
    set({ hasSeenWorkspaceTour: false });
  },
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
      overlayColor: 'rgba(15, 23, 42, 0.65)',
      nextBtnText: 'התקדם',
      prevBtnText: 'הקודם',
      doneBtnText: 'הבנו, בואו נתחיל! 🚀',
      progressText: 'שלב {{current}} מתוך {{total}}',
      popoverClass: 'ws-tour-popover font-display',
      onDestroyed: () => {
        completeWorkspaceTour();
      },
      onCloseClick: () => {
        completeWorkspaceTour();
        driverObj.current?.destroy();
      },
      onPopoverRender: (popover) => {
        // Enforce exact button text to prevent any duplicate rendering ('הקודם הקודם')
        if (popover.previousButton) {
          popover.previousButton.textContent = 'הקודם';
        }
        if (popover.nextButton) {
          const isLast = driverObj.current?.isLastStep();
          popover.nextButton.textContent = isLast ? 'הבנו, בואו נתחיל! 🚀' : 'התקדם ➔';
        }
        
        // Add "אל תציג שוב" skip link in the footer if not present
        if (popover.footer && !popover.footer.querySelector('.ws-tour-skip-link')) {
          const skipBtn = document.createElement('button');
          skipBtn.className = 'ws-tour-skip-link text-xs text-emerald-700 hover:text-emerald-900 underline font-medium cursor-pointer ml-auto';
          skipBtn.textContent = 'אל תציג הדרכה זו שוב';
          skipBtn.onclick = (e) => {
            e.preventDefault();
            completeWorkspaceTour();
            driverObj.current?.destroy();
          };
          popover.footer.insertBefore(skipBtn, popover.footer.firstChild);
        }
      },
      steps: [
        {
          element: '#tour-task-card',
          popover: {
            title: '🎯 ברוכים הבאים למשימה!',
            description: 'כאן מופיעה המשימה. קראו אותה היטב לפני שתתחילו לפתור.',
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-block-palette',
          popover: {
            title: '🧰 מחסן הכלים',
            description: 'מכאן תוכלו לגרור יחידות, עשרות, מאות ואלפים לתוך בית המספרים.',
            side: 'top',
            align: 'center'
          }
        },
        {
          element: '#tour-place-value-board',
          popover: {
            title: '🏠 בית המספרים',
            description: 'כאן בונים את המספרים! גררו את הקוביות לטורים המתאימים: יחידות, עשרות, מאות ואלפים.',
            side: 'right',
            align: 'start'
          }
        },
        {
          element: '#tour-column-units',
          popover: {
            title: '🔄 קיבוץ ופריטה',
            description: 'כאשר מצטברות 10 קוביות בטור, תוכלו ללחוץ על כפתור "הקבץ (10)" שמופיע בראש הטור או לגרור אותן שמאלה!',
            side: 'left',
            align: 'center'
          }
        },
        {
          element: '#tour-action-buttons',
          popover: {
            title: '✅ סיימתם?',
            description: 'בסיום המשימה, לחצו על "התקדם" בסרגל העליון כדי לעבור לשלב הבא. בהצלחה!',
            side: 'top',
            align: 'end'
          }
        }
      ]
    });
  }, [completeWorkspaceTour]);

  const startTour = () => {
    if (driverObj.current) {
      driverObj.current.drive();
    }
  };

  // Auto-start on meeting 1 if not seen
  useEffect(() => {
    if (sessionNumber === 1) {
      let isAlreadySeen = hasSeenWorkspaceTour;
      try {
        if (localStorage.getItem('mathmaticore_has_seen_workspace_tour') === 'true') {
          isAlreadySeen = true;
        }
      } catch (_e) {}

      if (!isAlreadySeen) {
        // Small delay to ensure UI is mounted and blocks are rendered
        const timer = setTimeout(() => {
          startTour();
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [sessionNumber, hasSeenWorkspaceTour]);

  return { startTour };
}
