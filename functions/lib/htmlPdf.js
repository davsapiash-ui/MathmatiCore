"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHROMIUM_PDF_RUNTIME = void 0;
exports.pdfEngine = pdfEngine;
exports.renderHtmlToPdf = renderHtmlToPdf;
exports.renderWithFallback = renderWithFallback;
exports.fontPath = fontPath;
/**
 * HTML → PDF with headless Chromium (Module 23 reports).
 *
 * Why Chromium: pdfkit/fontkit lay text out left-to-right and reverse
 * right-to-left runs on their own, so every Hebrew report needed a hand-made
 * bidi workaround (hebrewPdf.ts) that broke on every mix of Hebrew, numbers
 * and Latin. Chromium is the same engine that renders the teacher dashboard:
 * `dir="rtl"`, real tables, embedded Heebo and the Unicode bidi algorithm all
 * work with no special handling.
 *
 * Rollback switch: set PDF_ENGINE=pdfkit (functions/.env or the function's
 * environment) and every report goes back to the pdfkit path without a code
 * change. If Chromium fails to start or to print, the caller also falls back
 * to pdfkit automatically and logs an error, so a report is always produced.
 */
const logger = require("firebase-functions/logger");
const path = require("path");
/** Engine chosen by PDF_ENGINE; anything other than "pdfkit" means Chromium. */
function pdfEngine() {
    return String(process.env.PDF_ENGINE || "").trim().toLowerCase() === "pdfkit" ? "pdfkit" : "chromium";
}
/**
 * Cloud Functions v2 options every Chromium-printing function must carry.
 * The bundled Chromium is unpacked into /tmp, which on Cloud Run is an
 * in-memory filesystem, so the binary (~300MB) and the browser process
 * (~400MB) both count against the instance's memory; 2GiB leaves headroom
 * for a multi-page print. A cold boot plus print takes a few seconds, well
 * outside the 60s/256MB defaults.
 */
exports.CHROMIUM_PDF_RUNTIME = { memory: "2GiB", timeoutSeconds: 300 };
let browserPromise = null;
async function launchBrowser() {
    const puppeteer = await Promise.resolve().then(() => require("puppeteer-core"));
    // PUPPETEER_EXECUTABLE_PATH lets a local run (emulator, tests) use an installed
    // Chromium; production uses the bundled @sparticuz/chromium binary.
    const localExe = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (localExe) {
        return puppeteer.launch({ executablePath: localExe, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    }
    const chromium = (await Promise.resolve().then(() => require("@sparticuz/chromium"))).default;
    const executablePath = await chromium.executablePath();
    return puppeteer.launch({ executablePath, args: chromium.args, headless: true });
}
/** One browser per warm instance; a crashed browser is replaced on the next call. */
async function getBrowser() {
    if (!browserPromise) {
        browserPromise = launchBrowser().catch((err) => {
            browserPromise = null;
            throw err;
        });
    }
    const browser = await browserPromise;
    if (!browser.connected) {
        browserPromise = null;
        return getBrowser();
    }
    return browser;
}
/** Prints a complete HTML document to an A4 PDF buffer. */
async function renderHtmlToPdf(html, options = {}) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready.then(() => true));
        const pdf = await page.pdf({
            format: "A4",
            landscape: Boolean(options.landscape),
            printBackground: true,
            preferCSSPageSize: false,
            displayHeaderFooter: Boolean(options.footerTemplate),
            headerTemplate: "<span></span>",
            footerTemplate: options.footerTemplate || "<span></span>",
            margin: { top: "14mm", right: "14mm", bottom: options.footerTemplate ? "18mm" : "14mm", left: "14mm" },
        });
        return Buffer.from(pdf);
    }
    finally {
        await page.close().catch(() => undefined);
    }
}
/**
 * Runs the Chromium renderer and, if it fails for any reason, the pdfkit
 * renderer, so the teacher always receives a report. The failure is logged
 * as an error (not a warning) so it cannot pass unnoticed.
 */
async function renderWithFallback(label, chromiumRender, pdfkitRender) {
    if (pdfEngine() === "pdfkit") {
        logger.info(`[${label}] PDF_ENGINE=pdfkit: rendering with pdfkit`);
        return pdfkitRender();
    }
    try {
        return await chromiumRender();
    }
    catch (err) {
        logger.error(`[${label}] Chromium PDF render failed, falling back to pdfkit`, { message: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
        return pdfkitRender();
    }
}
/** Absolute path of a bundled font file (functions/fonts/…), from lib/ or src/. */
function fontPath(fileName) {
    return path.join(__dirname, "..", "fonts", fileName);
}
//# sourceMappingURL=htmlPdf.js.map