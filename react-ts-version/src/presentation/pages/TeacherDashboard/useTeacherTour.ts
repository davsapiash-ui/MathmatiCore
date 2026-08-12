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

const setTourSeenInStorage = (seen: boolean = true) => {
  try {
    const g = globalThis as any;
    const s = g['sessionStorage'] || g['localStorage'];
    if (s) {
      s.setItem(TOUR_STORAGE_KEY, seen ? 'true' : 'false');
    }
  } catch {}
};

// Global callback for popover checkbox
if (typeof window !== 'undefined') {
  (window as any).__TOGGLE_TEACHER_TOUR_AUTOSHOW__ = (checkbox: HTMLInputElement) => {
    setTourSeenInStorage(checkbox.checked);
  };
}

const CHECKBOX_HTML = `
  <div style="margin-top:12px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; align-items:center; gap:8px; font-size:13px; color:#475569; font-weight:600; direction:rtl;">
    <input type="checkbox" id="chk-no-auto-teacher-tour" onchange="window.__TOGGLE_TEACHER_TOUR_AUTOSHOW__(this)" style="width:16px; height:16px; cursor:pointer;" />
    <label for="chk-no-auto-teacher-tour" style="cursor:pointer;">אל תציג הדרכה זו אוטומטית בשנית</label>
  </div>
`;

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
        const chk = document.getElementById('chk-no-auto-teacher-tour') as HTMLInputElement | null;
        if (chk) {
          setTourSeenInStorage(chk.checked);
        }
        if (driverObj.current) {
          driverObj.current.destroy();
        }
      },
      steps: [
        {
          element: '#tour-tab-clustering',
          popover: {
            title: 'מיפוי כיתתי',
            description: 'כאן תוכלי לראות בזמן אמת את פילוג הכיתה לפי מיומנויות, עם אפשרות לחלק למשימות מותאמות.' + CHECKBOX_HTML,
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-tab-alerts',
          popover: {
            title: 'רדאר סמוי',
            description: 'כאן תקבלי התראות בזמן אמת על תלמידים שמראים סימני תסכול או היסוס בזמן פתרון משימה.' + CHECKBOX_HTML,
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-tab-reports',
          popover: {
            title: 'דו"חות אישיים',
            description: 'במסך זה ניתן לצפות בפרופיל של כל תלמיד בנפרד ולצפות בשחזורים מדויקים של פעולותיו.' + CHECKBOX_HTML,
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-tab-chat',
          popover: {
            title: 'תקשורת אישית',
            description: 'מכאן ניתן לנהל צ׳אט עם התלמידים, לשלוח רמזים, ולראות הודעות נכנסות.' + CHECKBOX_HTML,
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-tab-approvals',
          popover: {
            title: 'אישור משימות AI',
            description: 'משימות שנבדקו על ידי מנוע ה-AI ימתינו לאישורך כאן לפני שהתלמיד יוכל להמשיך.' + CHECKBOX_HTML,
            side: 'left',
            align: 'start'
          }
        },
        {
          element: '#tour-tab-class_management',
          popover: {
            title: 'ניהול כיתה',
            description: 'צפייה בסטטוס ההתקדמות של התלמידים, נתוני אבחון ואפשרויות איפוס במידת הצורך.' + CHECKBOX_HTML,
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
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  return { startTour };
}
