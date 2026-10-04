import { useEffect, useRef } from 'react';

/**
 * מסמך העיצוב §1.2 (ניווט מקלדת מלא): "כל מגירה/חלון מודאלי נסגר בלחיצה על
 * מקש Escape". בפועל זה מומש בשתי מגירות בלבד, וגם בהן בלי לכידת פוקוס ובלי
 * החזרתו — כך שמורה שמנווטת במקלדת המשיכה לטייל בין כפתורים שמאחורי החלון
 * הפתוח, ובסגירתו איבדה לגמרי את מקום הפוקוס.
 *
 * ההוק מרכז את שלוש ההתנהגויות שחלון חוסם חייב:
 *   1. Escape סוגר.
 *   2. Tab / Shift+Tab מסתובבים בתוך החלון בלבד (Focus Trap).
 *   3. בסגירה הפוקוס חוזר לאלמנט שממנו החלון נפתח.
 *
 * שימוש:
 *   const panelRef = useDismissableOverlay<HTMLDivElement>(isOpen, onClose);
 *   <div ref={panelRef} role="dialog" aria-modal="true" aria-label="...">
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The open overlays, oldest first. A window opened from inside another one
 * (the reset confirmation, from the learner drawer) sits on top of it, and
 * only the top one answers Escape and Tab. Each registered its own window
 * listener, so one Escape closed both, and the two focus traps pulled focus
 * back and forth between them.
 */
const openOverlays: object[] = [];

/**
 * The last few elements that held focus, newest last. The opener is often
 * gone by the time the overlay closes, or even before it opens: the radar's
 * learner window closes itself as "מעבר לניתוח מעמיק" opens the drawer, so
 * focus is already on <body> when the drawer mounts, and closing it dropped
 * the teacher at the top of the page. With the history, focus goes back to
 * the nearest element still on the page — there, the learner's radar tile.
 */
const FOCUS_HISTORY_SIZE = 8;
const focusHistory: HTMLElement[] = [];
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || el === document.body) return;
    const at = focusHistory.indexOf(el);
    if (at >= 0) focusHistory.splice(at, 1);
    focusHistory.push(el);
    if (focusHistory.length > FOCUS_HISTORY_SIZE) focusHistory.shift();
  });
}

export function useDismissableOverlay<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void,
  options: { autoFocus?: boolean; trapFocus?: boolean } = {}
) {
  const containerRef = useRef<T | null>(null);
  // Where focus may return on close, best first: the element focused when the
  // overlay opened, then the ones focused before it.
  const returnTargets = useRef<HTMLElement[]>([]);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // חלון חוסם לוכד פוקוס. פאנל צדדי לא-חוסם (כמו מגירת החניכה, שהלומד
  // אמור להמשיך לעבוד על הלוח לצידה) אינו לוכד ואינו חוטף פוקוס — לכידה
  // שם הייתה כולאת את הילד מחוץ ללוח שלו.
  const { autoFocus = true, trapFocus = true } = options;

  useEffect(() => {
    if (!isOpen) return;

    const active = document.activeElement as HTMLElement | null;
    returnTargets.current = [
      ...(active && active !== document.body ? [active] : []),
      ...focusHistory.filter((el) => el !== active).reverse(),
    ];
    const token = {};
    openOverlays.push(token);
    const isTop = () => openOverlays[openOverlays.length - 1] === token;

    const focusables = (): HTMLElement[] => {
      const root = containerRef.current;
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
    };

    // One frame, so the panel's own mount animation does not steal it back.
    let focusFrame: number | null = null;
    if (autoFocus) {
      focusFrame = requestAnimationFrame(() => {
        const first = focusables()[0] ?? containerRef.current;
        first?.focus?.();
      });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !trapFocus) return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // Wrap at both ends, and pull focus back in if it escaped the panel.
      if (e.shiftKey && (active === first || !containerRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !containerRef.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      const at = openOverlays.indexOf(token);
      if (at >= 0) openOverlays.splice(at, 1);
      window.removeEventListener('keydown', handleKeyDown, true);
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      // Restore focus only if this overlay actually holds it. A non-blocking
      // panel that never took focus must not yank it away from wherever the
      // learner is working when it closes.
      const focusIsInside = containerRef.current?.contains(document.activeElement);
      if (autoFocus || focusIsInside) {
        const root = containerRef.current;
        returnTargets.current.find((el) => el.isConnected && !root?.contains(el))?.focus?.();
      }
      returnTargets.current = [];
    };
  }, [isOpen, autoFocus, trapFocus]);

  return containerRef;
}
