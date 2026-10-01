import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { COLUMN_NAMES_HE, ERROR_CATEGORY_HE, ROUTE_NAME_HE, TRIGGER_REASON_HE, errorCategoryCountsHe, errorCategoryHe, triggerCountsHe, triggerReasonHe } from '../teacherLabels';

/**
 * Owner decision, 27.9.2026: one wording for the two routes, on the teacher's
 * screens and in the reports. The screens read
 * react-ts-version/src/core/routeLabels.ts; the reports read this copy. The
 * test keeps them equal, and keeps the old names out of the report texts.
 */
const read = (p: string) => readFileSync(p, 'utf-8').replace(/\r\n/g, '\n');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the route names in the reports are the screens’ names', () => {
  it('the copy equals the frontend source', () => {
    const fe = read(resolve(__dirname, '../../../react-ts-version/src/core/routeLabels.ts'));
    const block = fe.slice(fe.indexOf('export const ROUTE_NAME_HE = {'), fe.indexOf('} as const;', fe.indexOf('export const ROUTE_NAME_HE = {')));
    const names = Object.fromEntries([...block.matchAll(/(green_path|remediation_path): '([^']+)'/g)].map((m) => [m[1], m[2]]));
    expect(names).toEqual({ ...ROUTE_NAME_HE });
    expect(ROUTE_NAME_HE).toEqual({ green_path: 'המסלול הירוק', remediation_path: 'מסלול צמצום פערי קדם' });
  });

  it('the reports use them and no longer say "צהוב", "מואץ", "העמקה (ירוק)" or "מסלול ביסוס"', () => {
    for (const f of ['pedagogicalReport.ts', 'classReport.ts', 'reportHtml.ts', 'exportDriveReport.ts']) {
      const text = stripComments(read(resolve(__dirname, '..', f)));
      expect(text, f).not.toMatch(/צהוב|מואץ|העמקה \(ירוק\)|מסלול ירוק|מסלול ביסוס|\(PII\)|שער מעבר|מאבק/);
    }
    expect(read(resolve(__dirname, '../reportHtml.ts'))).toContain('? ROUTE_NAME_HE.green_path');
  });
});

describe('the error categories in the reports are the screens’ names', () => {
  it('the copy equals the frontend ERROR_CATEGORY_HE', () => {
    const fe = read(resolve(__dirname, '../../../react-ts-version/src/core/routeLabels.ts'));
    const start = fe.indexOf('export const ERROR_CATEGORY_HE = {');
    expect(start).toBeGreaterThan(-1);
    const block = fe.slice(start, fe.indexOf('} as const;', start));
    const names = Object.fromEntries([...block.matchAll(/(calculation|procedural|conceptual): '([^']+)'/g)].map((m) => [m[1], m[2]]));
    expect(names).toEqual({ ...ERROR_CATEGORY_HE });
    expect(ERROR_CATEGORY_HE).toEqual({ calculation: 'טעות חישוב', procedural: 'טעות בשלבי הפתרון', conceptual: 'טעות בהבנת ערך המקום' });
  });

  it('a stored key reads as its name; a key outside the three is left as stored', () => {
    expect(errorCategoryHe('calculation')).toBe('טעות חישוב');
    expect(errorCategoryHe('procedural')).toBe('טעות בשלבי הפתרון');
    expect(errorCategoryHe('conceptual')).toBe('טעות בהבנת ערך המקום');
    expect(errorCategoryHe('toString')).toBeNull();
    expect(errorCategoryHe('other')).toBeNull();
  });

  it('the class report, in both its forms, prints the names and not the raw keys', () => {
    const html = stripComments(read(resolve(__dirname, '../reportHtml.ts')));
    expect(html).toContain('const categories = esc(errorCategoryCountsHe(a.error_categories));');
    expect(html).not.toContain('keyValueList(');
    const pdf = stripComments(read(resolve(__dirname, '../classReport.ts')));
    expect(pdf).toContain('const categories = errorCategoryCountsHe(a.error_categories);');
    // A key outside the three is not printed in English either.
    expect(errorCategoryCountsHe({ conceptual: 12, other_kind: 1 })).toBe('טעות בהבנת ערך המקום: 12, סיווג אחר: 1');
  });
});

describe('why a card opened: the timeline’s words in the reports (acceptance run, 2.10.2026)', () => {
  it('the copy equals the frontend TRIGGER_REASON_HE, which the learner timeline reads', () => {
    const fe = read(resolve(__dirname, '../../../react-ts-version/src/core/routeLabels.ts'));
    const start = fe.indexOf('export const TRIGGER_REASON_HE = {');
    expect(start).toBeGreaterThan(-1);
    const block = fe.slice(start, fe.indexOf('} as const;', start));
    const names = Object.fromEntries([...block.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
    expect(names).toEqual({ ...TRIGGER_REASON_HE });
    const timeline = read(resolve(__dirname, '../../../react-ts-version/src/infrastructure/services/LearnerJourneyService.ts'));
    expect(timeline).toContain('const reason: Record<string, string> = TRIGGER_REASON_HE;');
  });

  it('all five stored reasons have a name; the counts read in Hebrew', () => {
    for (const k of ['hesitation_45s', 'consecutive_errors_4', 'conversion_not_performed', 'repeated_errors', 'consecutive_undos_3']) {
      expect(triggerReasonHe(k), k).toMatch(/^[֐-׿0-9 ]+$/);
    }
    expect(triggerReasonHe('toString')).toBeNull();
    expect(triggerCountsHe({ consecutive_errors_4: 1, conversion_not_performed: 3, hesitation_45s: 24 }))
      .toBe('ארבע מחיקות או הקלדות שגויות רצופות: 1, לא בוצעה המרה נדרשת: 3, היסוס 45 שניות: 24');
    expect(triggerCountsHe({ some_new_reason: 2 })).toBe('סיבה אחרת: 2');
  });

  it('the columns are named as on every screen: יחידות', () => {
    expect([...COLUMN_NAMES_HE]).toEqual(['יחידות', 'עשרות', 'מאות', 'אלפים']);
    const timeline = read(resolve(__dirname, '../../../react-ts-version/src/infrastructure/services/LearnerJourneyService.ts'));
    expect(timeline).toContain("const COLUMN_NAMES_HE = ['יחידות', 'עשרות', 'מאות', 'אלפים'];");
    // reportAnalysis.ts names the word only to forbid and replace it.
    for (const f of ['pedagogicalReport.ts', 'classReport.ts', 'reportHtml.ts']) {
      expect(stripComments(read(resolve(__dirname, '..', f))), f).not.toContain('אחדות');
    }
  });
});
