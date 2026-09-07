"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fontkitDirection = fontkitDirection;
exports.visualOrder = visualOrder;
exports.splitVisualRuns = splitVisualRuns;
exports.toPdfkitRun = toPdfkitRun;
exports.wrapByWidth = wrapByWidth;
exports.rtlText = rtlText;
/**
 * Hebrew text in pdfkit, done once and correctly.
 *
 * pdfkit lays text out with fontkit, and fontkit (2.x) decides the direction
 * of a run by its first strong character and then REVERSES the glyphs of a
 * right-to-left run on its own. Until 7.9.2026 every report reversed the
 * Hebrew a second time by hand (bidi-js visual order handed straight to
 * doc.text), so each word came out with its letters backwards and the whole
 * page read left-to-right: the "word salad" the product owner saw in every
 * PDF.
 *
 * The rule now:
 *   1. compute the visual order of the line with the Unicode bidi algorithm
 *      (numbers and Latin stay readable inside Hebrew, brackets mirrored);
 *   2. hand pdfkit one run per line (`features: []` makes EmbeddedFont.layout
 *      lay the whole line out as a single run instead of word by word);
 *   3. if the line's first strong character is Hebrew, fontkit will reverse
 *      the run, so pass the visual order reversed; if it is Latin, fontkit
 *      leaves the run alone, so pass the visual order as is.
 * Lines are wrapped by measured width (doc.widthOfString) and drawn one by
 * one with lineBreak:false, so pdfkit never re-wraps a reordered line in the
 * middle. Verified by rendering the PDFs to images (7.9.2026).
 */
const bidiFactory = require("bidi-js");
const bidi = bidiFactory();
const STRONG_RTL = /[֐-׿؀-ۿݐ-ݿיִ-ﭏﹰ-﻿]/;
const STRONG_LTR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
/** One run per string; see the note above. */
const SINGLE_RUN = { features: [] };
/** fontkit's rule: the first non-Common character of the string decides the run direction. */
function fontkitDirection(line) {
    for (const ch of line) {
        if (STRONG_RTL.test(ch))
            return "rtl";
        if (STRONG_LTR.test(ch))
            return "ltr";
    }
    return "ltr";
}
/** Visual (left-to-right display) order of one line in a right-to-left paragraph, brackets mirrored. */
function visualOrder(line) {
    if (!line)
        return "";
    try {
        const levels = bidi.getEmbeddingLevels(line, "rtl");
        const mirrored = bidi.getMirroredCharactersMap(line, levels);
        let logical = line;
        if (mirrored.size > 0) {
            const chars = Array.from(line);
            for (const [idx, ch] of mirrored)
                chars[idx] = ch;
            logical = chars.join("");
        }
        return bidi.getReorderedString(logical, levels);
    }
    catch (_a) {
        return line;
    }
}
/**
 * A visual line split into runs that fontkit handles predictably: a run holds
 * Hebrew (plus neutrals) or Latin (plus neutrals), never both. A run whose
 * first strong character is Hebrew is reversed by fontkit, so it is handed
 * over reversed; a Latin or neutral-only run is handed over as is. Runs are
 * placed left to right at measured widths, so a line that starts with Hebrew
 * and ends with Latin (or the other way round) still displays in visual order.
 */
function splitVisualRuns(visual) {
    const runs = [];
    let current = "";
    let currentKind = null;
    for (const ch of visual) {
        const kind = STRONG_RTL.test(ch) ? "rtl" : STRONG_LTR.test(ch) ? "ltr" : null;
        if (kind !== null && currentKind !== null && kind !== currentKind) {
            runs.push(current);
            current = "";
            currentKind = kind;
        }
        else if (kind !== null && currentKind === null) {
            currentKind = kind;
        }
        current += ch;
    }
    if (current)
        runs.push(current);
    return runs;
}
/** The string to hand pdfkit for one run so that, after fontkit's own handling, it displays as written. */
function toPdfkitRun(run) {
    return fontkitDirection(run) === "rtl" ? Array.from(run).reverse().join("") : run;
}
/** Draws one already-visual line, run by run, inside [x, x + width] with the given alignment. */
function drawVisualLine(doc, visual, x, y, width, align) {
    const runs = splitVisualRuns(visual).map((run) => ({ text: toPdfkitRun(run), width: doc.widthOfString(toPdfkitRun(run), SINGLE_RUN) }));
    const total = runs.reduce((acc, r) => acc + r.width, 0);
    let cursor = align === "right" ? x + width - total : align === "center" ? x + (width - total) / 2 : x;
    const lineHeight = doc.currentLineHeight(true);
    for (const run of runs) {
        doc.text(run.text, cursor, y, Object.assign({ lineBreak: false, width: run.width + 1, align: "left" }, SINGLE_RUN));
        cursor += run.width;
    }
    doc.x = x;
    doc.y = y + lineHeight;
}
/** Wraps `text` into lines that fit `width` at the document's current font and size. */
function wrapByWidth(doc, text, width) {
    const lines = [];
    for (const paragraph of String(text !== null && text !== void 0 ? text : "").split("\n")) {
        const words = paragraph.split(" ").filter((w, i, arr) => w !== "" || arr.length === 1);
        let current = "";
        for (const word of words) {
            const candidate = current ? current + " " + word : word;
            if (current && doc.widthOfString(candidate, SINGLE_RUN) > width) {
                lines.push(current);
                current = word;
            }
            else {
                current = candidate;
            }
        }
        lines.push(current);
    }
    return lines;
}
function rtlText(doc, text, a, b, c) {
    var _a, _b, _c, _d, _e;
    const positioned = typeof a === "number";
    const options = (_a = (positioned ? c : a)) !== null && _a !== void 0 ? _a : {};
    if (positioned) {
        doc.x = a;
        doc.y = b;
    }
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const width = (_b = options.width) !== null && _b !== void 0 ? _b : (positioned ? doc.page.width - doc.page.margins.right - a : pageWidth);
    const indent = (_c = options.indentRight) !== null && _c !== void 0 ? _c : 0;
    const align = (_d = options.align) !== null && _d !== void 0 ? _d : "right";
    const startX = doc.x;
    const lineGap = (_e = options.lineGap) !== null && _e !== void 0 ? _e : 0;
    const bottom = doc.page.height - doc.page.margins.bottom;
    for (const line of wrapByWidth(doc, text, width - indent)) {
        if (doc.y + doc.currentLineHeight(true) > bottom) {
            doc.addPage();
            doc.x = startX;
        }
        drawVisualLine(doc, visualOrder(line), startX, doc.y, width - indent, align);
        doc.y += lineGap;
    }
}
//# sourceMappingURL=hebrewPdf.js.map