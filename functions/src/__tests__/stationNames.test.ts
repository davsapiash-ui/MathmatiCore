import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { STATION_NAMES_HE, meetingLabelHe, meetingShortLabelHe } from '../stationNames';

/**
 * Owner decision, 27.9.2026 (register, entry ט): the teacher sees the child's
 * station name next to every meeting — in the report titles too.
 *
 * The lobby's names live in react-ts-version/src/core/stationNames.ts. The
 * functions build cannot import them, so functions/src/stationNames.ts is a
 * copy. This test is what keeps it one source: it reads the frontend file and
 * fails the moment the two lists differ.
 */
const FRONTEND = resolve(__dirname, '../../../react-ts-version/src/core/stationNames.ts');
const read = (p: string) => readFileSync(p, 'utf-8').replace(/\r\n/g, '\n');

function frontendNames(): Record<number, string> {
  const text = read(FRONTEND);
  const start = text.indexOf('export const STATION_NAMES_HE');
  const block = text.slice(start, text.indexOf('};', start));
  const out: Record<number, string> = {};
  for (const m of block.matchAll(/^\s*(\d):\s*'([^']+)',?$/gm)) out[Number(m[1])] = m[2];
  return out;
}

describe('the station names in the reports are the lobby’s names', () => {
  it('the copy equals the frontend source, name for name', () => {
    const fe = frontendNames();
    expect(Object.keys(fe)).toHaveLength(8);
    expect({ ...STATION_NAMES_HE }).toEqual(fe);
  });

  it('the labels are built the same way as on the teacher’s screen', () => {
    const fe = read(FRONTEND);
    expect(fe).toContain('return name ? `מפגש ${n} · אצל התלמידים: ${name}` : `מפגש ${n}`;');
    expect(fe).toContain('return name ? `מפגש ${n} · ${name}` : `מפגש ${n}`;');
    expect(meetingLabelHe(7)).toBe('מפגש 7 · אצל התלמידים: בלשי המספרים');
    expect(meetingShortLabelHe(3)).toBe('מפגש 3 · בונים מספרים בכמה דרכים');
    expect(meetingLabelHe(9)).toBe('מפגש 9');
  });

  it('the learner report and the class report carry the station name in their title', () => {
    const learner = read(resolve(__dirname, '../pedagogicalReport.ts'));
    expect(learner).toContain('`MathematiCore - דוח פדגוגי · ${meetingLabelHe(resolvedSessionNumber)}`');
    expect(learner).toContain('`MathematiCore - דוח היכרות וריענון · ${meetingLabelHe(resolvedSessionNumber)}`');
    const klass = read(resolve(__dirname, '../classReport.ts'));
    expect(klass).toContain('title_he: `MathematiCore - דוח כיתה · ${meetingLabelHe(sessionNumber)}`,');
  });
});
