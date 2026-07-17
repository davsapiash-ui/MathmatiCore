import { test, expect } from '@playwright/test';

async function dragAndDrop(page, sourceSelector, targetSelector) {
  const source = page.locator(sourceSelector).first();
  const target = page.locator(targetSelector);
  
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  
  if (!sourceBox || !targetBox) {
    throw new Error('Source or target bounding box not found');
  }
  
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  // Drag to 25px from the top of the column to avoid hitting stacked blocks
  const endY = targetBox.y + 25;
  
  await page.mouse.move(startX, startY);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(100);
}

test.describe('Silent Radar', () => {
  test('undo counts are recorded correctly in the workspace store', async ({ context, page }) => {
    // Disable driver.js tours
    await context.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    // Login Student
    await page.goto('/login');
    await page.getByRole('button', { name: 'תלמיד' }).click();

    // Fill student credentials
    await page.locator('select').first().selectOption({ index: 1 });
    await page.locator('select').nth(1).selectOption({ index: 1 });
    await page.getByPlaceholder('שם משתמש').fill('user5');
    await page.getByPlaceholder('סיסמה').fill('10203040');
    await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Wait for hub to load and navigate via Lesson 1 card
    await expect(page.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('שיעור 1: הכשרת חוקרים').first().click();
    await page.waitForURL('**/workspace*');

    // Find a block to drop and undo
    await page.waitForSelector('[id^="palette-units"]', { timeout: 5000 });
    
    const initialCount = await page.locator('#column-units [id^="col-units-"]').count();
    
    await dragAndDrop(page, '[id^="palette-units"]', '#column-units');

    // Wait for the drop to register in the DOM
    await expect(page.locator('#column-units [id^="col-units-"]')).toHaveCount(initialCount + 1, { timeout: 5000 });

    // Now click undo
    const undoBtn = page.locator('button[aria-label*="בטל"], button[title*="בטל"], [id="undo-btn"]').first();
    await expect(undoBtn).toBeVisible({ timeout: 5000 });
    await undoBtn.click();

    // Verify the count goes back to the initial count after undo
    await expect(page.locator('#column-units [id^="col-units-"]')).toHaveCount(initialCount, { timeout: 5000 });
    
    // We can expose the store to the window in DEV mode to check its state
    const undoCount = await page.evaluate(() => {
      // @ts-ignore
      return window.__wsStore?.getState().undoCount;
    });

    expect(undoCount).toBeGreaterThanOrEqual(1);
  });
});
