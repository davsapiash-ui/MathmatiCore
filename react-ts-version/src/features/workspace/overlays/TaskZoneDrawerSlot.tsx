import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Space kept between the drawer and the work area under it. */
const GAP_PX = 8;

const INSTRUCTION = '[data-testid="task-instruction"]';
const STEPS = '[data-testid="guide-steps"]';

/**
 * Where the coaching card's drawer sits in the task-and-response zone (PRD
 * Module 7 §א rule 6, v7.15; Module 12 §ב): "נפתח כמגירה בתוך אגף המשימה
 * והמענה, במקום הצעדים, בלי לשנות את רוחב אגף הייצוגים ובלי להסתיר את שורת
 * התוצאה".
 *
 * The zone keeps its 45% (workspaceZones.ts) and the task card keeps its layout. The drawer is laid
 * over the guide block's steps — from the "מה עושים:" line above the steps
 * (data-testid "guide-steps") down — so the location row, the topic heading
 * and the goal line stay in view (owner, 11.10.2026: "במקום הצעדים"), and
 * never lower than the work area under it (the result row, or the first box
 * of the vertical sheet, whose blank top margin it may cover; the work area is
 * the element after the guide block): its height is capped there and its
 * content scrolls inside it. A guide block with no steps (a station-1 tool
 * step) is covered from its own top, as before. While it is open the covered
 * steps are inert (out of the tab order and the accessibility tree); closing
 * the drawer gives them back exactly as they were.
 *
 * Everything is read from the card from the outside (#tour-task-card and the
 * test id above), so the card itself is not touched. The work area does not
 * move while the drawer is open (owner, 9.10.2026): a drawer taller than its
 * place scrolls inside itself; the card never scrolls. `atTop`: only the folded
 * card's tab is shown, at the zone's top corner.
 */
export function TaskZoneDrawerSlot({ children, atTop = false, covering = false }: { children: ReactNode; atTop?: boolean; covering?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const slot = ref.current;
    if (atTop) {
      setPlace({ top: 8, maxHeight: 9999 });
      return;
    }
    const zone = slot?.closest<HTMLElement>('[data-testid="task-zone"]');
    if (!slot || !zone) return;
    let covered: HTMLElement[] = [];
    const release = () => {
      for (const el of covered) {
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
      }
      covered = [];
    };
    const measure = () => {
      const zr = zone.getBoundingClientRect();
      const card = zone.querySelector<HTMLElement>('#tour-task-card');
      const instruction = zone.querySelector<HTMLElement>(INSTRUCTION);
      const work = instruction?.nextElementSibling as HTMLElement | null | undefined;
      // The steps: their "מה עושים:" line, and the slot that holds the list
      // (and the done box) — or the list itself when it has no slot.
      const steps = instruction?.querySelector<HTMLElement>(STEPS) ?? null;
      const stepsHeading = steps ? instruction?.querySelector<HTMLElement>(':scope > h2') ?? null : null;
      const stepsBody = steps ? (steps.closest<HTMLElement>('[data-testid="guide-slot"]') ?? steps) : null;
      const coverFrom = stepsHeading ?? stepsBody ?? instruction;
      const toCover = steps ? [stepsHeading, stepsBody].filter((el): el is HTMLElement => Boolean(el)) : instruction ? [instruction] : [];
      const cardBottom = card ? card.getBoundingClientRect().bottom : zr.bottom;
      // A vertical sheet starts with blank paper above its memory circles: the
      // drawer may lie over that margin, down to the sheet's first box. Any
      // other work area is not entered at all.
      const sheetBox = work?.querySelector<HTMLElement>('[aria-label^="תרגיל במאונך"] input');
      const workTop = sheetBox ? sheetBox.getBoundingClientRect().top : work ? work.getBoundingClientRect().top : cardBottom;
      // A card with no guide block — the teacher's demonstration of station 1
      // (Module 15 §ג), a result row and nothing above it — gets the drawer
      // under its result row, which it must not hide (PRD 7 §א rule 6).
      const row = instruction ? null : zone.querySelector<HTMLElement>('[data-testid="result-row"]');
      const anchor = coverFrom ? coverFrom.getBoundingClientRect().top : row ? row.getBoundingClientRect().bottom + GAP_PX : zr.top;
      const top = Math.round(anchor - zr.top);
      const room = Math.round((row ? cardBottom : workTop) - GAP_PX - anchor);
      // The covered steps take no focus and are not announced (re-applied
      // when the card renders new ones, for the next task).
      const same = covered.length === toCover.length && covered.every((el, i) => el === toCover[i]);
      if (covering && toCover.length && !same) {
        release();
        for (const el of toCover) {
          el.setAttribute('inert', '');
          el.setAttribute('aria-hidden', 'true');
        }
        covered = toCover;
      } else if (!covering) {
        release();
      }
      // Owner, 9.10.2026 (RO1): the work area never moves while the drawer is
      // open. The drawer stays in the guide block's own place, capped above
      // the work area; content taller than that scrolls inside the drawer.
      const maxHeight = Math.max(0, room);
      setPlace((prev) => (prev && prev.top === top && prev.maxHeight === maxHeight ? prev : { top, maxHeight }));
    };
    measure();
    // The task column fades in with a small slide; measure again once it has settled.
    const settle = window.setTimeout(measure, 350);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(zone);
    // The card, its guide block and its work area are re-created from task to
    // task: watch the zone's subtree, and read them afresh on every change.
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(measure) : null;
    mo?.observe(zone, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(settle);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', measure);
      release();
    };
  }, [atTop, covering]);

  return (
    <div
      ref={ref}
      data-testid="task-zone-drawer-slot"
      className="absolute inset-x-2 z-20 pointer-events-none flex flex-col"
      style={{ top: place?.top ?? 0, maxHeight: place?.maxHeight, visibility: place === null ? 'hidden' : undefined }}
    >
      {children}
    </div>
  );
}
