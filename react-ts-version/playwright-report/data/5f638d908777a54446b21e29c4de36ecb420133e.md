# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: class-management-render.spec.ts >> Class Management Rendering >> Class management grid renders properly without crashing
- Location: tests\e2e\class-management-render.spec.ts:4:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'ניהול כיתה ותלמידים' })

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