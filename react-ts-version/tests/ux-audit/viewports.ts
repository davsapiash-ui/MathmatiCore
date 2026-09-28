/**
 * The screens the audit measures on, as the child actually sees them.
 *
 * Every height is the browser's INNER height, not the monitor's: a maximised
 * Chrome on Windows 11 loses ~48px to the taskbar and ~87px to its own tab
 * strip and toolbar (another ~34px when the bookmarks bar is shown). "1366×768"
 * therefore leaves the page 633 pixels, and 599 with a bookmarks bar. A layout
 * that only fits 768 scrolls on every real laptop.
 *
 * Tier A is the gate: the owner's rule (28.9.2026) — zero page scroll and zero
 * clipped content throughout the student's work — must hold on all of them.
 * Tier B is measured and reported, but does not fail the run.
 */
export interface Viewport {
  id: string;
  width: number;
  height: number;
  tier: 'A' | 'B';
  note: string;
}

export const VIEWPORTS: Viewport[] = [
  { id: 'laptop-1366', width: 1366, height: 633, tier: 'A', note: '1366×768 laptop, maximised Chrome, Windows taskbar' },
  { id: 'laptop-1366-bookmarks', width: 1366, height: 599, tier: 'A', note: '1366×768 laptop with the bookmarks bar shown' },
  { id: 'laptop-1280', width: 1280, height: 585, tier: 'A', note: '1280×720 laptop / a projector mirrored at 720p' },
  { id: 'laptop-1536', width: 1536, height: 729, tier: 'A', note: '1920×1080 laptop at Windows 125% scaling' },
  { id: 'desktop-1920', width: 1920, height: 945, tier: 'A', note: '1920×1080 desktop at 100%' },
  { id: 'tablet-1024', width: 1024, height: 694, tier: 'A', note: 'iPad landscape (Safari toolbar)' },
  { id: 'laptop-1366-zoom125', width: 1093, height: 506, tier: 'B', note: '1366×768 laptop at 125% zoom or scaling' },
  { id: 'tablet-768-portrait', width: 768, height: 954, tier: 'B', note: 'iPad portrait' },
  { id: 'phone-390', width: 390, height: 740, tier: 'B', note: 'phone (out of the pilot; report only)' },
];

/** `UX_AUDIT_VIEWPORTS=laptop-1366,tablet-1024` narrows a run; the default is the full matrix. */
export function selectedViewports(): Viewport[] {
  const raw = process.env.UX_AUDIT_VIEWPORTS;
  if (!raw) return VIEWPORTS;
  const wanted = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const picked = VIEWPORTS.filter((v) => wanted.includes(v.id));
  if (picked.length === 0) throw new Error(`UX_AUDIT_VIEWPORTS matched nothing: ${raw}`);
  return picked;
}
