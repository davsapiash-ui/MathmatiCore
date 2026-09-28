/**
 * In-page measurement. `measurePage` is serialised into the browser by
 * Playwright, so it must be self-contained: no imports, no closures.
 *
 * It answers one question per element the child needs — text, buttons,
 * inputs, blocks, pictures: is all of it on the screen, whole, reachable
 * without scrolling, and not covered by something else?
 *
 * Finding types (severity):
 *  page-scroll-y / page-scroll-x  (high)   the document itself scrolls
 *  needs-scroll                   (high)   the element is only reachable by scrolling a container
 *  clipped                        (high)   the element is cut off by an overflow:hidden container
 *  offscreen                      (high)   the element lies outside the viewport
 *  occluded                       (medium) an interactive element is covered at its centre
 *  small-target                   (low)    interactive element smaller than 44×44 (DESIGN_SYSTEM_RULES)
 *  tiny-text                      (low)    visible text under 12px
 *  no-rtl                         (medium) the screen is not marked right-to-left
 */
export interface Finding {
  type:
    | 'page-scroll-y'
    | 'page-scroll-x'
    | 'needs-scroll'
    | 'clipped'
    | 'offscreen'
    | 'occluded'
    | 'small-target'
    | 'tiny-text'
    | 'no-rtl'
    /** Added by the harness, not by the page: an unexpected console error or uncaught exception. */
    | 'console-error';
  severity: 'high' | 'medium' | 'low';
  /** Pixels of overflow / the offending size. */
  px?: number;
  /** The element (or the container) in a short, readable form. */
  selector: string;
  /** Up to 60 characters of the element's text, so a human knows what is cut. */
  text?: string;
  /** For clipped / needs-scroll: the container doing the clipping. */
  container?: string;
  /** How many elements share this finding (they are collapsed to one line). */
  count?: number;
}

export interface Measurement {
  viewport: { width: number; height: number };
  fonts: { heebo: boolean; rubik: boolean; assistant: boolean };
  findings: Finding[];
}

