# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-ux-flow.spec.ts >> UI/UX Role-Based Frontend Tests >> Scenario 2: UX Error Feedback - Graceful handling of unauthorized navigation
- Location: tests\ui-ux-flow.spec.ts:36:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "https://mathimaticore.web.app/admin"
  navigated to "https://mathimaticore.web.app/login"
============================================================
```

# Page snapshot

```yaml
- main [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e7]: מ
    - generic [ref=e8]:
      - heading "מתמטיקאור ©" [level=1] [ref=e9]
      - paragraph [ref=e10]: סביבת למידה מוגברת טכנולוגיה
  - generic [ref=e12]:
    - heading "שלום! מי נכנס היום?" [level=2] [ref=e13]
    - paragraph [ref=e14]: בחר את סוג הכניסה שלך
    - generic [ref=e15]:
      - button "תלמיד" [ref=e16] [cursor=pointer]:
        - generic [ref=e17]: 🎓
        - generic [ref=e18]: תלמיד
      - button "מורה" [ref=e19] [cursor=pointer]:
        - generic [ref=e20]: 📊
        - generic [ref=e21]: מורה
      - button "מנהל מערכת" [ref=e22] [cursor=pointer]:
        - generic [ref=e23]: ⚙️
        - generic [ref=e24]: מנהל מערכת
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const BASE_URL = 'https://mathimaticore.web.app';
  4  | 
  5  | test.describe('UI/UX Role-Based Frontend Tests', () => {
  6  | 
  7  |   test('Scenario 1: Visual State Synchronization - Student sees new announcement badge', async ({ browser }) => {
  8  |     // Setup
  9  |     const teacherContext = await browser.newContext();
  10 |     const studentContext = await browser.newContext();
  11 |     const teacherPage = await teacherContext.newPage();
  12 |     const studentPage = await studentContext.newPage();
  13 | 
  14 |     // Execution (Teacher) - Teacher login
  15 |     await teacherPage.goto(`${BASE_URL}/login`);
  16 |     await teacherPage.click('button:has-text("מורה")');
  17 |     await teacherPage.fill('input[placeholder="תעודת זהות"]', '039604483');
  18 |     await teacherPage.fill('input[placeholder="תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)"]', '290984');
  19 |     await teacherPage.click('button[type="submit"]');
  20 |     
  21 |     // We expect the teacher to be on the dashboard
  22 |     await teacherPage.waitForURL(/.*\/dashboard/, { timeout: 10000 });
  23 | 
  24 |     // Execution (Student) - Student login
  25 |     await studentPage.goto(`${BASE_URL}/login`);
  26 |     await studentPage.click('button:has-text("תלמיד")');
  27 |     // Using test specific data - we assume the select has specific options.
  28 |     // However, since we don't have exactly the same options right now, let's just make sure we check visibility
  29 |     const schoolSelect = studentPage.locator('select').first();
  30 |     await expect(schoolSelect).toBeVisible();
  31 | 
  32 |     await teacherContext.close();
  33 |     await studentContext.close();
  34 |   });
  35 | 
  36 |   test('Scenario 2: UX Error Feedback - Graceful handling of unauthorized navigation', async ({ page }) => {
  37 |     // Execution - student login
  38 |     await page.goto(`${BASE_URL}/login`);
  39 |     await page.click('button:has-text("תלמיד")');
  40 |     const schoolSelect = page.locator('select').first();
  41 |     await expect(schoolSelect).toBeVisible();
  42 | 
  43 |     // Try to force navigate to admin
  44 |     await page.goto(`${BASE_URL}/admin`);
  45 | 
  46 |     // We should be redirected back to /hub because of AuthGuard
> 47 |     await page.waitForURL(/.*\/hub/);
     |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  48 |     const url = page.url();
  49 |     expect(url).not.toContain('/admin');
  50 |   });
  51 | 
  52 | });
  53 | 
```