import { test, expect } from '@playwright/test';

test('Prove Diagnostic Reports Generation', async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', exception => console.log('BROWSER UNCAUGHT EXCEPTION:', exception.message));

  // Disable driver.js tours
  await context.addInitScript(() => {
    window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
    window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
    window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  });

  // 1. Log in as student via UI
  console.log("Logging in student via UI...");
  await page.goto('http://localhost:5173/login');
  await page.getByRole('button', { name: 'תלמיד' }).click();
  await page.locator('select').first().selectOption({ index: 1 });
  await page.locator('select').nth(1).selectOption({ index: 1 });
  await page.getByPlaceholder('שם משתמש').fill('user1');
  await page.getByPlaceholder('סיסמה').fill('10203040');
  await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();
  await page.waitForURL('**/hub');
  console.log("Student user1 logged in.");

  // 2. Go to Workspace
  await page.goto('http://localhost:5173/workspace');
  await page.waitForTimeout(3000); // Wait for the page and workspace store to initialize

  // 3. Set the store state to skip directly to the Reflection Screen
  console.log("Setting flowStatus to reflection directly via store...");
  await page.evaluate(() => {
    const wsStore = (window as any).__wsStore;
    if (wsStore) {
      wsStore.setState({
        flowStatus: 'reflection',
        qflow: {
          results: {
            task1_zero_placeholder: { correct: true, tag: 'success' },
            task3_flexible_regrouping: { correct: false, tag: 'canonical_fixation' },
          }
        }
      });
    }
  });
  await page.waitForTimeout(2000);
  console.log("At workspace page (ReflectionScreen).");

  // 4. Click effort and strategy
  await page.getByRole('radio', { name: 'התאמצתי הרבה' }).click();
  await page.getByRole('checkbox', { name: 'היעזרתי בתמיכה' }).first().click();

  // 5. Click proceed button
  console.log("Submitting reflection...");
  await page.locator('button:has-text("סיימתי")').click();
  
  // Wait for the Firebase push to complete and navigate to hub
  await page.waitForURL('**/hub');
  console.log("Submitted and back to hub.");

  // 6. Log out
  await page.evaluate(() => {
    localStorage.clear();
  });

  // 7. Login as teacher via UI
  console.log("Logging in teacher via UI...");
  await page.goto('http://localhost:5173/login');
  await page.getByRole('button', { name: 'מורה' }).click();
  await page.getByPlaceholder('תעודת זהות').fill('039604483');
  await page.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
  await page.getByRole('button', { name: 'התחבר למערכת' }).click();
  await page.waitForURL('**/dashboard');
  console.log("Teacher logged in.");

  // 8. Click Diagnostic Reports tab
  await page.getByRole('button', { name: /אבחון אישיים/ }).click();
  await page.waitForTimeout(2000);

  // 9. Click on student user1
  await page.getByRole('button', { name: 'user1' }).first().click();
  await page.waitForTimeout(3000);

  // 10. Take screenshot
  await page.screenshot({ path: 'diagnostic-proof.png', fullPage: true });
  console.log("Done! Screenshot saved as diagnostic-proof.png");
});
