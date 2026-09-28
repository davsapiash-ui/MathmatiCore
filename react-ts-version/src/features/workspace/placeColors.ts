import type { Place } from '@/core/placeValue';

/**
 * The one colour code of the place values: the columns of בית המספרים and the
 * answer boxes that carry place-value colours use these values and no others
 * (מסמך 03 §3.2: "שורת התוצאה התואמת בצבעיה לעמודות הערך העשרוני"; PRD Module 7
 * §א: "קוד הצבע של אזור התלמיד אחיד"). Vanilla workspace.css 346–375.
 */
export const PLACE_COLORS: Record<Place, { header: string; border: string; tint: string; headerBg: string }> = {
  units: { header: 'var(--block-unit-dark)', border: 'var(--block-unit)', tint: 'rgba(245,158,11,0.08)', headerBg: 'rgba(245,158,11,0.14)' },
  tens: { header: 'var(--block-ten-dark)', border: 'var(--block-ten)', tint: 'rgba(16,185,129,0.08)', headerBg: 'rgba(16,185,129,0.14)' },
  hundreds: { header: 'var(--block-hundred-dark)', border: 'var(--block-hundred)', tint: 'rgba(59,130,246,0.08)', headerBg: 'rgba(59,130,246,0.14)' },
  thousands: { header: 'var(--block-thousand-dark)', border: 'var(--block-thousand)', tint: 'rgba(239,68,68,0.08)', headerBg: 'rgba(239,68,68,0.14)' },
};

/**
 * Meeting 2 (owner, 27.9.2026): a learner without the enhanced cognitive support
 * profile sees every answer box in this one neutral colour, with no place-value
 * headings and no place-value colours. The number boxes of the correction round
 * use it for every learner — they hold a whole number, not a place.
 */
export const NEUTRAL_BOX_BORDER = 'rgb(148, 163, 184)'; // slate-400
