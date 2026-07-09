# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\rbac-visibility.spec.ts >> RBAC Visibility Tests >> Teacher has access to Class Management but not Institution Management
- Location: tests\e2e\rbac-visibility.spec.ts:21:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'מיפוי כיתתי (Q-Matrix)' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: 'מיפוי כיתתי (Q-Matrix)' })

```

```yaml
- banner:
  - text: דשבורד מורה
  - button
  - text: דוד מורה
- main:
  - paragraph: טוען נתוני תלמידים...
- dialog "מיפוי כיתתי":
  - banner: מיפוי כיתתי
  - text: כאן תוכלי לראות בזמן אמת את פילוג הכיתה לפי מיומנויות, עם אפשרות לחלק למשימות מותאמות.
  - contentinfo:
    - text: 1 מתוך 6
    - button "הקודם" [disabled]
    - button "הבא"
- img
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('RBAC Visibility Tests', () => {
  4  |   test('Admin has access to System Settings and Institution Management', async ({ page }) => {
  5  |     await page.goto('/login');
  6  |     
  7  |     // Select Admin Role
  8  |     await page.getByRole('button', { name: 'מנהל מערכת' }).click();
  9  |     
  10 |     // Fill credentials
  11 |     await page.getByPlaceholder('שם משתמש').fill('davsapiash');
  12 |     await page.getByPlaceholder('סיסמה').fill('carlibach');
  13 |     await page.getByRole('button', { name: 'התחבר למערכת' }).click();
  14 | 
  15 |     // Verify Admin elements exist
  16 |     await expect(page.getByRole('heading', { name: 'סקירה כללית' })).toBeVisible();
  17 |     await expect(page.getByRole('link', { name: 'מוסדות ומורים' })).toBeVisible();
  18 |     await expect(page.getByRole('link', { name: 'מערכת ונגישות (UDL)' })).toBeVisible();
  19 |   });
  20 | 
  21 |   test('Teacher has access to Class Management but not Institution Management', async ({ page }) => {
  22 |     await page.goto('/login');
  23 |     
  24 |     // Select Teacher Role
  25 |     await page.getByRole('button', { name: 'מורה' }).click();
  26 |     
  27 |     // Fill credentials
  28 |     await page.getByPlaceholder('תעודת זהות').fill('039604483');
  29 |     await page.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
  30 |     await page.getByRole('button', { name: 'התחבר למערכת' }).click();
  31 | 
  32 |     // Verify Teacher elements exist
> 33 |     await expect(page.getByRole('button', { name: 'מיפוי כיתתי (Q-Matrix)' })).toBeVisible();
     |                                                                                ^ Error: expect(locator).toBeVisible() failed
  34 |     await expect(page.getByRole('button', { name: 'ניהול כיתה ותלמידים' })).toBeVisible();
  35 |     
  36 |     // Verify Admin elements are missing
  37 |     await expect(page.getByRole('link', { name: 'מוסדות ומורים' })).not.toBeVisible();
  38 |     await expect(page.getByText('הגדרות מערכת')).not.toBeVisible();
  39 |   });
  40 | 
  41 |   test('Student has restricted workspace', async ({ page }) => {
  42 |     await page.goto('/login');
  43 |     
  44 |     // Select Student Role
  45 |     await page.getByRole('button', { name: 'תלמיד' }).click();
  46 |     
  47 |     // Select dropdowns
  48 |     // Assume we can just click "יאללה, נכנסים! ✨" directly if default values are present, 
  49 |     // or we might need to select options. The login logic allows direct click for student.
  50 |     await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();
  51 | 
  52 |     // Student should see tasks, not admin or teacher panels
  53 |     // Waiting for workspace to load
  54 |     // Using a broad check
  55 |     await expect(page.getByText('ניהול כיתה')).not.toBeVisible();
  56 |     await expect(page.getByText('סקירה כללית')).not.toBeVisible();
  57 |   });
  58 | });
  59 | 
```