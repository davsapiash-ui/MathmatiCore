import type { Place } from './placeValue';

/**
 * The trade in words, beside the grouping / decomposition animation (owner,
 * 7.10.2026): "עשרת אחת = 10 יחידות" when a ten breaks apart, "10 יחידות =
 * עשרת אחת" when ten units group. It joins what the child sees to what is
 * said and written — the rule of the exchange, never the exercise's answer, so
 * it says nothing the hidden column digits of stations 3–7 hold back
 * (register 27). In the order the move happens: what was there, then what it
 * became.
 */
const ONE_HE: Partial<Record<Place, string>> = {
  tens: 'עשרת אחת',
  hundreds: 'מאה אחת',
  thousands: 'אלף אחד',
};
const TEN_HE: Partial<Record<Place, string>> = {
  units: '10 יחידות',
  tens: '10 עשרות',
  hundreds: '10 מאות',
};

export function regroupCaptionHe(kind: 'group' | 'split', from: Place, to: Place): string | null {
  const high = kind === 'group' ? to : from;
  const low = kind === 'group' ? from : to;
  const one = ONE_HE[high];
  const ten = TEN_HE[low];
  if (!one || !ten) return null;
  return kind === 'group' ? `${ten} = ${one}` : `${one} = ${ten}`;
}
