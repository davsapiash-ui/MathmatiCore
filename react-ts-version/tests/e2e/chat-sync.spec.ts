import { test, expect } from '@playwright/test';

test.describe('Chat Synchronization', () => {
  test('Admin to Teacher real-time message delivery', async ({ context }) => {
    // Create two separate pages for two different roles
    const adminPage = await context.newPage();
    const teacherPage = await context.newPage();

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
    await adminPage.getByText('תקשורת וצ\'אט').click();
    
    // Admin: Select "דוד" (teacher_david)
    await adminPage.getByText('דוד').first().click();

    // Admin: Send a message
    const testMessage = `Test Message ${Date.now()}`;
    await adminPage.getByPlaceholder('הקלד הודעה...').fill(testMessage);
    await adminPage.getByRole('button', { name: /Send|שלח/i }).click();

    // Teacher: Verify notification badge or message directly in the UI
    await teacherPage.getByText('צ\'אט והודעות').click();

    // Teacher: Look for the message from Admin
    // Since this is real-time via Firebase, it should appear quickly
    await expect(teacherPage.getByText(testMessage)).toBeVisible({ timeout: 10000 });
  });
});
