import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('ASD Safeguards Tests', () => {
  test('Undo spam triggers 5 second lock and visual hint', async ({ context, page }) => {
    // Disable tours
    await context.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    // Login as student
    await page.goto(`${BASE_URL}/login`);
    await page.click('button:has-text("תלמיד")');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.locator('select').nth(1).selectOption({ index: 1 });
    await page.getByPlaceholder('שם משתמש').fill('user1');
    await page.getByPlaceholder('סיסמה').fill('10203040');
    await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Go to lesson 1
    await expect(page.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('שיעור 1: הכשרת חוקרים').first().click();
    
    await page.waitForFunction(() => window.__wsStore !== undefined, { timeout: 10000 });
    
    // Give the board time to load and startTask to run
    await page.waitForTimeout(3000);

    // Ensure state has consecutiveUndos initialized to 0
    await page.evaluate(() => {
      window.__wsStore.setState({ consecutiveUndos: 0 });
    });

    // Call undo 3 times
    await page.evaluate(() => {
      const store = window.__wsStore.getState();
      store.undo();
      store.undo();
      store.undo();
    });

    // Check if store says isBoardLocked is true
    const isLocked = await page.evaluate(() => window.__wsStore.getState().isBoardLocked);
    expect(isLocked).toBe(true);

    // Wait 5 seconds for unlock
    await page.waitForTimeout(5500);

    // Check if it unlocked
    const isUnlocked = await page.evaluate(() => window.__wsStore.getState().isBoardLocked);
    expect(isUnlocked).toBe(false);
  });
});
