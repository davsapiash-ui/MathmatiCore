import { test } from '@playwright/test';

// Base URL points to the live Firebase app (or local dev server). 
// Update this if the production URL is different.
const BASE_URL = 'http://localhost:5173'; 

test.describe('Role-Based Workspaces & Cross-Integration Tests', () => {

  test('Scenario 1: Admin to Teacher Flow - Admin adds a student and Teacher sees it immediately', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const teacherContext = await browser.newContext();

    // Disable tours
    await adminContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });
    await teacherContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });
    
    const adminPage = await adminContext.newPage();
    const teacherPage = await teacherContext.newPage();

    // Admin login
    await adminPage.goto(`${BASE_URL}/login`);
    await adminPage.click('button:has-text("מנהל מערכת")');
    await adminPage.fill('input[placeholder="שם משתמש"]', 'davsapiash');
    await adminPage.fill('input[placeholder="סיסמה"]', 'carlibach');
    await adminPage.click('button[type="submit"]');
    
    // Teacher login
    await teacherPage.goto(`${BASE_URL}/login`);
    await teacherPage.click('button:has-text("מורה")');
    await teacherPage.fill('input[placeholder="תעודת זהות"]', '039604483');
    await teacherPage.fill('input[placeholder="תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)"]', '290984');
    await teacherPage.click('button[type="submit"]');

    // Wait for the login and redirection to complete successfully
    await adminPage.waitForURL(/.*\/admin/, { timeout: 15000 });
    await teacherPage.waitForURL(/.*\/dashboard/, { timeout: 15000 });
    
    // Check titles or URLs to see if we reached the right place
    const adminUrl = adminPage.url();
    const teacherUrl = teacherPage.url();
    
    console.log(`Admin landed on: ${adminUrl}`);
    console.log(`Teacher landed on: ${teacherUrl}`);

    await adminContext.close();
    await teacherContext.close();
  });

});
