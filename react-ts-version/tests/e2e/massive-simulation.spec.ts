import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Massive Multi-User E2E Simulation', () => {

  test('Simulate 5 Students and 1 Teacher interacting in real-time', async ({ browser }) => {
    test.setTimeout(120000); // 2 minutes for this massive test

    // Create 6 isolated browser contexts
    const teacherContext = await browser.newContext();
    await teacherContext.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
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
        window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
        window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
        window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
      });
    }

    const teacherPage = await teacherContext.newPage();
    const studentPages = await Promise.all(studentContexts.map(c => c.newPage()));

    // Inject Auth for Teacher
    console.log("👩‍🏫 Logging in Teacher...");
    await teacherPage.goto(BASE_URL);
    await teacherPage.evaluate(() => {
      localStorage.setItem('auth-storage-v3', JSON.stringify({
        state: {
          user: { uid: "teacher-test-1", role: "teacher", displayName: "Test Teacher" },
          role: "teacher",
          isAuthenticated: true
        }
      }));
    });
    await teacherPage.goto(`${BASE_URL}/dashboard`);
    await teacherPage.waitForLoadState('networkidle');

    // Inject Auth for 5 Students
    console.log("🎓 Logging in 5 Students...");
    for (let i = 0; i < 5; i++) {
      await studentPages[i].goto(BASE_URL);
      await studentPages[i].evaluate((index) => {
        localStorage.setItem('auth-storage-v3', JSON.stringify({
          state: {
            user: { 
              uid: `student-test-${index + 1}`, 
              role: "student", 
              name: `Student ${index + 1}`,
              teacherId: "teacher-test-1"
            },
            role: "student",
            isAuthenticated: true
          }
        }));
      }, i);
      await studentPages[i].goto(`${BASE_URL}/workspace`);
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
