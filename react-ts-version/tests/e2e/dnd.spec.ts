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

test.describe('Drag and Drop Mechanics', () => {
  test('student can drag a unit block from the palette to the units column', async ({ context, page }) => {
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

    await page.waitForSelector('[id^="palette-units"]', { timeout: 5000 });
    
    // Perform the drag and drop using custom helper
    await dragAndDrop(page, '[id^="palette-units"]', '#column-units');

    // Verify the drop registered (e.g. the column count updated or a block appeared inside)
    await expect(page.locator('#column-units [id^="col-units-"]').first()).toBeVisible({ timeout: 5000 });
  });
});
