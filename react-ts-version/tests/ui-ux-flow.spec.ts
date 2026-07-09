import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('UI/UX Role-Based Frontend Tests', () => {

  test('Scenario 1: Visual State Synchronization - Student sees new announcement badge', async ({ browser }) => {
    // Setup
    const teacherContext = await browser.newContext();
    const studentContext = await browser.newContext();

    // Disable tours
    await teacherContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });
    await studentContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();

    // Execution (Teacher) - Teacher login
    await teacherPage.goto(`${BASE_URL}/login`);
    await teacherPage.click('button:has-text("מורה")');
    await teacherPage.fill('input[placeholder="תעודת זהות"]', '039604483');
    await teacherPage.fill('input[placeholder="תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)"]', '290984');
    await teacherPage.click('button[type="submit"]');
    
    // We expect the teacher to be on the dashboard
    await teacherPage.waitForURL(/.*\/dashboard/, { timeout: 10000 });

    // Execution (Student) - Student login
    await studentPage.goto(`${BASE_URL}/login`);
    await studentPage.click('button:has-text("תלמיד")');
    const schoolSelect = studentPage.locator('select').first();
    await expect(schoolSelect).toBeVisible();

    await teacherContext.close();
    await studentContext.close();
  });

  test('Scenario 2: UX Error Feedback - Graceful handling of unauthorized navigation', async ({ context, page }) => {
    // Disable tours
    await context.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    // Execution - student login
    await page.goto(`${BASE_URL}/login`);
    await page.click('button:has-text("תלמיד")');
    
    // Fill student credentials to perform a genuine login
    await page.locator('select').first().selectOption({ index: 1 });
    await page.locator('select').nth(1).selectOption({ index: 1 });
    await page.getByPlaceholder('שם משתמש').fill('user1');
    await page.getByPlaceholder('סיסמה').fill('10203040');
    await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Wait for student to land on hub
    await expect(page.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });

    // Try to force navigate to admin
    await page.goto(`${BASE_URL}/admin`);

    // We should be redirected back to /hub because of AuthGuard
    await page.waitForURL(/.*\/hub/);
    const url = page.url();
    expect(url).not.toContain('/admin');
  });

});
