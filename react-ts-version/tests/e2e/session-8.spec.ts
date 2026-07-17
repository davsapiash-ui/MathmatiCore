import { test, expect } from '@playwright/test';

test.describe('Session 8 (Scaffold-Free E2E)', () => {
  test('verify session 8 disables place value board and number line and accepts direct input', async ({ browser, context, page }) => {
    test.setTimeout(60000);

    // Listen to console and page errors
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

    // Disable tours
    await context.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    // 1. Reset user15 first via Teacher Dashboard to make it idempotent
    const teacherContext = await browser.newContext();
    await teacherContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });
    const teacherPage = await teacherContext.newPage();
    teacherPage.on('dialog', async dialog => {
      await dialog.accept();
    });
    await teacherPage.goto('/login');
    await teacherPage.locator('button').filter({ hasText: 'מורה' }).click();
    await teacherPage.getByPlaceholder('תעודת זהות').fill('039604483');
    await teacherPage.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
    await teacherPage.locator('button').filter({ hasText: 'התחבר למערכת' }).click();
    await teacherPage.waitForURL('**/dashboard', { timeout: 15000 });
    await teacherPage.locator('button').filter({ hasText: 'ניהול כיתה ותלמידים' }).click();
    await teacherPage.waitForTimeout(1000);
    const studentRow = teacherPage.locator('tr').filter({
      has: teacherPage.locator('td').filter({ hasText: /^user15$/ })
    });
    await studentRow.locator('button', { hasText: 'ניהול ובקרה' }).first().click();
    await teacherPage.waitForTimeout(1000);
    await teacherPage.locator('button', { hasText: 'אפס תלמיד' }).click();
    await teacherPage.waitForTimeout(2000);
    await teacherContext.close();

    // Login Student
    await page.goto('/login');
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload();
    await page.getByRole('button', { name: 'תלמיד' }).click();

    // Fill credentials (using user15 to avoid database collision with other tests)
    await page.locator('select').first().waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('select').first().selectOption({ index: 1 });
    await page.locator('select').nth(1).selectOption({ index: 1 });
    await page.getByPlaceholder('שם משתמש').fill('user15');
    await page.getByPlaceholder('סיסמה').fill('10203040');
    await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Wait for student hub to load
    await expect(page.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });

    // Navigate to Session 8
    await page.goto('/workspace?meeting=8');
    await page.waitForURL('**/workspace*');

    // Wait for any potential forceReload reload to settle
    await page.waitForTimeout(5000);

    // Wait for store to be available
    await page.waitForFunction(() => (window as any).__wsStore !== undefined, { timeout: 10000 });

    // Force initialize Session 8 Task 0 directly in the store to bypass any persistent state
    await page.evaluate(() => {
      const store = (window as any).__wsStore;
      store.getState().initSession(8, false, null, 0);
    });

    console.log('--- TASK 1 START ---');
    // Verify place-value board is completely hidden/null
    await expect(page.locator('#tour-place-value-board')).not.toBeVisible();
    await expect(page.locator('[id^="palette-units"]')).not.toBeVisible();

    // Wait for inputs to be visible
    const inputThousands = page.locator('input[aria-label="ספרת האלפים בתשובה"]');
    await expect(inputThousands).toBeVisible({ timeout: 10000 });

    // Fill vertical addition answers (9100) using store evaluation directly
    await page.evaluate(() => {
      const store = (window as any).__wsStore;
      store.getState().setAnswerDigit('thousands', '9');
      store.getState().setAnswerDigit('hundreds', '1');
      store.getState().setAnswerDigit('tens', '0');
      store.getState().setAnswerDigit('units', '0');
    });

    const state1 = await page.evaluate(() => {
      const store = (window as any).__wsStore.getState();
      return {
        taskIdx: store.standardTaskIdx,
        answerDigits: store.answerDigits,
        canProceed: !document.querySelector('button[aria-label="עבור למשימה הבאה"]')?.hasAttribute('disabled')
      };
    });
    console.log('Task 1 State:', state1);

    const proceedBtn = page.getByRole('button', { name: 'עבור למשימה הבאה' });
    await expect(proceedBtn).toBeEnabled({ timeout: 5000 });
    await proceedBtn.click();

    // -- Task 2: 9,000 - 4,300 = 4,700 --
    console.log('--- TASK 2 START ---');
    // Wait for task 2 to load by waiting for taskIdx to change to 1
    await page.waitForFunction(() => {
      const store = (window as any).__wsStore;
      return store && store.getState().standardTaskIdx === 1;
    }, { timeout: 10000 });

    await page.locator('input[aria-label="ספרת האלפים בתשובה"]').waitFor({ state: 'visible', timeout: 5000 });

    // Fill via store
    await page.evaluate(() => {
      const store = (window as any).__wsStore;
      store.getState().setAnswerDigit('thousands', '4');
      store.getState().setAnswerDigit('hundreds', '7');
      store.getState().setAnswerDigit('tens', '0');
      store.getState().setAnswerDigit('units', '0');
    });

    const state2 = await page.evaluate(() => {
      const store = (window as any).__wsStore.getState();
      return {
        taskIdx: store.standardTaskIdx,
        answerDigits: store.answerDigits,
        canProceed: !document.querySelector('button[aria-label="עבור למשימה הבאה"]')?.hasAttribute('disabled')
      };
    });
    console.log('Task 2 State:', state2);

    await expect(proceedBtn).toBeEnabled({ timeout: 5000 });
    await proceedBtn.click();

    // -- Task 3: 8,750 --
    console.log('--- TASK 3 START ---');
    // Wait for task 3 to load by waiting for taskIdx to change to 2
    await page.waitForFunction(() => {
      const store = (window as any).__wsStore;
      return store && store.getState().standardTaskIdx === 2;
    }, { timeout: 10000 });

    // Verify number line track/slider is not visible
    await expect(page.locator('[role="slider"]')).not.toBeVisible();

    // Input the numeric answer directly
    const directInput = page.getByPlaceholder('הקלידו מספר...');
    await expect(directInput).toBeVisible({ timeout: 5000 });
    await directInput.fill('8750');

    const state3 = await page.evaluate(() => {
      const store = (window as any).__wsStore.getState();
      return {
        taskIdx: store.standardTaskIdx,
        numberLineValue: store.numberLineValue,
        canProceed: !document.querySelector('button[aria-label="עבור למשימה הבאה"]')?.hasAttribute('disabled')
      };
    });
    console.log('Task 3 State:', state3);

    // Click proceed to finish session 8
    await expect(proceedBtn).toBeEnabled({ timeout: 5000 });
    await proceedBtn.click();

    // Verify redirect back to student hub after completion (sessionDone)
    await page.waitForURL('**/hub', { timeout: 10000 });
    await expect(page.getByText('מפת המסע שלך')).toBeVisible({ timeout: 5000 });
  });
});
