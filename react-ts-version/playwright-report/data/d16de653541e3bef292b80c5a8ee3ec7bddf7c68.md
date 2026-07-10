# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\telemetry-replay.spec.ts >> Telemetry & Replay Pipeline >> verify student telemetry is recorded and replay loads in Teacher Dashboard
- Location: tests\e2e\telemetry-replay.spec.ts:31:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'מיפוי כיתתי (Q-Matrix)' })
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: 'מיפוי כיתתי (Q-Matrix)' })

```

```yaml
- main:
  - text: מ
  - heading "מתמטיקאור ©" [level=1]
  - paragraph: סביבת למידה מוגברת טכנולוגיה
  - button "➔ חזרה"
  - heading "כניסת מורה - הקלדת פרטים מזהים" [level=2]
  - paragraph: ברוך הבא מורה! אנא הזן תעודת זהות ותאריך לידה (6 ספרות).
  - textbox "תעודת זהות": "039604483"
  - textbox "תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)": "290984"
  - button "מתחבר..." [disabled]
- complementary:
  - text: 🚀
  - heading "מתמטיקה, בקצב שלך." [level=2]
  - paragraph: סביבת הלמידה שמזהה איך אתה חושב, ומתאימה את עצמה בדיוק אליך.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | async function dragAndDrop(page, sourceSelector, targetSelector) {
  4  |   const source = page.locator(sourceSelector).first();
  5  |   const target = page.locator(targetSelector);
  6  |   
  7  |   const sourceBox = await source.boundingBox();
  8  |   const targetBox = await target.boundingBox();
  9  |   
  10 |   if (!sourceBox || !targetBox) {
  11 |     throw new Error('Source or target bounding box not found');
  12 |   }
  13 |   
  14 |   const startX = sourceBox.x + sourceBox.width / 2;
  15 |   const startY = sourceBox.y + sourceBox.height / 2;
  16 |   const endX = targetBox.x + targetBox.width / 2;
  17 |   const endY = targetBox.y + 25;
  18 |   
  19 |   await page.mouse.move(startX, startY);
  20 |   await page.waitForTimeout(100);
  21 |   await page.mouse.down();
  22 |   await page.waitForTimeout(200);
  23 |   await page.mouse.move(endX, endY, { steps: 10 });
  24 |   await page.waitForTimeout(200);
  25 |   await page.mouse.up();
  26 |   await page.mouse.move(0, 0);
  27 |   await page.waitForTimeout(100);
  28 | }
  29 | 
  30 | test.describe('Telemetry & Replay Pipeline', () => {
  31 |   test('verify student telemetry is recorded and replay loads in Teacher Dashboard', async ({ context, page }) => {
  32 |     // Disable driver.js tours
  33 |     await context.addInitScript(() => {
  34 |       window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
  35 |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  36 |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  37 |     });
  38 | 
  39 |     // 1. Log in Student
  40 |     await page.goto('/login');
  41 |     await page.getByRole('button', { name: 'תלמיד' }).click();
  42 | 
  43 |     await page.locator('select').first().selectOption({ index: 1 });
  44 |     await page.locator('select').nth(1).selectOption({ index: 1 });
  45 |     await page.getByPlaceholder('שם משתמש').fill('user3');
  46 |     await page.getByPlaceholder('סיסמה').fill('10203040');
  47 |     await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();
  48 | 
  49 |     // Wait for student hub and enter Lesson 1 workspace
  50 |     await expect(page.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });
  51 |     await page.getByText('שיעור 1: הכשרת חוקרים').first().click();
  52 |     await page.waitForURL('**/workspace*');
  53 | 
  54 |     // 2. Perform actions to trigger rrweb events (drag a block and undo it)
  55 |     await page.waitForSelector('[id^="palette-units"]', { timeout: 5000 });
  56 |     await dragAndDrop(page, '[id^="palette-units"]', '#column-units');
  57 |     await expect(page.locator('#column-units [id^="col-units-"]')).toHaveCount(1, { timeout: 5000 });
  58 | 
  59 |     const undoBtn = page.locator('button[aria-label*="בטל"], button[title*="בטל"], [id="undo-btn"]').first();
  60 |     await expect(undoBtn).toBeVisible({ timeout: 5000 });
  61 |     await undoBtn.click();
  62 | 
  63 |     // Wait for the telemetry flush interval (2 seconds) + safety margin
  64 |     await page.waitForTimeout(4000);
  65 | 
  66 |     // 3. Log out by clearing storage
  67 |     await page.evaluate(() => {
  68 |       localStorage.clear();
  69 |       sessionStorage.clear();
  70 |     });
  71 |     
  72 |     // 4. Log in Teacher
  73 |     await page.goto('/login');
  74 |     await page.getByRole('button', { name: 'מורה' }).click();
  75 |     await page.getByPlaceholder('תעודת זהות').fill('039604483');
  76 |     await page.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
  77 |     await page.getByRole('button', { name: 'התחבר למערכת' }).click();
  78 | 
  79 |     // Verify Teacher Dashboard is visible and navigate to student profile
> 80 |     await expect(page.getByRole('button', { name: 'מיפוי כיתתי (Q-Matrix)' })).toBeVisible({ timeout: 10000 });
     |                                                                                ^ Error: expect(locator).toBeVisible() failed
  81 |     
  82 |     // Click on "דו"חות אבחון אישיים" tab
  83 |     await page.locator('#tour-tab-reports').click();
  84 | 
  85 |     // Click on Student 'user3' (normalized id is student_user3, displaying as user3 or similar)
  86 |     const studentBtn = page.locator('button:has-text("user3"), button:has-text("student_user3")').first();
  87 |     await expect(studentBtn).toBeVisible({ timeout: 5000 });
  88 |     await studentBtn.click();
  89 | 
  90 |     // Verify the replay viewer starts to load and the replay viewer title is visible
  91 |     await expect(page.getByText('צפייה בהקלטת סשן הלמידה')).toBeVisible({ timeout: 5000 });
  92 | 
  93 |     // Since rrweb-player needs special default-import resolution, checking that there are no JS crashes is done
  94 |     // by checking that either the player container or the no-replay-placeholder is rendered (no white-screen/crash).
  95 |     const playerContainer = page.locator('.rrweb-player-container, .glass-card:has-text("אין מספיק נתוני הקלטה")');
  96 |     await expect(playerContainer.first()).toBeVisible({ timeout: 5000 });
  97 |   });
  98 | });
  99 | 
```