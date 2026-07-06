# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat-sync.spec.ts >> Chat Synchronization >> Admin to Teacher real-time message delivery
- Location: tests\e2e\chat-sync.spec.ts:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Test Message 1783361916674')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('Test Message 1783361916674')

```

```yaml
- banner:
  - text: דשבורד מורה
  - button
  - text: דוד מורה
- main:
  - complementary:
    - text: M
    - link "מתמטיקאור ©":
      - /url: /
    - heading "תחנת עבודה מורה" [level=2]
    - button "ארגז חול למקרן":
      - img
      - text: ארגז חול למקרן
    - navigation:
      - text: פדגוגיה ומעקב
      - button "מיפוי כיתתי (Q-Matrix)"
      - button "דו\"חות אבחון אישיים"
      - button "אישור משימות AI"
      - button "ניהול כיתה ותלמידים"
      - text: תקשורת וצ'אט
      - button "צ'אט עם תלמידים"
      - button "צ'אט הנהלה"
    - button "התנתק"
  - main:
    - heading "הנהלה ותמיכה טכנית" [level=3]
    - text: זמין כעת לשיחה
    - paragraph: אין הודעות. שלח הודעה למנהל המערכת.
    - button "הקלטת שמע":
      - img
    - button "שלח תמונה":
      - img
    - textbox "הקלד הודעה למנהל המערכת..."
    - button [disabled]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Chat Synchronization', () => {
  4  |   test('Admin to Teacher real-time message delivery', async ({ browser }) => {
  5  |     // We need two isolated browser contexts to simulate two different users
  6  |     const adminContext = await browser.newContext();
  7  |     const teacherContext = await browser.newContext();
  8  | 
  9  |     // Disable driver.js tours for both contexts
  10 |     await adminContext.addInitScript(() => {
  11 |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  12 |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  13 |     });
  14 |     await teacherContext.addInitScript(() => {
  15 |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  16 |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  17 |     });
  18 | 
  19 |     const adminPage = await adminContext.newPage();
  20 |     const teacherPage = await teacherContext.newPage();
  21 | 
  22 |     // Login Admin
  23 |     await adminPage.goto('/login');
  24 |     await adminPage.getByRole('button', { name: 'מנהל מערכת' }).click();
  25 |     await adminPage.getByPlaceholder('שם משתמש').fill('davsapiash');
  26 |     await adminPage.getByPlaceholder('סיסמה').fill('carlibach');
  27 |     await adminPage.getByRole('button', { name: 'התחבר למערכת' }).click();
  28 | 
  29 |     // Login Teacher
  30 |     await teacherPage.goto('/login');
  31 |     await teacherPage.getByRole('button', { name: 'מורה' }).click();
  32 |     await teacherPage.getByPlaceholder('תעודת זהות').fill('039604483');
  33 |     await teacherPage.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
  34 |     await teacherPage.getByRole('button', { name: 'התחבר למערכת' }).click();
  35 | 
  36 |     // Teacher: Navigate to Class Management to ensure Dashboard is fully loaded
  37 |     await expect(teacherPage.getByText('ניהול כיתה').first()).toBeVisible();
  38 | 
  39 |     // Admin: Navigate to chat tab
  40 |     await adminPage.getByText('צ\'אט הודעות').click();
  41 |     
  42 |     // Admin: Select "דוד" (teacher_david)
  43 |     await adminPage.getByText('דוד').first().click();
  44 | 
  45 |     // Admin: Send a message
  46 |     const testMessage = `Test Message ${Date.now()}`;
  47 |     await adminPage.getByPlaceholder('הקלד הודעה...').fill(testMessage);
  48 |     await adminPage.getByPlaceholder('הקלד הודעה...').press('Enter');
  49 | 
  50 |     // Teacher: Verify notification badge or message directly in the UI
  51 |     await teacherPage.getByText('תקשורת וצ\'אט').click();
  52 |     await teacherPage.getByText('צ\'אט הנהלה').click();
  53 | 
  54 |     // Teacher: Look for the message from Admin
  55 |     // Since this is real-time via Firebase, it should appear quickly
> 56 |     await expect(teacherPage.getByText(testMessage)).toBeVisible({ timeout: 10000 });
     |                                                      ^ Error: expect(locator).toBeVisible() failed
  57 |   });
  58 | });
  59 | 
```