export function measurePage(): Measurement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out: Finding[] = [];

  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const testId = el.getAttribute('data-testid');
    const label = el.getAttribute('aria-label');
    const role = el.getAttribute('role');
    const classes = Array.from(el.classList)
      .filter((c) => !/^(motion|framer)/.test(c))
      .slice(0, 3)
      .join('.');
    let s = tag + id;
    if (testId) s += `[data-testid=${testId}]`;
    else if (label) s += `[aria-label=${label.slice(0, 30)}]`;
    else if (role) s += `[role=${role}]`;
    if (classes) s += `.${classes}`;
    return s;
  };

  const ownText = (el: Element): string => {
    let t = '';
    el.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) t += n.textContent || '';
    });
    return t.replace(/\s+/g, ' ').trim();
  };

  const isVisible = (el: Element): boolean => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const decorative = (el: Element): boolean =>
    el.closest('[aria-hidden="true"], .sr-only, script, style, noscript') !== null;

  const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])';

  // ── document scroll ──
  const de = document.documentElement;
  const body = document.body;
  const sy = Math.max(de.scrollHeight, body.scrollHeight) - vh;
  const sx = Math.max(de.scrollWidth, body.scrollWidth) - vw;
  if (sy > 1) out.push({ type: 'page-scroll-y', severity: 'high', px: Math.round(sy), selector: 'html' });
  if (sx > 1) out.push({ type: 'page-scroll-x', severity: 'high', px: Math.round(sx), selector: 'html' });

  // ── RTL ──
  if (de.getAttribute('dir') !== 'rtl' && getComputedStyle(body).direction !== 'rtl' && !document.querySelector('[dir="rtl"]')) {
    out.push({ type: 'no-rtl', severity: 'medium', selector: 'html' });
  }

  // ── the elements the child needs ──
  const all = Array.from(document.querySelectorAll('body *'));
  const meaningful: Element[] = [];
  for (const el of all) {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;
    if (decorative(el) || !isVisible(el)) continue;
    const interactive = el.matches(INTERACTIVE);
    const media = el.matches('img, svg, canvas, video');
    const labelled = el.hasAttribute('aria-label');
    const text = ownText(el);
    if (interactive || media || labelled || text.length > 0) meaningful.push(el);
  }

  type Key = string;
  const grouped = new Map<Key, Finding>();
  const add = (f: Finding, key: Key) => {
    const prev = grouped.get(key);
    if (prev) {
      prev.count = (prev.count || 1) + 1;
      if ((f.px || 0) > (prev.px || 0)) prev.px = f.px;
    } else {
      grouped.set(key, { ...f, count: 1 });
    }
  };

  for (const el of meaningful) {
    const r = el.getBoundingClientRect();
    const text = ownText(el).slice(0, 60) || el.getAttribute('aria-label')?.slice(0, 60) || undefined;
    const me = describe(el);

    // Against the viewport
    const offB = r.bottom - vh;
    const offR = r.right - vw;
    const offL = -r.left;
    const offT = -r.top;
    const off = Math.max(offB, offR, offL, offT);
    // Fully or partly outside the screen. Elements that are ENTIRELY outside
    // (e.g. r.top >= vh) count too — they are simply not there for the child.
    if (off > 2) {
      // Is it inside a scrollable container? Then it is "needs-scroll" below, not offscreen.
      let insideScroller = false;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) {
          const ar = a.getBoundingClientRect();
          if (ar.bottom <= vh + 2 && ar.right <= vw + 2 && ar.left >= -2 && ar.top >= -2) insideScroller = true;
          break;
        }
      }
      if (!insideScroller) {
        add({ type: 'offscreen', severity: 'high', px: Math.round(off), selector: me, text }, `offscreen|${me}`);
      }
    }

    // Against every clipping ancestor: nearest one that cuts it wins.
    for (let a = el.parentElement; a && a !== body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const oy = cs.overflowY;
      const ox = cs.overflowX;
      const clipsY = oy !== 'visible';
      const clipsX = ox !== 'visible';
      if (!clipsY && !clipsX) continue;
      const ar = a.getBoundingClientRect();
      const top = ar.top + a.clientTop;
      const left = ar.left + a.clientLeft;
      const bottom = top + a.clientHeight;
      const right = left + a.clientWidth;
      let over = 0;
      let scrollable = false;
      if (clipsY) {
        over = Math.max(over, r.bottom - bottom, top - r.top);
        if (/(auto|scroll)/.test(oy) && r.bottom - bottom > 2) scrollable = true;
      }
      if (clipsX) {
        over = Math.max(over, r.right - right, left - r.left);
        if (/(auto|scroll)/.test(ox) && (r.right - right > 2 || left - r.left > 2)) scrollable = true;
      }
      if (over > 2) {
        const container = describe(a);
        add(
          {
            type: scrollable ? 'needs-scroll' : 'clipped',
            severity: 'high',
            px: Math.round(over),
            selector: me,
            text,
            container,
          },
          `${scrollable ? 'needs-scroll' : 'clipped'}|${container}`
        );
        break;
      }
      // No early stop at a scroll container: a card that scrolls inside itself
      // can still be cut by the overflow:hidden main around it (meeting 8's
      // centred sheet), and the element has to be judged against that too.
    }

    // Covered by something else? (a toolbar, a panel, another card — not a
    // deliberate full-screen overlay such as the teacher's pause screen)
    const cxRaw = r.left + r.width / 2;
    const cyRaw = r.top + r.height / 2;
    if (cxRaw >= 0 && cxRaw <= vw && cyRaw >= 0 && cyRaw <= vh) {
      const hit = document.elementFromPoint(cxRaw, cyRaw);
      if (hit && !el.contains(hit) && !hit.contains(el)) {
        let overlay = false;
        for (let h: Element | null = hit, i = 0; h && i < 8; h = h.parentElement, i++) {
          const hcs = getComputedStyle(h);
          const hr = h.getBoundingClientRect();
          if (hcs.position === 'fixed' && hr.width >= vw * 0.9 && hr.height >= vh * 0.9) {
            overlay = true;
            break;
          }
        }
        if (!overlay) add({ type: 'occluded', severity: 'medium', selector: me, text, container: describe(hit) }, `occluded|${describe(hit)}`);
      }
    }

    // Interactive: too small?
    if (el.matches(INTERACTIVE)) {
      const small = Math.min(r.width, r.height);
      if (small < 44 && !el.matches('input[type="text"], input[inputmode="numeric"]')) {
        add({ type: 'small-target', severity: 'low', px: Math.round(small), selector: me, text }, `small|${me}`);
      }
    }

    // Tiny text
    if (ownText(el).length > 0) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12) add({ type: 'tiny-text', severity: 'low', px: Math.round(fs * 10) / 10, selector: me, text }, `tiny|${me}`);
    }
  }

  out.push(...grouped.values());

  const check = (f: string) => {
    try {
      return document.fonts.check(`16px "${f}"`);
    } catch {
      return false;
    }
  };

  return {
    viewport: { width: vw, height: vh },
    fonts: { heebo: check('Heebo'), rubik: check('Rubik'), assistant: check('Assistant') },
    findings: out,
  };
}
