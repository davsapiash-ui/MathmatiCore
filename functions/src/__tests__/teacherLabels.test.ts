import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ROUTE_NAME_HE } from '../teacherLabels';

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
