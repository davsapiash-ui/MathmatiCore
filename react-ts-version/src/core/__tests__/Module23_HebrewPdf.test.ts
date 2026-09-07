import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * 7.9.2026, product owner: "כל הדו"חות יוצאים בליל של מילים חסר משמעות…
 * נראה כאילו זה נכתב משמאל לימין". Root cause: pdfkit's font engine
 * (fontkit 2) reverses right-to-left runs by itself, and every renderer
 * reversed the Hebrew a second time by hand. The fix lives in
 * functions/src/hebrewPdf.ts and was verified by rendering the PDFs to
 * images. Pinned from source: the functions package compiles under its own
 * tsconfig.
 */
const hebrew = readFileSync(resolve(__dirname, '../../../../functions/src/hebrewPdf.ts'), 'utf-8');
const learner = readFileSync(resolve(__dirname, '../../../../functions/src/pedagogicalReport.ts'), 'utf-8');
const klass = readFileSync(resolve(__dirname, '../../../../functions/src/classReport.ts'), 'utf-8');

describe('Module 23 — Hebrew in the PDF reports', () => {
  it('no renderer hands bidi-reordered text straight to doc.text any more', () => {
    for (const src of [learner, klass]) {
      expect(src).not.toMatch(/getReorderedString|bidi-js|wrapAndBidi|shapeRtl/);
      expect(src).not.toMatch(/\.text\(shapeRtl|\.text\(wrapAndBidi/);
      expect(src).toContain('import { rtlText } from "./hebrewPdf";');
    }
  });

  it('one run per line, so fontkit reverses a whole line at most once', () => {
    expect(hebrew).toContain('const SINGLE_RUN = { features: [] as string[] };');
    expect(hebrew).toMatch(/doc\.text\(run\.text, cursor, y, \{ lineBreak: false, width: run\.width \+ 1, align: "left", \.\.\.SINGLE_RUN \}\)/);
  });

  it('a run is reversed before hand-over only when fontkit will reverse it back (first strong character Hebrew)', () => {
    expect(hebrew).toMatch(/export function toPdfkitRun\(run: string\): string \{\s*return fontkitDirection\(run\) === "rtl" \? Array\.from\(run\)\.reverse\(\)\.join\(""\) : run;/);
    expect(hebrew).toMatch(/export function splitVisualRuns\(visual: string\): string\[\]/);
  });

  it('lines are wrapped by measured width and drawn with lineBreak:false, never re-wrapped by pdfkit', () => {
    expect(hebrew).toMatch(/doc\.widthOfString\(candidate, SINGLE_RUN\) > width/);
    expect(hebrew).not.toMatch(/\.length > maxChars/);
  });

  it('keeps the PRD fallback sentence and the report sections', () => {
    expect(learner).toContain('rtlText(doc, report.ai_fallback_text || EXACT_AI_FALLBACK_TEXT, { lineGap: 3 });');
    expect(learner).toContain('rtlText(doc, "1. המלצת ניתוב פדגוגי");');
    expect(learner).toContain('rtlText(doc, "2. סיפור התרגילים הכרונולוגי (Exercise Narratives)");');
    expect(learner).toContain('rtlText(doc, "3. תובנות קוגניטיביות פדגוגיות");');
    expect(klass).toContain('line(EXACT_AI_FALLBACK_TEXT, 10, "#78350f");');
  });
});
