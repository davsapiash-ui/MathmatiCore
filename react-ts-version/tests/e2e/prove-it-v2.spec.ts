import { test, expect } from '@playwright/test';

test('Prove Diagnostic Reports Generation v2', async ({ browser }) => {
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

  // 1. Login as Admin via UI (admin has absolute permission to write to any path)
  console.log("Logging in admin via UI...");
  await page.goto('http://localhost:5173/login');
  await page.getByRole('button', { name: 'מנהל' }).click();
  await page.getByPlaceholder('שם משתמש').fill('davsapiash');
  await page.getByPlaceholder('סיסמה').fill('carlibach');
  await page.getByRole('button', { name: 'התחבר למערכת' }).click();
  await page.waitForURL('**/admin');
  console.log("Admin logged in successfully.");
  await page.waitForTimeout(3000); // Allow time for Firebase token and WebSocket connection to settle

  // 2. Call SocraticEngine directly with student_user1 from the admin page context
  console.log("Triggering SocraticEngine.generateAndQueueTasks as admin...");
  await page.evaluate(async () => {
    const qMatrix = {
      task1_zero_placeholder: 'success',
      task2_estimation_error_margin: 'success',
      task3_flexible_regrouping: 'canonical_fixation',
      task4_basic_addition_fluency: 'success',
      task5_small_change: 'success',
      task6_subtraction_regrouping: 'success',
      task7_missing_subtrahend: 'success',
      task8_missing_addend: 'success',
    };
    
    const conceptMastery = {
      decimal_structure: 0.9,
      number_magnitude: 0.9,
      regrouping_fluency: 0.4,
      procedural_fluency: 0.9,
      relational_thinking: 0.8,
      algebraic_reasoning: 0.8
    };
    
    const traceData = { hesitation_events: 5, undo_clicks: 2 };
    
    await (window as any).SocraticEngine.generateAndQueueTasks(
      'student_user1', 
      'user1', 
      '039604483', 
      qMatrix, 
      conceptMastery, 
      traceData, 
      3, 
      'היעזרתי בתמיכה, עבודה בצד'
    );
  });
  
  console.log("AI Generation triggered successfully.");
  await page.waitForTimeout(3000); // Wait for the DB write to complete

  // 3. Log out admin
  console.log("Logging out admin...");
  await page.evaluate(() => {
    localStorage.clear();
  });

  // 4. Log in as Teacher via UI
  console.log("Logging in teacher via UI...");
  await page.goto('http://localhost:5173/login');
  await page.getByRole('button', { name: 'מורה' }).click();
  await page.getByPlaceholder('תעודת זהות').fill('039604483');
  await page.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
  await page.getByRole('button', { name: 'התחבר למערכת' }).click();
  await page.waitForURL('**/dashboard');
  console.log("Teacher logged in successfully.");
  await page.waitForTimeout(3000);

  // 5. Click Diagnostic Reports tab
  await page.getByRole('button', { name: /אבחון אישיים/ }).click();
  await page.waitForTimeout(2000);
  
  // 6. Click on student user1
  await page.getByRole('button', { name: 'user1' }).first().click();
  await page.waitForTimeout(2000); // Let the report render
  
  // 7. Take screenshot!
  await page.screenshot({ path: 'diagnostic-proof.png', fullPage: true });
  console.log("Screenshot taken: diagnostic-proof.png");
});
