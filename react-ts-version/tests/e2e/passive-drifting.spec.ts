import { test, expect } from '@playwright/test';

test.describe('Passive Drifting Radar Alerts', () => {
  test('verify passive drifting alert is triggered and throttled', async ({ context, page }) => {
    test.setTimeout(60000); // 60 seconds timeout to accommodate 15s wait

    // Disable driver.js tours
    await context.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    // Login Student
    await page.goto('/login');
    await page.getByRole('button', { name: 'תלמיד' }).click();

    // Fill student credentials
    await page.locator('select').first().selectOption({ index: 1 });
    await page.locator('select').nth(1).selectOption({ index: 1 });
    await page.getByPlaceholder('שם משתמש').fill('user10');
    await page.getByPlaceholder('סיסמה').fill('10203040');
    await page.getByRole('button', { name: 'יאללה, נכנסים! ✨' }).click();

    // Wait for hub to load and navigate via Lesson 1 card
    await expect(page.getByText('שיעור 1: הכשרת חוקרים').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('שיעור 1: הכשרת חוקרים').first().click();
    await page.waitForURL('**/workspace*');

    // Wait for the workspace to render (e.g. palette units)
    await page.waitForSelector('[id^="palette-units"]', { timeout: 5000 });

    // Clean start: clear out any persistent counts from Firebase
    await page.evaluate(() => {
      const store = (window as any).__wsStore;
      if (store) {
        store.setState({
          counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 },
          undoStack: []
        });
      }
    });

    // Set up a spy on window.__onRadarAlert to collect triggered alerts
    await page.evaluate(() => {
      (window as any).triggeredAlerts = [];
      (window as any).__onRadarAlert = (alert: any) => {
        (window as any).triggeredAlerts.push(alert);
      };
    });

    // Simulate placing 5 blocks first, then deleting them rapidly
    await page.evaluate(() => {
      const store = (window as any).__wsStore;
      if (!store) {
        throw new Error('Workspace store window.__wsStore not found!');
      }
      
      // Place 5 units blocks
      for (let i = 0; i < 5; i++) {
        store.getState().applyDrop({
          source: 'palette',
          sourcePlace: 'units',
          target: { kind: 'column', place: 'units' }
        });
      }

      // Perform 5 rapid deletions using removeBlockClick
      for (let i = 0; i < 5; i++) {
        store.getState().removeBlockClick('units');
      }
    });

    // Wait slightly to make sure any asynchronous operations complete
    await page.waitForTimeout(500);

    // Retrieve triggered alerts from the window
    const alertsAfterRapidDeletes = await page.evaluate(() => (window as any).triggeredAlerts);
    
    // We expect exactly 1 PASSIVE_DRIFTING alert
    const passiveDriftAlerts = alertsAfterRapidDeletes.filter((a: any) => a.type === 'PASSIVE_DRIFTING');
    expect(passiveDriftAlerts.length).toBe(1);

    // Now wait for 15 seconds to ensure no subsequent alerts are triggered
    // Trigger more deletions during this 15 seconds wait to see if it throttles
    await page.evaluate(() => {
      const store = (window as any).__wsStore;
      
      // Place 5 more units
      for (let i = 0; i < 5; i++) {
        store.getState().applyDrop({
          source: 'palette',
          sourcePlace: 'units',
          target: { kind: 'column', place: 'units' }
        });
      }

      // Perform 5 more deletions immediately
      for (let i = 0; i < 5; i++) {
        store.getState().removeBlockClick('units');
      }
    });

    await page.waitForTimeout(500);

    // Verify still exactly 1 PASSIVE_DRIFTING alert (throttled)
    const alertsDuringThrottle = await page.evaluate(() => (window as any).triggeredAlerts);
    const passiveDriftAlertsDuringThrottle = alertsDuringThrottle.filter((a: any) => a.type === 'PASSIVE_DRIFTING');
    expect(passiveDriftAlertsDuringThrottle.length).toBe(1);

    // Wait the remaining duration of the 15-second window
    await page.waitForTimeout(14000);

    // Perform another 5 deletions to verify that a new alert CAN now be triggered (after 15 seconds)
    await page.evaluate(() => {
      const store = (window as any).__wsStore;
      
      // Place 5 more units
      for (let i = 0; i < 5; i++) {
        store.getState().applyDrop({
          source: 'palette',
          sourcePlace: 'units',
          target: { kind: 'column', place: 'units' }
        });
      }

      // Perform 5 more deletions
      for (let i = 0; i < 5; i++) {
        store.getState().removeBlockClick('units');
      }
    });

    await page.waitForTimeout(500);

    // Verify exactly 2 PASSIVE_DRIFTING alerts have been triggered in total
    const finalAlerts = await page.evaluate(() => (window as any).triggeredAlerts);
    const finalPassiveDriftAlerts = finalAlerts.filter((a: any) => a.type === 'PASSIVE_DRIFTING');
    expect(finalPassiveDriftAlerts.length).toBe(2);
  });
});
