// Harness only (scratchpad). Drives the real frontend in headless Chromium.
import { createRequire } from "module";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
const require = createRequire("/home/user/MathmatiCore/react-ts-version/package.json");
const { chromium } = require("playwright");

const PHASE = process.env.PHASE;
const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL(`./shots/${PHASE}/`, import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const tokens = JSON.parse(readFileSync(new URL("./tokens.json", import.meta.url)));
const log = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function session(who, user, role) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: "he-IL" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text().slice(0, 300)); });
  await page.goto(BASE + "/");
  await page.waitForFunction(() => window.__harness, null, { timeout: 30000 });
  await page.evaluate(async (t) => { await window.__harness.auth.signOut(); await window.__harness.signIn(t); }, tokens[who]);
  await page.evaluate(({ user, role }) => {
    localStorage.setItem("mc_auth_user", JSON.stringify(user));
    localStorage.setItem("mc_auth_role", role);
    localStorage.setItem("mc_auth_time", String(Date.now()));
  }, { user, role });
  return { ctx, page, errors };
}

async function probes(page) {
  return page.evaluate(async () => {
    const h = window.__harness; const r = h.rtdb; const f = h.fs;
    const out = {};
    const tryIt = async (name, fn) => { try { await fn(); out[name] = "ALLOWED"; } catch (e) { out[name] = "DENIED (" + (e.code || e.message || e).toString().slice(0, 60) + ")"; } };
    await tryIt("rtdb read users/students", () => r.get(r.ref(h.database, "users/students")));
    await tryIt("rtdb write active_class_session (pause)", () => r.update(r.ref(h.database, "active_class_session"), { status: "paused" }));
    await tryIt("rtdb write active_class_session (resume)", () => r.update(r.ref(h.database, "active_class_session"), { status: "active" }));
    await tryIt("rtdb gate approve learner 6 (routeStatus)", () => r.update(r.ref(h.database, "users/students/student_user6"), { teacher_gate_approved: true, routeStatus: "APPROVED" }));
    await tryIt("firestore read sessions/session_02_student_4", () => f.getDoc(f.doc(h.firestore, "sessions", "session_02_student_4")));
    await tryIt("firestore read students/student_user4", () => f.getDoc(f.doc(h.firestore, "students", "student_user4")));
    return out;
  });
}

async function tiles(page) {
  return page.evaluate(() => [...document.querySelectorAll('[role="button"][aria-label^="תלמיד "]')].slice(0, 12).map((el) => ({
    label: el.getAttribute("aria-label"),
    radarColor: el.getAttribute("data-radar-color"),
    background: getComputedStyle(el).backgroundColor,
    border: getComputedStyle(el).borderTopColor,
    tag: el.querySelector("span.rounded-md")?.textContent?.trim() || null,
  })));
}

// ── Teacher ──────────────────────────────────────────────────────────────
{
  const { ctx, page, errors } = await session("teacher", { uid: "teacher_pilot", email: "pilot.teacher@edu-haifa.org.il", role: "teacher", whitelistVerified: true }, "teacher");
  await page.goto(BASE + "/dashboard");
  await page.waitForSelector('[role="button"][aria-label^="תלמיד 1."]', { timeout: 30000 });
  await sleep(4500);
  await page.screenshot({ path: OUT + "teacher-dashboard.png" });
  await page.screenshot({ path: OUT + "teacher-dashboard-full.png", fullPage: true });
  const grid = page.locator("section.w-full").first();
  await grid.screenshot({ path: OUT + "teacher-radar-grid.png" });
  log.teacher_tiles = await tiles(page);
  log.teacher_gate_banner = await page.locator("text=ממתינים ב").first().textContent().catch(() => null);
  log.teacher_probes = await probes(page);
  // Module 20 approval from the gate table, as the teacher does it.
  const approve = page.locator("section").filter({ hasText: "סיימו את שלב האבחון" }).locator("button", { hasText: "אישור המסלול הירוק" }).first();
  await approve.click();
  await sleep(2500);
  await page.screenshot({ path: OUT + "teacher-gate-approved.png" });
  log.teacher_after_approve_toast = await page.locator("[data-sonner-toast]").allTextContents().catch(() => []);
  // Module 14 / register 7: the teacher pauses the meeting from the dashboard.
  await page.locator("button", { hasText: "עצרו את המפגש" }).first().click();
  await sleep(2500);
  await page.screenshot({ path: OUT + "teacher-pause.png" });
  log.teacher_pause_toast = await page.locator("[data-sonner-toast]").allTextContents().catch(() => []);
  log.teacher_errors = errors.filter((e) => /permission|PERMISSION/.test(e)).slice(0, 10);
  await ctx.close();
}

// ── Admin ────────────────────────────────────────────────────────────────
{
  const { ctx, page, errors } = await session("admin", { uid: "admin_owner", email: "owner@edu-haifa.org.il", role: "admin", whitelistVerified: true }, "admin");
  await page.goto(BASE + "/admin");
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(3000);
  await page.screenshot({ path: OUT + "admin-overview.png" });
  log.admin_nav = await page.locator("aside a, nav a, [data-sidebar] a").allTextContents();
  log.admin_nav = [...new Set(log.admin_nav.map((t) => t.trim()).filter(Boolean))];

  for (const path of ["/admin/teacher-view", "/dashboard", "/reports/student/student_user4", "/projector", "/workspace", "/hub"]) {
    await page.goto(BASE + path);
    await sleep(4000);
    const name = path.replace(/\//g, "_").replace(/^_/, "");
    await page.screenshot({ path: OUT + `admin-direct-${name}.png` });
    log[`admin_direct ${path}`] = {
      finalUrl: page.url().replace(BASE, ""),
      radarTiles: await page.locator('[role="button"][aria-label^="תלמיד "]').count(),
      openMeetingButtons: await page.locator("button", { hasText: /הפעילו|הפעלת מפגש|פתחו את מפגש|עצרו את המפגש|סגרו את המפגש/ }).count(),
    };
  }
  log.admin_probes = await probes(page);

  for (const path of ["/admin/schools", "/admin/curriculum", "/admin/support", "/admin/security", "/admin/settings", "/admin/chat", "/admin/login-cards"]) {
    errors.length = 0;
    await page.goto(BASE + path);
    await sleep(3500);
    const name = path.replace(/\//g, "_").replace(/^_/, "");
    await page.screenshot({ path: OUT + `admin-${name}.png` });
    log[`admin_screen ${path}`] = {
      finalUrl: page.url().replace(BASE, ""),
      h: (await page.locator("h1, h2").allTextContents()).slice(0, 3).map((t) => t.trim()),
      permissionErrors: errors.filter((e) => /permission|PERMISSION/i.test(e)).map((e) => e.slice(0, 120)).slice(0, 5),
    };
  }
  await ctx.close();
}

writeFileSync(OUT + "log.json", JSON.stringify(log, null, 2));
await browser.close();
console.log("done", PHASE);
