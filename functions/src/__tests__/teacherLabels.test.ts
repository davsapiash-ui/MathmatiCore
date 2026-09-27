import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ERROR_CATEGORY_HE, ROUTE_NAME_HE, errorCategoryHe } from '../teacherLabels';

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
    expect(html).toContain('const categories = errorCategoryList(a.error_categories);');
    expect(html).not.toContain('keyValueList(a.error_categories)');
    const pdf = stripComments(read(resolve(__dirname, '../classReport.ts')));
    expect(pdf).toContain('map(([k, v]) => `${errorCategoryHe(k) ?? k}: ${v}`)');
  });
});
