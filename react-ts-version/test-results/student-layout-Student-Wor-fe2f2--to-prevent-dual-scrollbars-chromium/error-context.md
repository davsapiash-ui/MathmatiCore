# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: student-layout.spec.ts >> Student Workspace Layout >> Workspace has proper height constraints to prevent dual scrollbars
- Location: tests\e2e\student-layout.spec.ts:4:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'להמשך התרגול' })
    - locator resolved to <button tabindex="0" class="ws-brand mt-4 flex items-center justify-center gap-3 px-8 py-4 rounded-full font-display font-extrabold text-lg transition-all hover:brightness-105">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
      - waiting 100ms
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: M
      - link "מתמטיקאור ©" [ref=e7] [cursor=pointer]:
        - /url: /
    - navigation [ref=e8]:
      - link "הקורסים שלי" [ref=e9] [cursor=pointer]:
        - /url: /hub
        - img [ref=e10]
        - generic [ref=e12]: הקורסים שלי
      - link "היסטוריית משימות" [ref=e14] [cursor=pointer]:
        - /url: /hub/history
        - img [ref=e15]
        - generic [ref=e18]: היסטוריית משימות
    - button "התנתק" [ref=e20] [cursor=pointer]:
      - img [ref=e21]
      - generic [ref=e24]: התנתק
  - generic [ref=e25]:
    - banner [ref=e26]:
      - generic [ref=e27]: בית
      - generic [ref=e28]:
        - button [ref=e29] [cursor=pointer]:
          - img
        - generic [ref=e31] [cursor=pointer]:
          - generic [ref=e32]:
            - generic [ref=e33]: user1
            - generic [ref=e34]: תלמיד
          - img [ref=e36]
    - main [ref=e40]:
      - generic [ref=e42]:
        - generic [ref=e44]:
          - generic [ref=e45]:
            - img [ref=e46]
            - text: סביבת הלמידה האישית שלך
          - heading "ברוכים הבאים למעבדת החשיבה 🔬" [level=1] [ref=e52]
          - paragraph [ref=e53]: כאן אנחנו לא רק פותרים תרגילים, אלא חוקרים איך מספרים עובדים. הכלים במעבדה יעזרו לכם לגלות שיטות חשיבה חדשות.
          - generic [ref=e54]:
            - img [ref=e55]
            - text: ממתינים לאישור המורה למשימה הבאה...
        - generic [ref=e58]:
          - heading "רצף המפגשים" [level=2] [ref=e59]
          - generic [ref=e60]:
            - 'link "1 שיעור 1: הכשרת חוקרים היכרות עם כלי המעבדה השונים במרחב החקר הווירטואלי. התחל" [ref=e61] [cursor=pointer]':
              - generic [ref=e63]: 🧪
              - generic [ref=e64]:
                - generic [ref=e65]:
                  - generic [ref=e66]: "1"
                  - 'heading "שיעור 1: הכשרת חוקרים" [level=3] [ref=e67]'
                - paragraph [ref=e68]: היכרות עם כלי המעבדה השונים במרחב החקר הווירטואלי.
              - generic [ref=e69]:
                - text: התחל
                - img [ref=e70]
            - 'link "2 שיעור 2: סריקת רדאר משימות חקר קצרות כדי שהמערכת תלמד את סגנון החשיבה הייחודי שלכם. התחל" [ref=e72] [cursor=pointer]':
              - generic [ref=e74]: 📡
              - generic [ref=e75]:
                - generic [ref=e76]:
                  - generic [ref=e77]: "2"
                  - 'heading "שיעור 2: סריקת רדאר" [level=3] [ref=e78]'
                - paragraph [ref=e79]: משימות חקר קצרות כדי שהמערכת תלמד את סגנון החשיבה הייחודי שלכם.
              - generic [ref=e80]:
                - text: התחל
                - img [ref=e81]
            - generic [ref=e83]:
              - img [ref=e86]
              - generic [ref=e89]:
                - generic [ref=e90]:
                  - generic [ref=e91]: "3"
                  - 'heading "שיעור 3: מחקר אישי" [level=3] [ref=e92]'
                - paragraph [ref=e93]: הנתונים נסרקים במערכת, ממתין לאישור מנהל מעבדה...
              - generic [ref=e94]: ממתין לאישור
            - generic [ref=e95]:
              - img [ref=e98]
              - generic [ref=e101]:
                - generic [ref=e102]:
                  - generic [ref=e103]: "4"
                  - 'heading "שיעור 4: חוקרים ומגלים" [level=3] [ref=e104]'
                - paragraph [ref=e105]: ניסויי פריטה וקיבוץ — חוקרים יחד ומצליחים.
              - generic [ref=e106]: בקרוב
            - generic [ref=e107]:
              - img [ref=e110]
              - generic [ref=e113]:
                - generic [ref=e114]:
                  - generic [ref=e115]: "5"
                  - 'heading "שיעור 5: חוקרים ומגלים" [level=3] [ref=e116]'
                - paragraph [ref=e117]: ממשיכים לתכנן ניסויים ולגלות שיטות חשיבה חדשות.
              - generic [ref=e118]: בקרוב
            - generic [ref=e119]:
              - img [ref=e122]
              - generic [ref=e125]:
                - generic [ref=e126]:
                  - generic [ref=e127]: "6"
                  - 'heading "שיעור 6: מחקר מתקדם" [level=3] [ref=e128]'
                - paragraph [ref=e129]: אתגרים מחשבתיים שמותאמים לקצב הגילוי שלכם.
              - generic [ref=e130]: בקרוב
            - generic [ref=e131]:
              - img [ref=e134]
              - generic [ref=e137]:
                - generic [ref=e138]:
                  - generic [ref=e139]: "7"
                  - 'heading "שיעור 7: מחקר מתקדם" [level=3] [ref=e140]'
                - paragraph [ref=e141]: לקראת סיום — ניסויים מאתגרים לחיזוק הלמידה.
              - generic [ref=e142]: בקרוב
            - generic [ref=e143]:
              - img [ref=e146]
              - generic [ref=e149]:
                - generic [ref=e150]:
                  - generic [ref=e151]: "8"
                  - 'heading "שיעור 8: סיכום ותגליות" [level=3] [ref=e152]'
                - paragraph [ref=e153]: מסכמים את המחקר ורואים אילו תגליות גילינו!
              - generic [ref=e154]: בקרוב
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Student Workspace Layout', () => {
  4  |   test('Workspace has proper height constraints to prevent dual scrollbars', async ({ page }) => {
  5  |     await page.goto('/login');
  6  |     
  7  |     // Select Student Role
  8  |     await page.getByRole('button', { name: 'תלמיד' }).click();
  9  |     
  10 |     // Fill student credentials
  11 |     await page.locator('select').first().selectOption({ index: 1 });
  12 |     await page.locator('select').nth(1).selectOption({ index: 1 });
  13 |     await page.getByPlaceholder('שם משתמש').fill('user1');
  14 |     await page.getByPlaceholder('סיסמה').fill('10203040');
  15 |     
  16 |     await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();
  17 | 
  18 |     // Navigate to workspace from hub
> 19 |     await page.getByRole('button', { name: 'להמשך התרגול' }).click();
     |                                                              ^ Error: locator.click: Test timeout of 30000ms exceeded.
  20 | 
  21 |     // Verify workspace layout doesn't overflow `100vh`
  22 |     await page.waitForURL('**/workspace*');
  23 |     
  24 |     // Evaluate if the document body or HTML has hidden scrollbars (or 100vh)
  25 |     const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
  26 |     const windowHeight = await page.evaluate(() => window.innerHeight);
  27 |     
  28 |     // UDL constraint: Keep layout strict
  29 |     // Typically we want body height to not drastically exceed window height without a specific internal scroll container
  30 |     expect(bodyHeight).toBeLessThanOrEqual(windowHeight + 100); 
  31 | 
  32 |     // Verify main components exist
  33 |     await expect(page.getByText('משימה').first()).toBeVisible();
  34 |   });
  35 | });
  36 | 
```