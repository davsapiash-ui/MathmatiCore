import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('ASD Addition Board E2E', () => {

  test('Teacher toggles ASD Addition Board, student sees it and can toggle it', async ({ browser }) => {
    // 1. Create teacher context and page
    const teacherContext = await browser.newContext();
    await teacherContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });
    const teacherPage = await teacherContext.newPage();

    teacherPage.on('console', msg => console.log('TEACHER CONSOLE:', msg.text()));
    teacherPage.on('pageerror', exception => console.log('TEACHER UNCAUGHT EXCEPTION:', exception.message));

    // Handle confirm dialogs during reset
    teacherPage.on('dialog', async dialog => {
      console.log(`Teacher dialog appeared: ${dialog.message()}`);
      await dialog.accept();
    });

    // 2. Log in as Teacher
    await teacherPage.goto(`${BASE_URL}/login`);
    await teacherPage.locator('button').filter({ hasText: 'מורה' }).click();
    await teacherPage.getByPlaceholder('תעודת זהות').fill('039604483');
    await teacherPage.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
    await teacherPage.locator('button').filter({ hasText: 'התחבר למערכת' }).click();
    await teacherPage.waitForURL('**/dashboard', { timeout: 15000 });

    // 3. Go to Class Management
    await teacherPage.locator('button').filter({ hasText: 'ניהול כיתה ותלמידים' }).click();
    await teacherPage.waitForTimeout(1000);

    // 4. Open CoPilot Modal for student user1
    const studentRow = teacherPage.locator('tr').filter({
      has: teacherPage.locator('td').filter({ hasText: /^user1$/ })
    });
    await studentRow.locator('button', { hasText: 'ניהול ובקרה' }).first().click();
    await teacherPage.waitForTimeout(1000);

    // Reset student to ensure a fresh workspace state (this will close the modal)
    console.log("Resetting student user1...");
    await teacherPage.locator('button', { hasText: 'אפס תלמיד' }).click();
    await teacherPage.waitForTimeout(2000);

    // Re-open CoPilot Modal for student user1 after it closes
    console.log("Re-opening modal to toggle board...");
    await studentRow.locator('button', { hasText: 'ניהול ובקרה' }).first().click();
    await teacherPage.waitForTimeout(1000);

    // 5. Toggle ASD addition board checkbox ON
    const checkbox = teacherPage.locator('label:has-text("לוח חיבור דיגיטלי") input[type="checkbox"]');
    console.log("Teacher: Checkbox checked before:", await checkbox.isChecked());
    await checkbox.setChecked(true);
    console.log("Teacher: Checkbox checked after:", await checkbox.isChecked());
    await teacherPage.waitForTimeout(2000);

    // Close teacher context to clean up
    await teacherContext.close();

    // 6. Create student context and page
    const studentContext = await browser.newContext();
    await studentContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });
    const studentPage = await studentContext.newPage();

    studentPage.on('console', msg => console.log('STUDENT CONSOLE:', msg.text()));
    studentPage.on('pageerror', exception => console.log('STUDENT UNCAUGHT EXCEPTION:', exception.message));

    // 7. Log in as Student (user1)
    await studentPage.goto(`${BASE_URL}/login`);
    await studentPage.locator('button').filter({ hasText: 'תלמיד' }).click();
    await studentPage.locator('select').first().selectOption({ index: 1 });
    await studentPage.locator('select').nth(1).selectOption({ index: 1 });
    await studentPage.getByPlaceholder('שם משתמש').fill('user1');
    await studentPage.getByPlaceholder('סיסמה').fill('10203040');
    await studentPage.locator('button').filter({ hasText: 'יאללה, נכנסים! ✨' }).click();
    await studentPage.waitForURL('**/hub', { timeout: 15000 });

    // 8. Go to Workspace
    await studentPage.locator('button, a').filter({ hasText: 'להמשך התרגול' }).first().click({ force: true });
    await studentPage.waitForURL('**/workspace*', { timeout: 15000 });
    await studentPage.waitForTimeout(2000);

    // Print store states for debugging
    const stateVal = await studentPage.evaluate(() => {
      const store = (window as any).useStore?.getState?.() || null;
      const studentId = store?.currentUserId;
      return {
        uid: studentId,
        firebaseLoaded: store?.firebaseLoaded,
        studentsKeys: store?.students ? Object.keys(store.students) : [],
        studentData: studentId && store?.students ? store.students[studentId] : null
      };
    });
    console.log("STUDENT DEBUG STORE:", JSON.stringify(stateVal, null, 2));

    // 9. Verify the "לוח עזר לחיבור" button is visible
    const boardBtn = studentPage.locator('button:has-text("לוח עזר לחיבור")');
    await expect(boardBtn).toBeVisible();

    // 10. Click the button to toggle open
    await boardBtn.click();
    await studentPage.waitForTimeout(1000);

    // Verify addition helper panel itself is now visible
    const helperHeading = studentPage.locator('h3:has-text("לוח עזר לחיבור")');
    await expect(helperHeading).toBeVisible();

    // 11. Click the button to toggle closed
    await boardBtn.click();
    await studentPage.waitForTimeout(1000);
    await expect(helperHeading).not.toBeVisible();

    // Cleanup student context
    await studentContext.close();
  });
});
