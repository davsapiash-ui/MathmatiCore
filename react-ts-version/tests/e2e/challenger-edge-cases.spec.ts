import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Challenger Edge Cases', () => {

  test('Teacher toggles addition board multiple times, student UI reacts dynamically, student interacts with board', async ({ browser }) => {
    test.setTimeout(60000);
    // 1. Create teacher and student contexts in parallel
    const teacherContext = await browser.newContext();
    await teacherContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });
    const teacherPage = await teacherContext.newPage();
    
    // Accept dialogs on teacher page (e.g. reset alert)
    teacherPage.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 2. Log in as Teacher
    await teacherPage.goto(`${BASE_URL}/login`);
    await teacherPage.locator('button').filter({ hasText: 'מורה' }).click();
    await teacherPage.getByPlaceholder('תעודת זהות').fill('039604483');
    await teacherPage.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
    await teacherPage.locator('button').filter({ hasText: 'התחבר למערכת' }).click();
    await teacherPage.waitForURL('**/dashboard', { timeout: 15000 });

    // Go to Class Management
    await teacherPage.locator('button').filter({ hasText: 'ניהול כיתה ותלמידים' }).click();
    await teacherPage.waitForTimeout(1000);

    const studentRow = teacherPage.locator('tr').filter({
      has: teacherPage.locator('td').filter({ hasText: /^user1$/ })
    });
    await studentRow.locator('button', { hasText: 'ניהול ובקרה' }).first().click();
    await teacherPage.waitForTimeout(1000);

    // Reset student for clean slate
    await teacherPage.locator('button', { hasText: 'אפס תלמיד' }).click();
    await teacherPage.waitForTimeout(2000);

    // Re-open CoPilot Modal
    await studentRow.locator('button', { hasText: 'ניהול ובקרה' }).first().click();
    await teacherPage.waitForTimeout(1000);

    const checkbox = teacherPage.locator('label:has-text("לוח חיבור דיגיטלי") input[type="checkbox"]');

    // Make sure it starts as disabled
    await checkbox.setChecked(false);
    await teacherPage.waitForTimeout(1000);

    // 3. Log in Student (user1) in a separate context
    const studentContext = await browser.newContext();
    await studentContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });
    const studentPage = await studentContext.newPage();

    await studentPage.goto(`${BASE_URL}/login`);
    await studentPage.locator('button').filter({ hasText: 'תלמיד' }).click();
    await studentPage.locator('select').first().selectOption({ index: 1 });
    await studentPage.locator('select').nth(1).selectOption({ index: 1 });
    await studentPage.getByPlaceholder('שם משתמש').fill('user1');
    await studentPage.getByPlaceholder('סיסמה').fill('10203040');
    await studentPage.locator('button').filter({ hasText: 'יאללה, נכנסים! ✨' }).click();
    await studentPage.waitForURL('**/hub', { timeout: 15000 });

    // Go to Workspace
    await studentPage.locator('button, a').filter({ hasText: 'להמשך התרגול' }).first().click({ force: true });
    await studentPage.waitForURL('**/workspace*', { timeout: 15000 });
    await studentPage.waitForTimeout(6000);

    // Verify Addition Board button is NOT visible initially
    const boardBtn = studentPage.locator('button:has-text("לוח עזר לחיבור")');
    await expect(boardBtn).not.toBeVisible();

    // 4. Toggle board ON from Teacher Dashboard
    console.log("Toggling addition board ON...");
    await checkbox.setChecked(true);
    await teacherPage.waitForTimeout(2000); // Allow time for sync

    // Verify button is now visible for student
    await expect(boardBtn).toBeVisible({ timeout: 5000 });

    // 5. Toggle board OFF from Teacher Dashboard
    console.log("Toggling addition board OFF...");
    await checkbox.setChecked(false);
    await teacherPage.waitForTimeout(2000);

    // Verify button is hidden for student
    await expect(boardBtn).not.toBeVisible({ timeout: 5000 });

    // 6. Toggle board ON again
    console.log("Toggling addition board ON again...");
    await checkbox.setChecked(true);
    await teacherPage.waitForTimeout(2000);
    await expect(boardBtn).toBeVisible({ timeout: 5000 });

    // 7. Click to open board and interact with cells
    await boardBtn.click();
    await studentPage.waitForTimeout(1000);

    // Verify the board header is visible
    const helperHeading = studentPage.locator('h3:has-text("לוח עזר לחיבור")');
    await expect(helperHeading).toBeVisible();

    // Locate the cell for 7 + 8 (row 7, col 8)
    // Row 7 is R=7, so it's the 8th row in tbody (0-indexed index 7)
    // Col 8 is C=8, so it's the 9th td in that row (0-indexed index 8, since first td is row header)
    const rowEl = studentPage.locator('tbody tr').nth(7);
    const cellEl = rowEl.locator('td').nth(9); // index 0 is row header, 1-8 are cols 0-7, index 9 is col 8

    // Hover over the cell and verify sum text
    await cellEl.hover();
    await studentPage.waitForTimeout(500);
    
    // The active sum div should display 7 + 8 = 15
    const sumBanner = studentPage.locator('div:has-text("7 + 8 = 15")').last();
    await expect(sumBanner).toBeVisible();

    // Click the cell and verify it has the clicked orange/clicked style
    await cellEl.click();
    await studentPage.waitForTimeout(500);
    await expect(cellEl).toHaveClass(/bg-orange-500/);

    // Cleanup
    await studentContext.close();
    await teacherContext.close();
  });

  test('Session 8 Scaffold-Free incorrect answers and edge cases', async ({ browser }) => {
    test.setTimeout(60000);
    // 1. Reset user15 first via Teacher Dashboard
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
    await teacherPage.goto(`${BASE_URL}/login`);
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

    // 2. Login Student (user15)
    const studentContext = await browser.newContext();
    await studentContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`${BASE_URL}/login`);
    await studentPage.getByRole('button', { name: 'תלמיד' }).click();
    await studentPage.locator('select').first().selectOption({ index: 1 });
    await studentPage.locator('select').nth(1).selectOption({ index: 1 });
    await studentPage.getByPlaceholder('שם משתמש').fill('user15');
    await studentPage.getByPlaceholder('סיסמה').fill('10203040');
    await studentPage.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();
    await studentPage.waitForURL('**/hub', { timeout: 15000 });

    // Go to Session 8
    await studentPage.goto(`${BASE_URL}/workspace?meeting=8`);
    await studentPage.waitForURL('**/workspace*');
    await studentPage.waitForTimeout(6000); // Increased wait to settle reload

    // Force initialize Session 8 Task 0 directly in the store to bypass any persistent state
    await studentPage.waitForFunction(() => (window as any).__wsStore !== undefined, { timeout: 10000 });
    await studentPage.evaluate(() => {
      const store = (window as any).__wsStore;
      store.getState().initSession(8, false, null, 0);
    });
    await studentPage.waitForTimeout(1000);

    // 3. Verify standard components are hidden
    await expect(studentPage.locator('#tour-place-value-board')).not.toBeVisible();
    await expect(studentPage.locator('[id^="palette-units"]')).not.toBeVisible();

    const proceedBtn = studentPage.getByRole('button', { name: 'עבור למשימה הבאה' });

    // -- Task 1: 6,400 + 2,700 = 9,100 --
    console.log("Task 1: Testing incorrect answer...");
    // Fill a wrong answer via store (1234)
    await studentPage.evaluate(() => {
      const store = (window as any).__wsStore;
      store.getState().setAnswerDigit('thousands', '1');
      store.getState().setAnswerDigit('hundreds', '2');
      store.getState().setAnswerDigit('tens', '3');
      store.getState().setAnswerDigit('units', '4');
    });

    await expect(proceedBtn).toBeEnabled({ timeout: 5000 });
    await proceedBtn.click();

    // Verify error toast. It contains the new generic text
    const errorToast = studentPage.locator('div.fixed[role="status"]');
    await expect(errorToast).toContainText('התשובה שהזנתם אינה נכונה. בדקו שוב!');
    console.log("UX Inconsistency verified: Generic toast message shown for incorrect answer in Session 8.");

    // Fill the correct answer (9100)
    await studentPage.evaluate(() => {
      const store = (window as any).__wsStore;
      store.getState().setAnswerDigit('thousands', '9');
      store.getState().setAnswerDigit('hundreds', '1');
      store.getState().setAnswerDigit('tens', '0');
      store.getState().setAnswerDigit('units', '0');
    });
    await studentPage.waitForTimeout(1000);
    await expect(proceedBtn).toBeEnabled({ timeout: 5000 });
    await proceedBtn.click();

    // -- Task 2: 9,000 - 4,300 = 4,700 --
    console.log("Task 2: Testing incorrect answer...");
    await studentPage.waitForFunction(() => {
      const store = (window as any).__wsStore;
      return store && store.getState().standardTaskIdx === 1;
    }, { timeout: 15000 });

    // Fill incorrect answer
    await studentPage.evaluate(() => {
      const store = (window as any).__wsStore;
      store.getState().setAnswerDigit('thousands', '1');
      store.getState().setAnswerDigit('hundreds', '1');
      store.getState().setAnswerDigit('tens', '1');
      store.getState().setAnswerDigit('units', '1');
    });
    await expect(proceedBtn).toBeEnabled({ timeout: 5000 });
    await proceedBtn.click();
    await expect(errorToast).toContainText('התשובה שהזנתם אינה נכונה. בדקו שוב!');

    // Fill correct answer
    await studentPage.evaluate(() => {
      const store = (window as any).__wsStore;
      store.getState().setAnswerDigit('thousands', '4');
      store.getState().setAnswerDigit('hundreds', '7');
      store.getState().setAnswerDigit('tens', '0');
      store.getState().setAnswerDigit('units', '0');
    });
    await studentPage.waitForTimeout(1000);
    await expect(proceedBtn).toBeEnabled({ timeout: 5000 });
    await proceedBtn.click();

    // -- Task 3: Number Line Input 8750 --
    console.log("Task 3: Testing wrong direct input...");
    await studentPage.waitForFunction(() => {
      const store = (window as any).__wsStore;
      return store && store.getState().standardTaskIdx === 2;
    }, { timeout: 15000 });

    const directInput = studentPage.getByPlaceholder('הקלידו מספר...');
    await expect(directInput).toBeVisible();

    // Enter wrong answer: 500
    await directInput.fill('500');
    await studentPage.waitForTimeout(1000);
    await expect(proceedBtn).toBeEnabled({ timeout: 5000 });
    await proceedBtn.click();
    
    // Verify wrong answer toast: "התשובה שהזנתם אינה נכונה." (no niqqud)
    await expect(errorToast).toContainText('התשובה שהזנתם אינה נכונה.');

    // Enter correct answer: 8750
    await directInput.fill('8750');
    await studentPage.waitForTimeout(1000);
    await expect(proceedBtn).toBeEnabled({ timeout: 5000 });
    await proceedBtn.click();

    // Wait for redirect to student hub
    await studentPage.waitForURL('**/hub', { timeout: 10000 });
    await expect(studentPage.getByText('מפת המסע שלך')).toBeVisible();

    await studentContext.close();
  });
});
