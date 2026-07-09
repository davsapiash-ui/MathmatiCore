const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173');
  
  // Login as teacher
  await page.click('button:has-text("התחבר מורה לדוגמה")');
  await page.waitForTimeout(2000);
  
  // Switch to alerts or clustering tab if needed, but the radar alerts trigger replay viewer
  // Wait, I need to click on a student card in the dashboard to trigger selectedReplayStudentId!
  // In TeacherDashboard, clicking the radar alert row triggers setSeekToTime and setSelectedReplayStudentId.
  // Wait, if no alert is clicked, selectedReplayStudentId is NULL!
  
  await page.waitForTimeout(5000);
  
  await page.screenshot({ path: 'teacher_dashboard_view.png', fullPage: true });
  console.log("Screenshot saved as teacher_dashboard_view.png");
  
  await browser.close();
})();
