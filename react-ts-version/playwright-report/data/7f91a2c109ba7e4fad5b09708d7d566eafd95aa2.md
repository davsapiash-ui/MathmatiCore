# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\class-management-render.spec.ts >> Class Management Rendering >> Class management grid renders properly without crashing
- Location: tests\e2e\class-management-render.spec.ts:4:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'ניהול כיתה ותלמידים' })
    - locator resolved to <button class="w-full text-right px-4 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 hover:bg-ws-bg  text-ws-soft ">ניהול כיתה ותלמידים</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e5]:
    - generic [ref=e6]: דשבורד מורה
    - generic [ref=e7]:
      - button [ref=e8] [cursor=pointer]:
        - img
      - generic [ref=e9] [cursor=pointer]:
        - generic [ref=e10]:
          - generic [ref=e11]: דוד
          - generic [ref=e12]: מורה
        - img [ref=e14]
  - main [ref=e18]:
    - generic [ref=e19]:
      - complementary [ref=e20]:
        - generic [ref=e21]:
          - generic [ref=e22]: M
          - link "מתמטיקאור ©" [ref=e23] [cursor=pointer]:
            - /url: /
        - generic [ref=e24]:
          - heading "תחנת עבודה מורה" [level=2] [ref=e25]
          - button "ארגז חול למקרן" [ref=e27] [cursor=pointer]:
            - img [ref=e28]
            - generic [ref=e30]: ארגז חול למקרן
        - navigation [ref=e31]:
          - generic [ref=e32]: פדגוגיה ומעקב
          - button "מיפוי כיתתי (Q-Matrix)" [ref=e33] [cursor=pointer]
          - button "דו\"חות אבחון אישיים" [ref=e34] [cursor=pointer]
          - button "התראות זמן אמת (רדאר) 81" [ref=e35] [cursor=pointer]:
            - generic [ref=e36]: התראות זמן אמת (רדאר)
            - generic [ref=e37]: "81"
          - button "אישור משימות AI 3" [ref=e38] [cursor=pointer]:
            - generic [ref=e39]: אישור משימות AI
            - generic [ref=e40]: "3"
          - button "ניהול כיתה ותלמידים" [ref=e41] [cursor=pointer]
          - generic [ref=e42]: תקשורת וצ'אט
          - button "צ'אט עם תלמידים" [ref=e43] [cursor=pointer]:
            - generic [ref=e44]: צ'אט עם תלמידים
          - button "צ'אט הנהלה" [ref=e45] [cursor=pointer]:
            - generic [ref=e46]: צ'אט הנהלה
        - button "התנתק" [ref=e48] [cursor=pointer]:
          - img [ref=e49]
          - generic [ref=e52]: התנתק
      - main [ref=e53]:
        - generic [ref=e54]:
          - generic [ref=e55]:
            - heading "קיבוץ תלמידים לפי פערי למידה" [level=1] [ref=e56]
            - paragraph [ref=e57]: המערכת מקבצת תלמידים באופן אוטומטי על בסיס מודל ה-Q-Matrix.
          - generic [ref=e58]:
            - heading "התפלגות שליטה במיומנויות (כיתה שלמה)" [level=2] [ref=e60]: התפלגות שליטה במיומנויות (כיתה שלמה)
            - generic [ref=e63]:
              - generic [ref=e64]: "נ\x9f“\x8a"
              - paragraph [ref=e65]: אין עדיין נתונים מהתלמידים
              - paragraph [ref=e66]: התפלגות השליטה תוצג כאן לאחר סיום שלב האבחון
          - generic [ref=e67]:
            - generic [ref=e68]:
              - heading "הבנת המבנה העשרוני ושומר מקום" [level=3] [ref=e71]
              - paragraph [ref=e72]: תלמידים שהתקשו בהבנת האפס כשומר מקום או זיהוי ערך המקום במערכת העשרונית.
              - table [ref=e76]:
                - rowgroup [ref=e77]:
                  - row "שם תלמיד רמת שליטה" [ref=e78]:
                    - columnheader "שם תלמיד" [ref=e79]
                    - columnheader "רמת שליטה" [ref=e80]
                - rowgroup [ref=e81]:
                  - row "אין נתונים להצגה" [ref=e82]:
                    - cell "אין נתונים להצגה" [ref=e83]
              - button "הקצאת תרגול מותאם" [ref=e84] [cursor=pointer]
            - generic [ref=e85]:
              - heading "תחושת גודל ואומדן" [level=3] [ref=e88]
              - paragraph [ref=e89]: תלמידים שמתקשים להעריך ולמקם מספרים על הרצף.
              - table [ref=e93]:
                - rowgroup [ref=e94]:
                  - row "שם תלמיד רמת שליטה" [ref=e95]:
                    - columnheader "שם תלמיד" [ref=e96]
                    - columnheader "רמת שליטה" [ref=e97]
                - rowgroup [ref=e98]:
                  - row "אין נתונים להצגה" [ref=e99]:
                    - cell "אין נתונים להצגה" [ref=e100]
              - button "הקצאת המחשה חזותית" [ref=e101] [cursor=pointer]
            - generic [ref=e102]:
              - heading "גמישות בהמרה ופריטה" [level=3] [ref=e105]
              - paragraph [ref=e106]: תלמידים המקובעים לייצוג הקנוני ומתקשים לפרוט עשרות ליחידות.
              - table [ref=e110]:
                - rowgroup [ref=e111]:
                  - row "שם תלמיד רמת שליטה" [ref=e112]:
                    - columnheader "שם תלמיד" [ref=e113]
                    - columnheader "רמת שליטה" [ref=e114]
                - rowgroup [ref=e115]:
                  - row "אין נתונים להצגה" [ref=e116]:
                    - cell "אין נתונים להצגה" [ref=e117]
              - button "הקצאת סדנת חקר" [ref=e118] [cursor=pointer]
            - generic [ref=e119]:
              - heading "שליטה בפרוצדורות ובעובדות" [level=3] [ref=e122]
              - paragraph [ref=e123]: תלמידים שזקוקים לחיזוק האלגוריתם המסורתי בחיבור וחיסור.
              - table [ref=e127]:
                - rowgroup [ref=e128]:
                  - row "שם תלמיד רמת שליטה" [ref=e129]:
                    - columnheader "שם תלמיד" [ref=e130]
                    - columnheader "רמת שליטה" [ref=e131]
                - rowgroup [ref=e132]:
                  - row "אין נתונים להצגה" [ref=e133]:
                    - cell "אין נתונים להצגה" [ref=e134]
              - button "הקצאת תרגול מותאם" [ref=e135] [cursor=pointer]
            - generic [ref=e136]:
              - heading "חשיבה יחסית (Relational Thinking)" [level=3] [ref=e139]
              - paragraph [ref=e140]: תלמידים שמתקשים לגזור עובדה חדשה מתוך עובדה ידועה ללא חישוב מחדש.
              - table [ref=e144]:
                - rowgroup [ref=e145]:
                  - row "שם תלמיד רמת שליטה" [ref=e146]:
                    - columnheader "שם תלמיד" [ref=e147]
                    - columnheader "רמת שליטה" [ref=e148]
                - rowgroup [ref=e149]:
                  - row "אין נתונים להצגה" [ref=e150]:
                    - cell "אין נתונים להצגה" [ref=e151]
              - button "הקצה חקר יחסים" [ref=e152] [cursor=pointer]
            - generic [ref=e153]:
              - heading "חשיבה אלגברית ומציאת נעלם" [level=3] [ref=e156]
              - paragraph [ref=e157]: תלמידים המתקשים להבין את סימן השוויון כמאזניים ואת הדינמיקה של משוואה.
              - table [ref=e161]:
                - rowgroup [ref=e162]:
                  - row "שם תלמיד רמת שליטה" [ref=e163]:
                    - columnheader "שם תלמיד" [ref=e164]
                    - columnheader "רמת שליטה" [ref=e165]
                - rowgroup [ref=e166]:
                  - row "אין נתונים להצגה" [ref=e167]:
                    - cell "אין נתונים להצגה" [ref=e168]
              - button "הקצאת מודל מאזניים" [ref=e169] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Class Management Rendering', () => {
  4  |   test('Class management grid renders properly without crashing', async ({ context, page }) => {
  5  |     // Disable driver.js tours
  6  |     await context.addInitScript(() => {
  7  |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  8  |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  9  |     });
  10 | 
  11 |     // Login Teacher
  12 |     await page.goto('/login');
  13 |     await page.getByRole('button', { name: 'מורה' }).click();
  14 |     await page.getByPlaceholder('תעודת זהות').fill('039604483');
  15 |     await page.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
  16 |     await page.getByRole('button', { name: 'התחבר למערכת' }).click();
  17 | 
  18 |     // Go to class management
> 19 |     await page.getByRole('button', { name: 'ניהול כיתה ותלמידים' }).click();
     |                                                                     ^ Error: locator.click: Test timeout of 30000ms exceeded.
  20 | 
  21 |     // Verify it doesn't crash (white screen). If it doesn't crash, the table headers should exist.
  22 |     await expect(page.getByText('קוד זיהוי (מערכת)').first()).toBeVisible();
  23 | 
  24 |     // Verify at least one student is rendered
  25 |     const rowLocator = page.locator('tbody tr').first();
  26 |     await expect(rowLocator).toBeVisible();
  27 | 
  28 |     const rows = page.locator('tbody tr');
  29 |     const count = await rows.count();
  30 |     
  31 |     // There should be at least 1 student generated or retrieved from Firebase
  32 |     expect(count).toBeGreaterThanOrEqual(1);
  33 |   });
  34 | });
  35 | 
```