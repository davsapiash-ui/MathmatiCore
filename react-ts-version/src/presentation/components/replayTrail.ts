/**
 * The mouse trail in the work-screen replay (rrweb's mouseTail). The owner,
 * 6.10.2026: the red lines that show the mouse's way should be the teacher's
 * to control — softer, other styles, or off with only the cursor shown.
 * rrweb draws the trail on a canvas over the recording; each option below is
 * one of its configurations, and `false` hides the canvas and leaves the
 * cursor alone.
 */
export type TrailStyle = 'off' | 'soft' | 'standard' | 'long';

export const TRAIL_STYLES: { id: TrailStyle; labelHe: string; titleHe: string }[] = [
  { id: 'off', labelHe: 'סמן בלבד', titleHe: 'בלי שובל: רואים רק את סמן העכבר' },
  { id: 'soft', labelHe: 'עדין', titleHe: 'שובל דק ושקוף שנעלם מהר' },
  { id: 'standard', labelHe: 'רגיל', titleHe: 'שובל אדום, כמו עד עכשיו' },
  { id: 'long', labelHe: 'מסלול ארוך', titleHe: 'שובל שנשאר כשנייה וחצי, כדי לראות את כל תנועת היד' },
];

export type MouseTailConfig = false | { duration: number; lineCap: string; lineWidth: number; strokeStyle: string };

export function mouseTailFor(style: TrailStyle): MouseTailConfig {
  switch (style) {
    case 'off':
      return false;
    case 'soft':
      return { duration: 350, lineCap: 'round', lineWidth: 2, strokeStyle: 'rgba(99, 102, 241, 0.45)' };
    case 'long':
      return { duration: 1500, lineCap: 'round', lineWidth: 3, strokeStyle: 'rgba(234, 88, 12, 0.6)' };
    case 'standard':
    default:
      return { duration: 500, lineCap: 'round', lineWidth: 3, strokeStyle: 'red' };
  }
}

const STORAGE_KEY = 'replay_trail_style';

/** The teacher's last choice in this browser; "רגיל" when none or storage is unavailable. */
export function loadTrailStyle(): TrailStyle {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && TRAIL_STYLES.some((t) => t.id === v)) return v as TrailStyle;
  } catch {
    /* storage unavailable */
  }
  return 'standard';
}

export function saveTrailStyle(style: TrailStyle): void {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    /* storage unavailable */
  }
}
