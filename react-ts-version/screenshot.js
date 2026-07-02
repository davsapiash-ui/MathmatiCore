import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:4174', {waitUntil: 'networkidle0'}).catch(e => console.error(e));
  await page.screenshot({ path: 'screenshot.png', fullPage: true });
  await browser.close();
  process.exit(0);
})();
