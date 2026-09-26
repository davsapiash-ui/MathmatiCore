import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeCognitiveMastery, Q_MATRIX_MAPPING, TASKS } from '@/core/QMatrix';

const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const dashboard = src('presentation/pages/TeacherDashboard.tsx');
const toast = src('features/workspace/overlays/FeedbackToast.tsx');
const store = src('application/useWorkspaceStore.ts');

/**
 * פרופיל השליטה של הלומד לא הגיע למורה בכלל.
 *
 * דפדפן הלומד מחשב אותו בסיום מפגש 2 ומסנכרן אותו ל-
 * users/students/{id}/conceptMastery. בונה השורות בדשבורד לא העתיק אותו אל
 * השורה, וכל צרכן בודק `s.conceptMastery && ...` — כך ששש ווידג'טי החלוקה
 * ספרו 0 והסתירו את עצמם, תרשים המיומנויות הכיתתי דילג על כל לומד, ומונה
 * "לומדים עם פרופיל" הראה 0. הלשונית נראתה ככיתה שמעולם לא נבדקה.
 */
describe('פרופיל השליטה מגיע מהשרת אל שורת הלומד', () => {
  it('בונה השורות קורא את conceptMastery מהצומת', () => {
    expect(dashboard).toContain('conceptMastery: row.conceptMastery');
  });

  it('הצרכנים ממשיכים להתגונן מפני לומד בלי פרופיל', () => {
    expect(dashboard).toContain('s.conceptMastery && s.conceptMastery.decimal_structure < 0.5');
    expect(dashboard).toContain('if (!s.conceptMastery) return;');
  });
});

describe('מה האבחון באמת מודד', () => {
  it('שבע משימות האבחון ממפות לשלושה מושגים בלבד', () => {
    const measured = new Set(TASKS.flatMap((t) => Q_MATRIX_MAPPING[t.id] ?? []));
    expect([...measured].sort()).toEqual(['decimal_structure', 'procedural_fluency', 'regrouping_fluency']);
  });

  it('מושג שלא נבדק מקבל 1.0 — כלומר ייראה כשליטה מלאה', () => {
    // זו התנהגות מכוונת של הנוסחה, והיא מה שיקרה על המסך עכשיו כשהנתונים
    // סוף סוף מגיעים. שלושת המושגים שאינם נמדדים יוצגו כשליטה מלאה בכל
    // הכיתה, ושלושת הווידג'טים שלהם לא יופיעו לעולם. ההחלטה מה לעשות עם
    // זה שייכת לבעל המוצר — הבדיקה כאן מתעדת את העובדה כדי שלא תיעלם.
    const profile = computeCognitiveMastery({ task1_read_write_zero: 'fail' });
    expect(profile.decimal_structure).toBe(0);
    expect(profile.number_magnitude).toBe(1);
    expect(profile.relational_thinking).toBe(1);
    expect(profile.algebraic_reasoning).toBe(1);
  });
});

describe('מפגש 2 — אישור שקט, לא חגיגה על טעות', () => {
  it('האבחון משתמש במשוב ניטרלי', () => {
    const matches = store.match(/showFeedback\(\{ correct: true, neutral: true,/g) ?? [];
    // three in the diagnostic (answer received; the next task of the correction round; trying again),
    // the silent help call and taking it back (מסמך 03 §3.1). The round's answers are neutral too —
    // Module13_CorrectionRound.test.ts checks that block as a whole.
    expect(matches).toHaveLength(5);
  });

  it('קונפטי אינו יורה על משוב ניטרלי', () => {
    expect(toast).toContain('if (feedback?.correct && !feedback.neutral && !isASD)');
  });

  it('משוב ניטרלי אינו נראה ירוק ואינו נראה אדום', () => {
    expect(toast).toContain("feedback.neutral ? 'border-ws-ink/20'");
    expect(toast).toContain("feedback.neutral ? 'bg-ws-surface2'");
    expect(toast).toContain("feedback.neutral ? '👍'");
  });
});
