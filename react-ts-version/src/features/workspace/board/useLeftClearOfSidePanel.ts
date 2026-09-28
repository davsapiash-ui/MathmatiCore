import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/** The gap kept between the coaching card and anything placed beside it. */
const GAP_PX = 16;
/** Where the addition grid sits when no coaching card is open (tailwind left-6). */
export const DEFAULT_LEFT_PX = 24;

/**
 * The left offset for an aid pinned to the bottom-left corner (the addition
 * grid and its re-open tab) so that it never covers the coaching card.
 *
 * מסמך 03 §3.1 and PRD Module 12: the card is a side panel "השומר על נראות
 * מלאה של התרגיל", with no popups over it. The grid sat at the same corner, so
 * when both were open it covered the card's answers and the learner had to
 * close the grid before answering (report row 1.28). While the card is open,
 * the aid moves to just right of it; the card keeps its place.
 */
export function useLeftClearOfSidePanel(): number {
  const cardOpen = useWorkspaceStore((s) => s.helpState === 'socratic');
  const [left, setLeft] = useState(DEFAULT_LEFT_PX);

  useEffect(() => {
    if (!cardOpen || typeof document === 'undefined') {
      setLeft(DEFAULT_LEFT_PX);
      return;
    }
    const measure = () => {
      const panel = document.querySelector('[data-testid="socratic-side-panel"]');
      const right = panel ? panel.getBoundingClientRect().right : 0;
      setLeft(right > 0 ? Math.round(right + GAP_PX) : DEFAULT_LEFT_PX);
    };
    measure();
    // The panel slides in; measure again once it has arrived, and on resize.
    const t = setTimeout(measure, 400);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    const panel = document.querySelector('[data-testid="socratic-side-panel"]');
    if (ro && panel) ro.observe(panel);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [cardOpen]);

  return left;
}
