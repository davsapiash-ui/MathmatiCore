import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD Module 18 §ב (l.745): "גריד קבוע של 3×4 המכיל בדיוק 12 משבצות אנונימיות
 * ממוספרות 1–12. אין לשנות את סדר המשבצות או להזיזן." Strict instructions:
 * "Implement Silent Radar as a static 3x4 grid".
 *
 * The grid was `grid-cols-3 sm:grid-cols-4`: four columns from 640px, three
 * below it — a 4×3 grid on a narrow screen, every tile from 4 on moved to
 * another row and column. It is four columns at every width now.
 */
const grid = (() => {
  const file = readFileSync(resolve(__dirname, '../HeatmapGrid.tsx'), 'utf-8');
  const at = file.indexOf('data-testid="radar-grid"');
  const tag = file.slice(file.lastIndexOf('<div', at), file.indexOf('>', at) + 1);
  return /className="([^"]*)"/.exec(tag)?.[1].split(/\s+/) ?? [];
})();

describe('PRD 18 §ב — the radar is a fixed 3×4 grid that never reflows', () => {
  it('four columns and three rows, at every width', () => {
    expect(grid).toContain('grid');
    expect(grid).toContain('grid-cols-4');
    expect(grid).toContain('grid-rows-3');
  });

  it('no breakpoint changes the columns or the rows', () => {
    expect(grid.filter((c) => /(^|:)grid-(cols|rows)-/.test(c))).toEqual(['grid-cols-4', 'grid-rows-3']);
    expect(grid.some((c) => /^[a-z0-9]+:grid-(cols|rows)-/.test(c))).toBe(false);
  });
});
