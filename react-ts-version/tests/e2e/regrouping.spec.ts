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

test.describe('Regrouping State Mechanics', () => {
  test('verify no auto-regrouping and verify manual regrouping', async ({ context, page }) => {
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
    await page.getByPlaceholder('שם משתמש').fill('user1');
    await page.getByPlaceholder('סיסמה').fill('10203040');
    await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Wait for hub to load and navigate via Lesson 1 card
    await expect(page.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('שיעור 1: הכשרת חוקרים').first().click();
    await page.waitForURL('**/workspace*');

    // Wait for the workspace to load
    await page.waitForSelector('[id^="palette-units"]', { timeout: 5000 });

    // Place 10 units blocks via the store directly
    await page.evaluate(() => {
      const store = (window as any).__wsStore;
      if (!store) {
        throw new Error('Workspace store not found on window');
      }
      for (let i = 0; i < 10; i++) {
        store.getState().applyDrop({
          source: 'palette',
          sourcePlace: 'units',
          target: { kind: 'column', place: 'units' }
        });
      }
    });

    // Verify auto-regrouping does NOT happen: units count is exactly 10 in the DOM
    const unitsColumnBlocks = page.locator('#column-units [id^="col-units-"]');
    await expect(unitsColumnBlocks).toHaveCount(10, { timeout: 5000 });

    // Verify tens column is empty
    const tensCountBeforeRegroup = await page.locator('#column-tens [id^="col-tens-"]').count();
    expect(tensCountBeforeRegroup).toBe(0);

    // Drag one unit block from units column to tens column to trigger manual regrouping
    await dragAndDrop(page, '#column-units [id^="col-units-"]', '#column-tens');

    // Wait for the units count to reset to 0 in the DOM and tens to become 1
    await expect(page.locator('#column-units [id^="col-units-"]')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('#column-tens [id^="col-tens-"]')).toHaveCount(1, { timeout: 5000 });
  });
});
