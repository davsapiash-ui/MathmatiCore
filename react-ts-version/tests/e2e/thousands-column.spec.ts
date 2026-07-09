import { test, expect } from '@playwright/test';

test.describe('Thousands Column Visibility', () => {
  test('verify thousands column is dynamically hidden or shown based on pedagogical rule', async ({ browser }) => {
    // 1. Student Context
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();

    // Disable driver.js tours
    await studentContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    // Login Student
    await studentPage.goto('/login');
    await studentPage.getByRole('button', { name: 'תלמיד' }).click();

    // Fill student credentials - wait for select elements to be visible and populated
    await studentPage.locator('select').first().waitFor({ state: 'visible', timeout: 5000 });
    await studentPage.waitForTimeout(1000); // Give select options time to populate
    await studentPage.locator('select').first().selectOption({ index: 1 });
    await studentPage.locator('select').nth(1).selectOption({ index: 1 });
    await studentPage.getByPlaceholder('שם משתמש').fill('user1');
    await studentPage.getByPlaceholder('סיסמה').fill('10203040');
    await studentPage.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Wait for student hub to load
    await expect(studentPage.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });

    // Check Session 1
    await studentPage.goto('/workspace?meeting=1');
    await studentPage.waitForSelector('[id^="palette-units"]', { timeout: 5000 });
    // Verify Thousands column is NOT visible on the board (Grade 2 limitation)
    await expect(studentPage.locator('#column-thousands')).not.toBeVisible();
    await expect(studentPage.getByText('אלפים', { exact: true }).first()).not.toBeVisible();

    // Check Session 2
    await studentPage.goto('/workspace?meeting=2');
    await studentPage.waitForSelector('[id^="palette-units"]', { timeout: 5000 });
    // Verify Thousands column is NOT visible
    await expect(studentPage.locator('#column-thousands')).not.toBeVisible();

    // Note: Session 3 cannot be directly navigated if Teacher Approval Gate is locked,
    // so we test the 10,000 range visibility via the Teacher Projector.

    await studentContext.close();

    // 2. Teacher Context
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();

    // Disable driver.js tours
    await teacherContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    // Login Teacher
    await teacherPage.goto('/login');
    await teacherPage.getByRole('button', { name: 'מורה' }).click();
    await teacherPage.getByPlaceholder('תעודת זהות').fill('039604483');
    await teacherPage.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
    await teacherPage.getByRole('button', { name: 'התחבר למערכת' }).click();

    // Wait for Teacher Dashboard to fully load
    await expect(teacherPage.getByText('ניהול כיתה').first()).toBeVisible({ timeout: 10000 });

    // Go to Projector Sandbox
    await teacherPage.goto('/projector');
    await teacherPage.waitForSelector('[id^="palette-units"]', { timeout: 5000 });

    // Verify Thousands column is NOT visible under default range (1,000)
    await expect(teacherPage.locator('#column-thousands')).not.toBeVisible();

    // Switch range to 10,000 (Sessions 3-8)
    await teacherPage.getByRole('button', { name: 'תחום ה-10,000 (מפגשים 3-8)' }).click();
    await teacherPage.waitForTimeout(500);

    // Verify Thousands column IS visible now
    await expect(teacherPage.locator('#column-thousands')).toBeVisible();

    await teacherContext.close();
  });
});
