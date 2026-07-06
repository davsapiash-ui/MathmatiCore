import { test, expect } from '@playwright/test';

test.describe('Student Workspace Layout', () => {
  test('Workspace has proper height constraints to prevent dual scrollbars', async ({ page }) => {
    await page.goto('/');
    
    // Select Student Role
    await page.getByText('תלמיד').click();
    await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Verify workspace layout doesn't overflow `100vh`
    await page.waitForURL('**/workspace');
    
    // Evaluate if the document body or HTML has hidden scrollbars (or 100vh)
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const windowHeight = await page.evaluate(() => window.innerHeight);
    
    // UDL constraint: Keep layout strict
    // Typically we want body height to not drastically exceed window height without a specific internal scroll container
    expect(bodyHeight).toBeLessThanOrEqual(windowHeight + 100); 

    // Verify main components exist
    await expect(page.getByText('משימה')).first().toBeVisible();
  });
});
