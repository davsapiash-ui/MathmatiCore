# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\rbac-visibility.spec.ts >> RBAC Visibility Tests >> Teacher has access to Class Management but not Institution Management
- Location: tests\e2e\rbac-visibility.spec.ts:26:3

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
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('RBAC Visibility Tests', () => {
  4  |   test('Admin has access to System Settings and Institution Management', async ({ context, page }) => {
  5  |     await context.addInitScript(() => {
  6  |       window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
  7  |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  8  |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  9  |     });
  10 |     await page.goto('/login');
  11 |     
  12 |     // Select Admin Role
  13 |     await page.getByRole('button', { name: 'מנהל מערכת' }).click();
  14 |     
  15 |     // Fill credentials
  16 |     await page.getByPlaceholder('שם משתמש').fill('davsapiash');
  17 |     await page.getByPlaceholder('סיסמה').fill('carlibach');
  18 |     await page.getByRole('button', { name: 'התחבר למערכת' }).click();
  19 | 
  20 |     // Verify Admin elements exist
  21 |     await expect(page.getByRole('heading', { name: 'סקירה כללית' })).toBeVisible();
  22 |     await expect(page.getByRole('link', { name: 'מוסדות ומורים' })).toBeVisible();
  23 |     await expect(page.getByRole('link', { name: 'מערכת ונגישות (UDL)' })).toBeVisible();
  24 |   });
  25 | 
  26 |   test('Teacher has access to Class Management but not Institution Management', async ({ context, page }) => {
  27 |     await context.addInitScript(() => {
  28 |       window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
  29 |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  30 |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  31 |     });
  32 |     await page.goto('/login');
  33 |     
  34 |     // Select Teacher Role
  35 |     await page.getByRole('button', { name: 'מורה' }).click();
  36 |     
  37 |     // Fill credentials
  38 |     await page.getByPlaceholder('תעודת זהות').fill('039604483');
  39 |     await page.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
  40 |     await page.getByRole('button', { name: 'התחבר למערכת' }).click();
  41 | 
  42 |     // Verify Teacher elements exist
> 43 |     await expect(page.getByRole('button', { name: 'מיפוי כיתתי (Q-Matrix)' })).toBeVisible();
     |                                                                                ^ Error: expect(locator).toBeVisible() failed
  44 |     await expect(page.getByRole('button', { name: 'ניהול כיתה ותלמידים' })).toBeVisible();
  45 |     
  46 |     // Verify Admin elements are missing
  47 |     await expect(page.getByRole('link', { name: 'מוסדות ומורים' })).not.toBeVisible();
  48 |     await expect(page.getByText('הגדרות מערכת')).not.toBeVisible();
  49 |   });
  50 | 
  51 |   test('Student has restricted workspace', async ({ context, page }) => {
  52 |     await context.addInitScript(() => {
  53 |       window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
  54 |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  55 |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  56 |     });
  57 |     await page.goto('/login');
  58 |     
  59 |     // Select Student Role
  60 |     await page.getByRole('button', { name: 'תלמיד' }).click();
  61 |     
  62 |     // Select dropdowns
  63 |     // Assume we can just click "יאללה, נכנסים! ✨" directly if default values are present, 
  64 |     // or we might need to select options. The login logic allows direct click for student.
  65 |     await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();
  66 | 
  67 |     // Student should see tasks, not admin or teacher panels
  68 |     // Waiting for workspace to load
  69 |     // Using a broad check
  70 |     await expect(page.getByText('ניהול כיתה')).not.toBeVisible();
  71 |     await expect(page.getByText('סקירה כללית')).not.toBeVisible();
  72 |   });
  73 | });
  74 | 
```