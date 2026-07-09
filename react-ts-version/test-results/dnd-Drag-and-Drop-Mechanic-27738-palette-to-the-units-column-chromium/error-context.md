# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dnd.spec.ts >> Drag and Drop Mechanics >> student can drag a unit block from the palette to the units column
- Location: tests\e2e\dnd.spec.ts:32:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('[id^="palette-units"]') to be visible

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | async function dragAndDrop(page, sourceSelector, targetSelector) {
  4  |   const source = page.locator(sourceSelector).first();
  5  |   const target = page.locator(targetSelector);
  6  |   
  7  |   const sourceBox = await source.boundingBox();
  8  |   const targetBox = await target.boundingBox();
  9  |   
  10 |   if (!sourceBox || !targetBox) {
  11 |     throw new Error('Source or target bounding box not found');
  12 |   }
  13 |   
  14 |   const startX = sourceBox.x + sourceBox.width / 2;
  15 |   const startY = sourceBox.y + sourceBox.height / 2;
  16 |   const endX = targetBox.x + targetBox.width / 2;
  17 |   // Drag to 25px from the top of the column to avoid hitting stacked blocks
  18 |   const endY = targetBox.y + 25;
  19 |   
  20 |   await page.mouse.move(startX, startY);
  21 |   await page.waitForTimeout(100);
  22 |   await page.mouse.down();
  23 |   await page.waitForTimeout(200);
  24 |   await page.mouse.move(endX, endY, { steps: 10 });
  25 |   await page.waitForTimeout(200);
  26 |   await page.mouse.up();
  27 |   await page.mouse.move(0, 0);
  28 |   await page.waitForTimeout(100);
  29 | }
  30 | 
  31 | test.describe('Drag and Drop Mechanics', () => {
  32 |   test('student can drag a unit block from the palette to the units column', async ({ context, page }) => {
  33 |     // Disable driver.js tours
  34 |     await context.addInitScript(() => {
  35 |       window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
  36 |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  37 |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  38 |     });
  39 | 
  40 |     // Login Student
  41 |     await page.goto('/login');
  42 |     await page.getByRole('button', { name: 'תלמיד' }).click();
  43 | 
  44 |     // Fill student credentials
  45 |     await page.locator('select').first().selectOption({ index: 1 });
  46 |     await page.locator('select').nth(1).selectOption({ index: 1 });
  47 |     await page.getByPlaceholder('שם משתמש').fill('user1');
  48 |     await page.getByPlaceholder('סיסמה').fill('10203040');
  49 |     await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();
  50 | 
  51 |     // Wait for hub to load and navigate via Lesson 1 card
  52 |     await expect(page.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });
  53 |     await page.getByText('שיעור 1: הכשרת חוקרים').first().click();
  54 |     await page.waitForURL('**/workspace*');
  55 | 
> 56 |     await page.waitForSelector('[id^="palette-units"]', { timeout: 5000 });
     |                ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
  57 |     
  58 |     // Perform the drag and drop using custom helper
  59 |     await dragAndDrop(page, '[id^="palette-units"]', '#column-units');
  60 | 
  61 |     // Verify the drop registered (e.g. the column count updated or a block appeared inside)
  62 |     await expect(page.locator('#column-units [id^="col-units-"]').first()).toBeVisible({ timeout: 5000 });
  63 |   });
  64 | });
  65 | 
```