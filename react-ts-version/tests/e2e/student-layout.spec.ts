import { test, expect } from '@playwright/test';

test.describe('Student Workspace Layout', () => {
  test('Workspace has proper height constraints to prevent dual scrollbars', async ({ page }) => {
    await page.goto('/login');
    
    // Select Student Role
    await page.getByRole('button', { name: 'תלמיד' }).click();
    
    // Fill student credentials
    await page.locator('select').first().selectOption({ index: 1 });
    await page.locator('select').nth(1).selectOption({ index: 1 });
    await page.getByPlaceholder('שם משתמש').fill('user6');
    await page.getByPlaceholder('סיסמה').fill('10203040');
    
    await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Navigate to workspace from hub
    await page.getByRole('button', { name: 'להמשך התרגול' }).click();

    // Verify workspace layout doesn't overflow `100vh`
    await page.waitForURL('**/workspace*');
    
    // Evaluate if the document body or HTML has hidden scrollbars (or 100vh)
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const windowHeight = await page.evaluate(() => window.innerHeight);
    
    // UDL constraint: Keep layout strict
    // Typically we want body height to not drastically exceed window height without a specific internal scroll container
    expect(bodyHeight).toBeLessThanOrEqual(windowHeight + 100); 

    // Verify main components exist
    await expect(page.getByText('מפגש').first()).toBeVisible();
  });
});
