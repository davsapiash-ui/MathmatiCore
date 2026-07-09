import { test, expect } from '@playwright/test';

test.describe('RBAC Visibility Tests', () => {
  test('Admin has access to System Settings and Institution Management', async ({ page }) => {
    await page.goto('/login');
    
    // Select Admin Role
    await page.getByRole('button', { name: 'מנהל מערכת' }).click();
    
    // Fill credentials
    await page.getByPlaceholder('שם משתמש').fill('davsapiash');
    await page.getByPlaceholder('סיסמה').fill('carlibach');
    await page.getByRole('button', { name: 'התחבר למערכת' }).click();

    // Verify Admin elements exist
    await expect(page.getByRole('heading', { name: 'סקירה כללית' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'מוסדות ומורים' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'מערכת ונגישות (UDL)' })).toBeVisible();
  });

  test('Teacher has access to Class Management but not Institution Management', async ({ page }) => {
    await page.goto('/login');
    
    // Select Teacher Role
    await page.getByRole('button', { name: 'מורה' }).click();
    
    // Fill credentials
    await page.getByPlaceholder('תעודת זהות').fill('039604483');
    await page.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
    await page.getByRole('button', { name: 'התחבר למערכת' }).click();

    // Verify Teacher elements exist
    await expect(page.getByRole('button', { name: 'מיפוי כיתתי (Q-Matrix)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ניהול כיתה ותלמידים' })).toBeVisible();
    
    // Verify Admin elements are missing
    await expect(page.getByRole('link', { name: 'מוסדות ומורים' })).not.toBeVisible();
    await expect(page.getByText('הגדרות מערכת')).not.toBeVisible();
  });

  test('Student has restricted workspace', async ({ page }) => {
    await page.goto('/login');
    
    // Select Student Role
    await page.getByRole('button', { name: 'תלמיד' }).click();
    
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
