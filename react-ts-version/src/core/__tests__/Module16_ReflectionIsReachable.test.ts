import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';

/**
 * מודול 16, 23.9.2026 — הלוח שמעולם לא נפתח.
 *
 * מודול 14: מפגש 8 הוא "חוקר-על — סיכום ורפלקציית SRL". מודול 16 §א: לוח
 * הרפלקציה התלת-שלבי הוא "בסיום מפגש 8". מודול 14 §ב0: מפגש 2 מסתיים במסך
 * המתנה שקט עד שהמורה מאשרת את המסלול.
 *
 * בקוד זה היה הפוך בדיוק. `flowStatus: 'reflection'` נכתב בנקודה אחת בלבד —
 * סיום האבחון של מפגש 2 — ולכן מפגש 2 הציג את הלוח המלא (כולל אחוז מדד
 * ההתמדה, לילד, ברגע שבו מוכרע מסלולו), ומפגש 8 הסתיים במסך "כל הכבוד"
 * הגנרי. הלוח של מפגש 8 היה בנוי, נבדק ונשמר כהלכה — אבל שלושת מסלולי הסיום
 * בקוד הובילו כולם למקום אחר, ואף ילד לא היה רואה אותו.
 *
 * סבב קודם תיקן את **השמירה** של הלוח (מה נשלח, לאן, וסכמת החוקים) ולא שאל
 * אם הוא נפתח. הבדיקה הזו שואלת בדיוק את זה, לכל מפגש.
 */
const STUDENT = 'student_user12';
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const store = src('application/useWorkspaceStore.ts');

function startMeeting(n: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) {
  useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true });
  useStore.setState({ students: { [STUDENT]: { pedagogicalPath: 'green_path' } } as any });
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.getState().initSession(n, false);
}

describe('סיום מפגש — לאן כל מפגש מגיע', () => {
  it('מפגש 8 מגיע ללוח הרפלקציה', () => {
    startMeeting(8);
    useWorkspaceStore.getState().finishMeetingEarly();
    expect(useWorkspaceStore.getState().flowStatus).toBe('reflection');
  });

  it('כל מפגש אחר מגיע לסיום השקט — ולא לרפלקציה', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7] as const) {
      startMeeting(n);
      useWorkspaceStore.getState().finishMeetingEarly();
      expect(useWorkspaceStore.getState().flowStatus, `מפגש ${n}`).toBe('sessionDone');
    }
  });

  it('שלושת מסלולי הסיום בקוד מותנים כולם במספר המפגש', () => {
    // סיום טבעי של שבעת החובה, סיום יזום, וסיום מפגש בלי מסך בחירה.
    const hits = store.match(/sessionNumber === 8 \? 'reflection' : 'sessionDone'/g) || [];
    expect(hits.length).toBe(3);
  });
});

describe('מפגש 2 — האבחון מסתיים בהמתנה לאישור המורה', () => {
  it('הנקודה היחידה ששלחה את האבחון לרפלקציה כבר אינה שם', () => {
    expect(store).not.toContain("set({ flowStatus: 'reflection', awaitingNext: false, currentState: 'COMPLETE' });");
    expect(store).toContain("set({ flowStatus: 'sessionDone', awaitingNext: false, currentState: 'COMPLETE' });");
  });

  it('המסך שמחכה ללומד אחרי האבחון הוא מסך ההמתנה, כל עוד השער לא אושר', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toContain("flowStatus === 'sessionDone' && sessionNumber === 2 && !isGateApproved");
    expect(page).toContain('<BeeFlightWaitingScreen');
  });

  it('המסך של מפגש 8 הוא זה שמרונדר כשמגיעים לרפלקציה', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    const block = page.slice(page.indexOf("if (flowStatus === 'reflection')"), page.indexOf("flowStatus === 'sessionDone' && sessionNumber === 2"));
    expect(block).toContain('sessionNumber === 8');
    expect(block).toContain('<Session8ReflectionScreen');
  });
});

describe('אירוע הרפלקציה נפלט מהכותב המשותף', () => {
  it('REFLECTION_SUBMITTED יוצא מכל רפלקציה שנשמרת, לא ממסך אחד', () => {
    // נספח א׳ §3. עד כה הוא נפלט רק ממסך מפגש 2 — המסך שאינו באפיון — ולכן
    // ברגע שהוא ירד, האירוע היה נעלם מהמחקר לגמרי.
    const writer = src('core/srlReflection.ts');
    expect(writer).toContain("event_type: 'REFLECTION_SUBMITTED'");
    expect(writer).toContain('persistence_index: persistenceIndex,');
  });
});

describe('אין רכיבים שנבנו ואיש אינו מגיע אליהם', () => {
  it('מגירת החניכה הישנה הוסרה — הכרטיס מוצג ב-HelpOverlays', () => {
    let exists = true;
    try { src('features/workspace/overlays/SocraticDrawer.tsx'); } catch { exists = false; }
    expect(exists).toBe(false);
    expect(src('features/workspace/overlays/HelpOverlays.tsx')).toContain("event_type: 'SOCRATIC_CARD_SHOWN'");
  });
});
