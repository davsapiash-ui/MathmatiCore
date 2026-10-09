import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Space kept between the drawer and the work area under it. */
const GAP_PX = 8;

/**
 * Where the coaching card's drawer sits in the task-and-response zone (PRD
 * Module 7 §א rule 6, v7.15; Module 12 §ב): "נפתח כמגירה בתוך אגף המשימה
 * והמענה, במקום הצעדים, בלי לשנות את רוחב אגף הייצוגים ובלי להסתיר את שורת
 * התוצאה".
 *
 * The zone keeps its 40% and the task card keeps its layout: the drawer is laid
 * over the card's instruction (the steps), from the instruction's top, and ends
 * above the work area — the result row or the vertical sheet, the element
 * after the instruction. When it is taller than the instruction it rises over
 * the heading first; only a drawer taller than everything above the work area
 * reaches into it. Closing it uncovers the instruction exactly as it was.
 *
 * The positions are read from the card from the outside (data-testid
 * "task-instruction", #tour-task-card), so the card itself is not touched.
 */
export function TaskZoneDrawerSlot({ children, atTop = false }: { children: ReactNode; atTop?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const slot = ref.current;
    if (atTop) {
      setTop(8);
      return;
    }
    const zone = slot?.closest<HTMLElement>('[data-testid="task-zone"]');
    if (!slot || !zone) return;
    const place = () => {
      const zr = zone.getBoundingClientRect();
      const card = zone.querySelector<HTMLElement>('#tour-task-card');
      const instruction = zone.querySelector<HTMLElement>('[data-testid="task-instruction"]');
      const work = instruction?.nextElementSibling as HTMLElement | null | undefined;
      const cardBottom = card ? card.getBoundingClientRect().bottom : zr.bottom;
      const workTop = work ? work.getBoundingClientRect().top : cardBottom;
      const anchor = instruction ? instruction.getBoundingClientRect().top : zr.top;
      const drawer = slot.firstElementChild as HTMLElement | null;
      const height = drawer ? drawer.offsetHeight : 0;
      const wanted = Math.min(anchor, workTop - GAP_PX - height);
      const next = Math.round(Math.max(zr.top, wanted) - zr.top);
      setTop((prev) => (prev === next ? prev : next));
    };
    place();
    // The task column fades in with a small slide; place again once it has settled.
    const settle = window.setTimeout(place, 350);
    const observed = [zone, slot, zone.querySelector('#tour-task-card')].filter(Boolean) as Element[];
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    observed.forEach((el) => ro?.observe(el));
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(place) : null;
    const column = zone.querySelector('#tour-task-card');
    if (column) mo?.observe(column, { childList: true, subtree: true });
    window.addEventListener('resize', place);
    return () => {
      window.clearTimeout(settle);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [atTop]);

  return (
    <div
      ref={ref}
      data-testid="task-zone-drawer-slot"
      className="absolute inset-x-2 z-20 pointer-events-none"
      style={{ top: top ?? 0, visibility: top === null ? 'hidden' : undefined }}
    >
      {children}
    </div>
  );
}
