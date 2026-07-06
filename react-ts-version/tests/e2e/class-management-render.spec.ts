import { test, expect } from '@playwright/test';

test.describe('Class Management Rendering', () => {
  test('Class management grid renders properly without crashing', async ({ context, page }) => {
    // Disable driver.js tours
    await context.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    // Login Teacher
    await page.goto('/login');
    await page.getByRole('button', { name: 'מורה' }).click();
    await page.getByPlaceholder('תעודת זהות').fill('039604483');
    await page.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
    await page.getByRole('button', { name: 'התחבר למערכת' }).click();

    // Go to class management
    await page.getByRole('button', { name: 'ניהול כיתה ותלמידים' }).click();

    // Verify it doesn't crash (white screen). If it doesn't crash, the table headers should exist.
    await expect(page.getByText('קוד זיהוי (מערכת)').first()).toBeVisible();

    // Verify at least one student is rendered
    const rowLocator = page.locator('tbody tr').first();
    await expect(rowLocator).toBeVisible();

    const rows = page.locator('tbody tr');
    const count = await rows.count();
    
    // There should be at least 1 student generated or retrieved from Firebase
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
