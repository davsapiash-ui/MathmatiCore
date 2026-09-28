// DEV-ONLY quick probe: node dev-harness/probe.mjs <meeting> <out.png> [w] [h] [route]
import { seed } from './seed.mjs';
import { openAs, APP } from './browser.mjs';
const [m = '1', out = 'dev-harness/shots/probe.png', w = '1366', h = '768', route = '/hub'] = process.argv.slice(2);
await seed(Number(m));
const { browser, page } = await openAs(undefined, { width: +w, height: +h });
await page.goto(APP + route);
await page.waitForTimeout(6000);
console.log('url', page.url());
await page.screenshot({ path: out });
await browser.close();
