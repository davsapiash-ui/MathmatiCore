import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Massive Multi-User E2E Simulation', () => {

  test('Simulate 5 Students and 1 Teacher interacting in real-time', async ({ browser }) => {
    test.setTimeout(120000); // 2 minutes for this massive test

    // Create 6 isolated browser contexts
    const teacherContext = await browser.newContext();
    await teacherContext.addInitScript(() => {
      (window as any).__E2E_BYPASS_TOUR__ = true;
      });

    const studentContexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);

    for (const ctx of studentContexts) {
      await ctx.addInitScript(() => {
        (window as any).__E2E_BYPASS_TOUR__ = true;
        });
    }

    const teacherPage = await teacherContext.newPage();
    const studentPages = await Promise.all(studentContexts.map(c => c.newPage()));

    // Login Teacher via UI
    console.log("👩‍🏫 Logging in Teacher...");
    await teacherPage.goto(`${BASE_URL}/login`);
    await teacherPage.locator('button').filter({ hasText: 'מורה' }).click();
    await teacherPage.getByPlaceholder('תעודת זהות').fill('1002220159');
    await teacherPage.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
    await teacherPage.locator('button').filter({ hasText: 'התחבר למערכת' }).click();
    await teacherPage.waitForURL('**/dashboard');
    await teacherPage.waitForLoadState('networkidle');

    // Login 5 Students via UI
    console.log("🎓 Logging in 5 Students...");
    for (let i = 0; i < 5; i++) {
      await studentPages[i].goto(`${BASE_URL}/login`);
      await studentPages[i].locator('button').filter({ hasText: 'תלמיד' }).click();
      await studentPages[i].locator('select').first().selectOption({ index: 1 }); // Pick first school
      await studentPages[i].locator('select').nth(1).selectOption({ index: 1 }); // Pick first class
      await studentPages[i].getByPlaceholder('שם משתמש').fill(`user${i + 1}`);
      await studentPages[i].getByPlaceholder('סיסמה').fill('10203040');
      await studentPages[i].locator('button').filter({ hasText: 'יאללה, נכנסים! ✨' }).click();
      await studentPages[i].waitForURL('**/hub');
      // Navigate to Workspace
      await studentPages[i].locator('button, a').filter({ hasText: 'להמשך התרגול' }).first().click({ force: true });
      await studentPages[i].waitForURL('**/workspace*');
    }

    await Promise.all(studentPages.map(p => p.waitForLoadState('networkidle')));
    console.log("✅ All users logged in. Beginning simulation...");

    // Student 1 & 2: Good students, click around normally
    console.log("▶️ Students 1 & 2 interacting...");
    await studentPages[0].mouse.click(500, 500);
    await studentPages[1].mouse.click(500, 500);
    await studentPages[0].waitForTimeout(2000);

    // Wait for radar to pick things up
    await studentPages[2].waitForTimeout(4000);

    // Check Teacher Dashboard for alerts
    console.log("🔍 Teacher checking dashboard for real-time telemetry...");
    await teacherPage.bringToFront();
    await teacherPage.reload();
    await teacherPage.waitForTimeout(5000); // Give Firebase time to sync

    // Log the URL and title
    console.log(`Teacher is on: ${teacherPage.url()}`);
    const teacherTitle = await teacherPage.title();
    console.log(`Teacher Title: ${teacherTitle}`);

    // Assertions on teacher dashboard
    expect(teacherPage.url()).toContain('/dashboard');
    await expect(teacherPage.getByRole('button', { name: 'מיפוי כיתתי (Q-Matrix)' })).toBeVisible({ timeout: 25000 });

    // Clean up
    console.log("🧹 Closing all browsers...");
    await teacherContext.close();
    await Promise.all(studentContexts.map(c => c.close()));
  });
});

