# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: passive-drifting.spec.ts >> Passive Drifting Radar Alerts >> verify passive drifting alert is triggered and throttled
- Location: tests\e2e\passive-drifting.spec.ts:4:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('[id^="palette-units"]') to be visible

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Passive Drifting Radar Alerts', () => {
  4   |   test('verify passive drifting alert is triggered and throttled', async ({ context, page }) => {
  5   |     test.setTimeout(60000); // 60 seconds timeout to accommodate 15s wait
  6   | 
  7   |     // Disable driver.js tours
  8   |     await context.addInitScript(() => {
  9   |       window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
  10  |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  11  |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  12  |     });
  13  | 
  14  |     // Login Student
  15  |     await page.goto('/login');
  16  |     await page.getByRole('button', { name: 'תלמיד' }).click();
  17  | 
  18  |     // Fill student credentials
  19  |     await page.locator('select').first().selectOption({ index: 1 });
  20  |     await page.locator('select').nth(1).selectOption({ index: 1 });
  21  |     await page.getByPlaceholder('שם משתמש').fill('user1');
  22  |     await page.getByPlaceholder('סיסמה').fill('10203040');
  23  |     await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();
  24  | 
  25  |     // Wait for hub to load and navigate via Lesson 1 card
  26  |     await expect(page.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });
  27  |     await page.getByText('שיעור 1: הכשרת חוקרים').first().click();
  28  |     await page.waitForURL('**/workspace*');
  29  | 
  30  |     // Wait for the workspace to render (e.g. palette units)
> 31  |     await page.waitForSelector('[id^="palette-units"]', { timeout: 5000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
  32  | 
  33  |     // Set up a spy on window.__onRadarAlert to collect triggered alerts
  34  |     await page.evaluate(() => {
  35  |       (window as any).triggeredAlerts = [];
  36  |       (window as any).__onRadarAlert = (alert: any) => {
  37  |         (window as any).triggeredAlerts.push(alert);
  38  |       };
  39  |     });
  40  | 
  41  |     // Simulate placing 5 blocks first, then deleting them rapidly
  42  |     await page.evaluate(() => {
  43  |       const store = (window as any).__wsStore;
  44  |       if (!store) {
  45  |         throw new Error('Workspace store window.__wsStore not found!');
  46  |       }
  47  |       
  48  |       // Place 5 units blocks
  49  |       for (let i = 0; i < 5; i++) {
  50  |         store.getState().applyDrop({
  51  |           source: 'palette',
  52  |           sourcePlace: 'units',
  53  |           target: { kind: 'column', place: 'units' }
  54  |         });
  55  |       }
  56  | 
  57  |       // Perform 5 rapid deletions using removeBlockClick
  58  |       for (let i = 0; i < 5; i++) {
  59  |         store.getState().removeBlockClick('units');
  60  |       }
  61  |     });
  62  | 
  63  |     // Wait slightly to make sure any asynchronous operations complete
  64  |     await page.waitForTimeout(500);
  65  | 
  66  |     // Retrieve triggered alerts from the window
  67  |     const alertsAfterRapidDeletes = await page.evaluate(() => (window as any).triggeredAlerts);
  68  |     
  69  |     // We expect exactly 1 PASSIVE_DRIFTING alert
  70  |     const passiveDriftAlerts = alertsAfterRapidDeletes.filter((a: any) => a.type === 'PASSIVE_DRIFTING');
  71  |     expect(passiveDriftAlerts.length).toBe(1);
  72  | 
  73  |     // Now wait for 15 seconds to ensure no subsequent alerts are triggered
  74  |     // Trigger more deletions during this 15 seconds wait to see if it throttles
  75  |     await page.evaluate(() => {
  76  |       const store = (window as any).__wsStore;
  77  |       
  78  |       // Place 5 more units
  79  |       for (let i = 0; i < 5; i++) {
  80  |         store.getState().applyDrop({
  81  |           source: 'palette',
  82  |           sourcePlace: 'units',
  83  |           target: { kind: 'column', place: 'units' }
  84  |         });
  85  |       }
  86  | 
  87  |       // Perform 5 more deletions immediately
  88  |       for (let i = 0; i < 5; i++) {
  89  |         store.getState().removeBlockClick('units');
  90  |       }
  91  |     });
  92  | 
  93  |     await page.waitForTimeout(500);
  94  | 
  95  |     // Verify still exactly 1 PASSIVE_DRIFTING alert (throttled)
  96  |     const alertsDuringThrottle = await page.evaluate(() => (window as any).triggeredAlerts);
  97  |     const passiveDriftAlertsDuringThrottle = alertsDuringThrottle.filter((a: any) => a.type === 'PASSIVE_DRIFTING');
  98  |     expect(passiveDriftAlertsDuringThrottle.length).toBe(1);
  99  | 
  100 |     // Wait the remaining duration of the 15-second window
  101 |     await page.waitForTimeout(14000);
  102 | 
  103 |     // Perform another 5 deletions to verify that a new alert CAN now be triggered (after 15 seconds)
  104 |     await page.evaluate(() => {
  105 |       const store = (window as any).__wsStore;
  106 |       
  107 |       // Place 5 more units
  108 |       for (let i = 0; i < 5; i++) {
  109 |         store.getState().applyDrop({
  110 |           source: 'palette',
  111 |           sourcePlace: 'units',
  112 |           target: { kind: 'column', place: 'units' }
  113 |         });
  114 |       }
  115 | 
  116 |       // Perform 5 more deletions
  117 |       for (let i = 0; i < 5; i++) {
  118 |         store.getState().removeBlockClick('units');
  119 |       }
  120 |     });
  121 | 
  122 |     await page.waitForTimeout(500);
  123 | 
  124 |     // Verify exactly 2 PASSIVE_DRIFTING alerts have been triggered in total
  125 |     const finalAlerts = await page.evaluate(() => (window as any).triggeredAlerts);
  126 |     const finalPassiveDriftAlerts = finalAlerts.filter((a: any) => a.type === 'PASSIVE_DRIFTING');
  127 |     expect(finalPassiveDriftAlerts.length).toBe(2);
  128 |   });
  129 | });
  130 | 
```