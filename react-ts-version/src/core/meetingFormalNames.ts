import { MEETING_NUMBERS, meetingLabelHe, type MeetingNumber } from '@/core/stationNames';

/**
 * The formal subject of each meeting, for staff screens only.
 *
 * Owner decision, 27.9.2026 (register, "החלטות בעל המוצר במקום שהאפיון
 * שותק", entry ט): the teacher sees the child's station name next to every
 * meeting, and keeps the professional information beside it — neither
 * replaces the other. The text is the heading each meeting carries in
 * document 03 §2 ("רצף שמונת המפגשים"), shortened.
 *
 * It lives apart from core/stationNames.ts on purpose: that file holds what
 * the child reads, and these words ("אבחון", "רפלקציה", "אינטגרציה") must
 * never reach a child's screen.
 */
export const MEETING_FORMAL_HE: Readonly<Record<MeetingNumber, string>> = {
  1: 'היכרות עם הכלים וריענון',
  2: 'אבחון שקט רב ממדי',
  3: 'ערך המקום וגמישות ייצוגית',
  4: 'אלגוריתם החיבור במאונך, הקבצה',
  5: 'אלגוריתם החיסור במאונך, פריטה',
  6: 'האפס כשומר מקום, המרה כפולה',
  7: 'פתרון בעיות חקר ואינטגרציה',
  8: 'מפגש חוקר, הערכה ורפלקציה מסכמת',
};

/** The formal subject of a meeting, or null outside 1–8. */
export function meetingFormalHe(n: number | null | undefined): string | null {
  return typeof n === 'number' && (MEETING_NUMBERS as readonly number[]).includes(n)
    ? MEETING_FORMAL_HE[n as MeetingNumber]
    : null;
}

/**
 * Everything the teacher knows about a meeting in one line, for a tooltip:
 * "מפגש 7 · אצל התלמידים: בלשי המספרים — פתרון בעיות חקר ואינטגרציה".
 */
export function meetingFullLabelHe(n: number | null | undefined): string {
  const formal = meetingFormalHe(n);
  return formal ? `${meetingLabelHe(n)} — ${formal}` : meetingLabelHe(n);
}
