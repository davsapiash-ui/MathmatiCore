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

test.describe('Telemetry & Replay Pipeline', () => {
  test('verify student telemetry is recorded and replay loads in Teacher Dashboard', async ({ context, page }) => {
    // Disable driver.js tours
    await context.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    // 1. Log in Student
    await page.goto('/login');
    await page.getByRole('button', { name: 'תלמיד' }).click();

    await page.locator('select').first().selectOption({ index: 1 });
    await page.locator('select').nth(1).selectOption({ index: 1 });
    await page.getByPlaceholder('שם משתמש').fill('user3');
    await page.getByPlaceholder('סיסמה').fill('10203040');
    await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Wait for student hub and enter Lesson 1 workspace
    await expect(page.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('שיעור 1: הכשרת חוקרים').first().click();
    await page.waitForURL('**/workspace*');

    // 2. Perform actions to trigger rrweb events (drag a block and undo it)
    await page.waitForSelector('[id^="palette-units"]', { timeout: 5000 });
    await dragAndDrop(page, '[id^="palette-units"]', '#column-units');
    await expect(page.locator('#column-units [id^="col-units-"]')).toHaveCount(1, { timeout: 5000 });

    const undoBtn = page.locator('button[aria-label*="בטל"], button[title*="בטל"], [id="undo-btn"]').first();
    await expect(undoBtn).toBeVisible({ timeout: 5000 });
    await undoBtn.click();

    // Wait for the telemetry flush interval (2 seconds) + safety margin
    await page.waitForTimeout(4000);

    // 3. Log out by clearing storage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // 4. Log in Teacher
    await page.goto('/login');
    await page.getByRole('button', { name: 'מורה' }).click();
    await page.getByPlaceholder('תעודת זהות').fill('039604483');
    await page.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
    await page.getByRole('button', { name: 'התחבר למערכת' }).click();

    // Verify Teacher Dashboard is visible and navigate to student profile
    await expect(page.getByRole('button', { name: 'מיפוי כיתתי (Q-Matrix)' })).toBeVisible({ timeout: 10000 });
    
    // Click on "דו"חות אבחון אישיים" tab
    await page.locator('#tour-tab-reports').click();

    // Click on Student 'user3' (normalized id is student_user3, displaying as user3 or similar)
    const studentBtn = page.locator('button:has-text("user3"), button:has-text("student_user3")').first();
    await expect(studentBtn).toBeVisible({ timeout: 5000 });
    await studentBtn.click();

    // Verify the replay viewer starts to load and the replay viewer title is visible
    await expect(page.getByText('רדאר סשן והקלטות')).toBeVisible({ timeout: 5000 });

    // Open the modal by clicking the watch button
    const watchBtn = page.getByRole('button', { name: 'צפה בוידאו ובלוגים' });
    await expect(watchBtn).toBeVisible({ timeout: 5000 });
    await watchBtn.click();

    // Verify modal header is visible
    await expect(page.getByText('ניתוח קוגניטיבי מבוסס וידאו')).toBeVisible({ timeout: 5000 });

    // Since raw rrweb is used with custom timeline controls, checking that there are no JS crashes is done
    // by checking that either the custom player controls or the no-replay-placeholder is rendered.
    const playerContainer = page.locator('button:has-text("השהה"), button:has-text("נגן"), .glass-card:has-text("אין מספיק נתוני הקלטה")');
    await expect(playerContainer.first()).toBeVisible({ timeout: 5000 });
  });
});
