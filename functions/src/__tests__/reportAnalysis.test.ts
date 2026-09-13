import { describe, it, expect } from 'vitest';
import { resolveRecommendationTier, parseAnalysisResponse, AI_ANALYSIS_TIMEOUT_MS } from '../reportAnalysis';

/**
 * שכבת הניתוח של הדוח (מודול 23 §ד, מודול 24 §ב).
 *
 * שני חוזים: חלוקת הלומדים לשלוש קבוצות עבודה לפי גבולות מדויקים, ותשובה
 * פגומה מהמודל שאסור לה להפוך לממצא בדוח שהמורה פועלת לפיו.
 */
describe('שלוש קבוצות העבודה — הגבולות מדויקים', () => {
  it('75 בדיוק נופל לקבוצה האמצעית, לא לעליונה', () => {
    // האפיון: "ציון > 75%" — לא כולל 75.
    expect(resolveRecommendationTier(75)).toBe('between_50_75');
    expect(resolveRecommendationTier(75.1)).toBe('above_75');
    expect(resolveRecommendationTier(76)).toBe('above_75');
  });

  it('50 בדיוק נופל לקבוצה האמצעית, לא לתחתונה', () => {
    expect(resolveRecommendationTier(49.9)).toBe('below_50');
    expect(resolveRecommendationTier(50)).toBe('between_50_75');
  });

  it('הקצוות', () => {
    expect(resolveRecommendationTier(0)).toBe('below_50');
    expect(resolveRecommendationTier(100)).toBe('above_75');
  });
});

describe('תשובה פגומה מהמודל אינה הופכת לממצא', () => {
  it('טקסט שאינו JSON נדחה', () => {
    expect(parseAnalysisResponse('לא JSON בכלל')).toBeNull();
    expect(parseAnalysisResponse('')).toBeNull();
  });

  it('JSON תקין בלי שני המערכים הנדרשים נדחה', () => {
    expect(parseAnalysisResponse('{"something_else": 1}')).toBeNull();
    expect(parseAnalysisResponse('{"knowledge_gaps": ["קושי"]}')).toBeNull();
  });

  it('שני מערכים ריקים נדחים — אין ניתוח, ולא ניתוח ריק', () => {
    expect(parseAnalysisResponse('{"knowledge_gaps": [], "teaching_recommendations": []}')).toBeNull();
  });

  it('ערכים שאינם טקסט מסוננים, ולא הופכים ל-[object Object] בדוח', () => {
    const parsed = parseAnalysisResponse(
      '{"knowledge_gaps": [{"gap": "x"}, 7, "  ", "קושי בפריטה מעל אפס"], "teaching_recommendations": ["לתרגל עם לבנים"]}'
    );
    expect(parsed?.knowledge_gaps).toEqual(['קושי בפריטה מעל אפס']);
    expect(parsed?.teaching_recommendations).toEqual(['לתרגל עם לבנים']);
  });

  it('תשובה תקינה מתקבלת', () => {
    const ok = parseAnalysisResponse(
      '{"knowledge_gaps": ["קושי בפריטה מעל אפס"], "teaching_recommendations": ["לחזור על מפגש 6"]}'
    );
    expect(ok).not.toBeNull();
  });

  it('תקרת הזמן נמוכה מספיק כדי שהדוח לא ייתקע', () => {
    expect(AI_ANALYSIS_TIMEOUT_MS).toBeLessThanOrEqual(10000);
  });
});
