import { test, expect } from '@playwright/test';

test('Generate Average Student Telemetry and AI Report', async ({ browser }) => {
  test.setTimeout(120000); 
  const context = await browser.newContext();
  const page = await context.newPage();

  // Disable driver.js tours
  await context.addInitScript(() => {
    window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
    window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
    window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  });

  // 1. Login as Student (user3)
  console.log("Logging in as average student (user3)...");
  await page.goto('http://localhost:5173/login');
  await page.locator('button').filter({ hasText: 'תלמיד' }).click();
  await page.locator('select').first().selectOption({ index: 1 }); // Pick first school
  await page.locator('select').nth(1).selectOption({ index: 1 }); // Pick first class
  await page.getByPlaceholder('שם משתמש').fill('user3');
  await page.getByPlaceholder('סיסמה').fill('10203040');
  await page.locator('button').filter({ hasText: 'יאללה, נכנסים! ✨' }).click();
  await page.waitForURL('**/hub', { timeout: 15000 });
  console.log("Logged in as user3.");

  // 2. Navigate to Workspace
  await page.locator('button, a').filter({ hasText: 'להמשך התרגול' }).first().click();
  await page.waitForURL('**/workspace*', { timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log("Entered workspace.");

  // 3. Hack the store to simulate YELLOW ROUTE (mixed results)
  await page.evaluate(() => {
    const wsStore = (window as any).__wsStore;
    if (wsStore) {
      wsStore.setState({
        flowStatus: 'reflection',
        qflow: {
          results: {
            task1_zero_placeholder: { correct: true, tag: 'success' },
            task2_estimation_error_margin: { correct: true, tag: 'success' },
            task3_flexible_regrouping: { correct: false, tag: 'canonical_fixation' },
            task4_basic_addition_fluency: { correct: true, tag: 'success' },
            task5_small_change: { correct: false, tag: 'relational_failure' },
            task6_subtraction_regrouping: { correct: false, tag: 'borrowing_inversion' },
            task7_missing_subtrahend: { correct: true, tag: 'success' },
            task8_missing_addend: { correct: false, tag: 'algebraic_gap' },
          }
        }
      });
    }
  });
  await page.waitForTimeout(2000);
  console.log("Injected YELLOW ROUTE answers. Set flowStatus to reflection.");

  // 4. Fill reflection
  await page.getByRole('radio', { name: 'התאמצתי בינוני' }).click();
  await page.getByRole('checkbox', { name: 'עבודה בצד' }).first().click();
  
  console.log("Submitting reflection...");
  await page.locator('button').filter({ hasText: 'סיימתי — יאללה להמשיך!' }).click();
  await page.waitForURL('**/hub', { timeout: 60000 });
  console.log("Reflection submitted successfully.");

  // 5. Logout
  await page.evaluate(() => localStorage.clear());
  
  // 6. Login as Teacher
  console.log("Logging in as teacher...");
  await page.goto('http://localhost:5173/login');
  await page.locator('button').filter({ hasText: 'מורה' }).click();
  await page.getByPlaceholder('תעודת זהות').fill('039604483');
  await page.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
  await page.locator('button').filter({ hasText: 'התחבר למערכת' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log("Logged in as teacher.");

  // 7. Go to Diagnostic Reports
  await page.locator('button').filter({ hasText: 'אבחון אישיים' }).click();
  await page.waitForTimeout(2000);
  
  // 8. Click on user3
  await page.getByRole('button', { name: 'user3' }).first().click();
  await page.waitForTimeout(3000); // Let the report render
  
  // 9. Screenshot
  await page.screenshot({ path: 'bot-report-average.png', fullPage: true });
  console.log("Done! Check bot-report-average.png");
});
