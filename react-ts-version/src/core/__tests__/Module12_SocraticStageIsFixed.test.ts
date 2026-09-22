import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GRID_STAGE_SECONDS, SOCRATIC_STAGE_SECONDS } from '@/core/hesitationStages';
import { DEFAULT_HESITATION_THRESHOLD_SECONDS } from '@/core/hesitationCalibration';

/**
 * החזרה לאפיון, 22.9.2026 — הסליידר של המנהל הזיז את כרטיס החניכה של הילד.
 *
 * מודול 12 §ד: הכרטיס נפתח "strictly upon: (a) 45 seconds of continuous column
 * hesitation", ונספח א׳ §3 מתייג את האירוע `trigger_reason: 'hesitation_45s'`.
 * "כיול רדאר פדגוגי" (מודול 26, `system_control/trace_calibration`) הזיז את
 * אותו טיימר עצמו — כלומר מנהל שקבע 60 שניות שינה את הטריגר שהאפיון קובע
 * כקבוע, וכל אירוע היסוס במחקר נרשם כ-45 שניות בזמן שהיה 60.
 *
 * מה שהסליידר כן מכייל: מתי הריבוע של הלומד נצבע בצהוב אצל המורה (מודול 18 §ב).
 */
const hook = readFileSync(
  resolve(__dirname, '../../application/useCognitiveHesitationRadar.ts'),
  'utf-8'
);

describe('כרטיס החניכה קבוע על 45 שניות', () => {
  it('הקבוע עצמו הוא 45, והוא מאוחר משלב לוח החיבור של מודול 10', () => {
    expect(SOCRATIC_STAGE_SECONDS).toBe(45);
    expect(GRID_STAGE_SECONDS).toBeLessThan(SOCRATIC_STAGE_SECONDS);
  });

  it('הטיימר של הכרטיס נפתח על הקבוע, לא על הערך המכויל', () => {
    expect(hook).toContain('}, SOCRATIC_STAGE_SECONDS * 1000);');
    // הקריאה שפותחת את הכרטיס יושבת בטיימר הקבוע.
    const socraticStage = hook.slice(
      hook.indexOf('timeoutRef.current = setTimeout(() => {'),
      hook.indexOf('}, SOCRATIC_STAGE_SECONDS * 1000);')
    );
    expect(socraticStage).toContain('onHesitationRef.current();');
    expect(socraticStage).toContain("event_type: 'HESITATION_DETECTED'");
    expect(socraticStage).not.toContain('getHesitationThresholdSeconds()');
  });

  it('משך ההיסוס שנרשם בטלמטריה נמדד מול 45, לא מול הכיול', () => {
    expect(hook).toContain('const measuredSeconds = Math.max(');
    expect(hook).toContain('        SOCRATIC_STAGE_SECONDS,');
  });

  it('דגל ההיסוס של הרדאר נשאר על הערך המכויל, בטיימר נפרד', () => {
    const radarStage = hook.slice(hook.indexOf('radarTimeoutRef.current = setTimeout(() => {'));
    expect(radarStage).toContain('hesitating: true,');
    expect(radarStage).toContain('}, getHesitationThresholdSeconds() * 1000);');
  });

  it('שלושת הטיימרים מנוקים בכל איפוס, בכיבוי ובפירוק', () => {
    const resets = hook.match(/clearTimeout\(radarTimeoutRef\.current\);/g) || [];
    expect(resets.length).toBe(3);
  });

  it('ברירת המחדל של הכיול זהה לקבוע — בלי כיול שום דבר לא משתנה', () => {
    expect(DEFAULT_HESITATION_THRESHOLD_SECONDS).toBe(SOCRATIC_STAGE_SECONDS);
  });
});

describe('מסך המנהל אומר את האמת על הסליידר', () => {
  const view = readFileSync(
    resolve(__dirname, '../../presentation/pages/admin/AdminCurriculumView.tsx'),
    'utf-8'
  );

  it('כתוב במפורש שהסליידר נוגע לרדאר המורה ושהכרטיס קבוע על 45', () => {
    expect(view).toContain('הסף הזה נוגע לרדאר של המורה בלבד');
    expect(view).toContain('קבוע על 45 שניות לפי האפיון');
  });
});
