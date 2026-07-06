import { test, expect } from '@playwright/test';

test.describe('Chat Synchronization', () => {
  test('Admin to Teacher real-time message delivery', async ({ browser }) => {
    // We need two isolated browser contexts to simulate two different users
    const adminContext = await browser.newContext();
    const teacherContext = await browser.newContext();

    // Disable driver.js tours for both contexts
    await adminContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });
    await teacherContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    const adminPage = await adminContext.newPage();
    const teacherPage = await teacherContext.newPage();

    // Login Admin
    await adminPage.goto('/login');
    await adminPage.getByRole('button', { name: 'מנהל מערכת' }).click();
    await adminPage.getByPlaceholder('שם משתמש').fill('davsapiash');
    await adminPage.getByPlaceholder('סיסמה').fill('carlibach');
    await adminPage.getByRole('button', { name: 'התחבר למערכת' }).click();

    // Login Teacher
    await teacherPage.goto('/login');
    await teacherPage.getByRole('button', { name: 'מורה' }).click();
    await teacherPage.getByPlaceholder('תעודת זהות').fill('039604483');
    await teacherPage.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
    await teacherPage.getByRole('button', { name: 'התחבר למערכת' }).click();

    // Teacher: Navigate to Class Management to ensure Dashboard is fully loaded
    await expect(teacherPage.getByText('ניהול כיתה').first()).toBeVisible();

    // Admin: Navigate to chat tab
    await adminPage.getByText('צ\'אט הודעות').click();
    
    // Admin: Select "דוד" (teacher_david)
    await adminPage.getByText('דוד').first().click();

    // Admin: Send a message
    const testMessage = `Test Message ${Date.now()}`;
    await adminPage.getByPlaceholder('הקלד הודעה...').fill(testMessage);
    await adminPage.getByPlaceholder('הקלד הודעה...').press('Enter');

    // Teacher: Verify notification badge or message directly in the UI
    await teacherPage.getByText('תקשורת וצ\'אט').click();
    await teacherPage.getByText('צ\'אט הנהלה').click();

    // Teacher: Look for the message from Admin
    // Since this is real-time via Firebase, it should appear quickly
    await expect(teacherPage.getByText(testMessage)).toBeVisible({ timeout: 10000 });
  });
});
