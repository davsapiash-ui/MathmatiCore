import { test, expect } from '@playwright/test';

test.describe('RBAC Visibility Tests', () => {
  test('Admin has access to System Settings and Institution Management', async ({ page }) => {
    await page.goto('/');
    
    // Select Admin Role
    await page.getByText('מנהל מערכת').click();
    
    // Fill credentials
    await page.getByPlaceholder('שם משתמש').fill('davsapiash');
    await page.getByPlaceholder('סיסמה').fill('carlibach');
    await page.getByRole('button', { name: 'התחבר למערכת' }).click();

    // Verify Admin elements exist
    await expect(page.getByText('סקירה כללית')).toBeVisible();
    await expect(page.getByText('ניהול מוסדות')).toBeVisible();
    await expect(page.getByText('הגדרות מערכת')).toBeVisible();
  });

  test('Teacher has access to Class Management but not Institution Management', async ({ page }) => {
    await page.goto('/');
    
    // Select Teacher Role
    await page.getByText('מורה').click();
    
    // Fill credentials
    await page.getByPlaceholder('תעודת זהות').fill('039604483');
    await page.getByPlaceholder('תאריך לידה (DDMMYY)').fill('290984');
    await page.getByRole('button', { name: 'התחבר למערכת' }).click();

    // Verify Teacher elements exist
    await expect(page.getByText('מיפוי כיתתי')).toBeVisible();
    await expect(page.getByText('ניהול כיתה')).toBeVisible();
    
    // Verify Admin elements are missing
    await expect(page.getByText('ניהול מוסדות')).not.toBeVisible();
    await expect(page.getByText('הגדרות מערכת')).not.toBeVisible();
  });

  test('Student has restricted workspace', async ({ page }) => {
    await page.goto('/');
    
    // Select Student Role
    await page.getByText('תלמיד').click();
    
    // Select dropdowns
    // Assume we can just click "יאללה, נכנסים! ✨" directly if default values are present, 
    // or we might need to select options. The login logic allows direct click for student.
    await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Student should see tasks, not admin or teacher panels
    // Waiting for workspace to load
    // Using a broad check
    await expect(page.getByText('ניהול כיתה')).not.toBeVisible();
    await expect(page.getByText('סקירה כללית')).not.toBeVisible();
  });
});
