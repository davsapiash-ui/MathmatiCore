// node --test scripts/google-docs/fix-document-bidi.test.mjs
// Runs the Apps Script file against a minimal DocumentApp stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const LRM = '‎';
const RLM = '‏';
const code = readFileSync(new URL('./fix-document-bidi.gs', import.meta.url), 'utf8');

function mockParagraph(initial, leftToRight = false) {
  let t = initial;
  let ltr = leftToRight;
  const text = {
    getText: () => t,
    insertText(offset, s) {
      if (offset < 0 || offset >= t.length) throw new Error('Index out of bounds');
      t = t.slice(0, offset) + s + t.slice(offset);
      return text;
    },
    appendText(s) {
      t += s;
      return text;
    },
  };
  const p = {
    getText: () => t,
    editAsText: () => text,
    isLeftToRight: () => ltr,
    setLeftToRight(v) {
      ltr = v;
      return p;
    },
  };
  return p;
}

const section = (paragraphs) => ({ getParagraphs: () => paragraphs });

function load({ body = [], header = null, footer = null, footnotes = [] } = {}) {
  const doc = {
    getBody: () => section(body),
    getHeader: () => (header ? section(header) : null),
    getFooter: () => (footer ? section(footer) : null),
    getFootnotes: () => footnotes.map((f) => ({ getFootnoteContents: () => section(f) })),
  };
  const ctx = vm.createContext({
    Logger: { log() {} },
    DocumentApp: {
      getActiveDocument: () => doc,
      getUi() {
        throw new Error('no UI in tests');
      },
    },
  });
  vm.runInContext(code, ctx);
  return ctx;
}

const fix = (ctx, s) => ctx.applyFixesToString_(s, ctx.planBidiFixes(s));

test('narrative citations followed by Hebrew get an LRM after the closing bracket', () => {
  const ctx = load();
  for (const [before, after] of [
    ['במחקר של Bouck et al. (2017) המשתתפים', `במחקר של Bouck et al. (2017)${LRM} המשתתפים`],
    ['במחקרים של Bassette et al. (2019, 2020) המשתתפים', `במחקרים של Bassette et al. (2019, 2020)${LRM} המשתתפים`],
    ['המאמר של Agustin (2026) תיאורטי', `המאמר של Agustin (2026)${LRM} תיאורטי`],
    ['של Root et al. (2017).', `של Root et al. (2017)${LRM}.`],
    ['ראו Smith [2017] ושם', `ראו Smith [2017]${LRM} ושם`],
  ]) {
    assert.equal(fix(ctx, before), after);
    assert.equal(fix(ctx, after), after, 'a second run adds nothing');
  }
});

test('brackets with English on both sides are left alone', () => {
  const ctx = load();
  const s = 'מילות מפתח: Place Value, Concrete-Representational-Abstract (CRA), Autism Spectrum Disorder';
  assert.equal(fix(ctx, s), s);
});

test('parenthetical citations in Hebrew get an RLM on both sides', () => {
  const ctx = load();
  assert.equal(fix(ctx, 'כך נמצא (Root et al., 2017). ובהמשך'), `כך נמצא ${RLM}(Root et al., 2017)${RLM}. ובהמשך`);
  const done = `תובנה מספרית ${RLM}(Number Sense)${RLM}?`;
  assert.equal(fix(ctx, done), done);
  const mixed = `בחומר ${RLM}(Kalyuga, 2007, כפי שמובא אצל Agustin, 2026)${RLM}.`;
  assert.equal(fix(ctx, mixed), mixed);
});

test('nested brackets are handled pair by pair', () => {
  const ctx = load();
  assert.equal(fix(ctx, 'כך (ראו Smith (2017) וכן) הלאה'), `כך (ראו Smith (2017)${LRM} וכן) הלאה`);
});

test('an English abbreviation before Hebrew keeps its period', () => {
  const ctx = load();
  assert.equal(fix(ctx, 'Bouck et al. מצאו'), `Bouck et al.${LRM} מצאו`);
  assert.equal(fix(ctx, 'למשל e.g. כך'), `למשל e.g.${LRM} כך`);
  const sentenceEnd = 'נבדק במודל CRA. המודל';
  assert.equal(fix(ctx, sentenceEnd), sentenceEnd);
});

test('brackets with no English are left alone', () => {
  const ctx = load();
  for (const s of ['תלמידים (בכיתה ג) ומורים', 'בשנת (2017) נמצא', 'Smith (המחקר הראשון) מצא']) {
    assert.equal(fix(ctx, s), s);
  }
});

test('fixDirections covers body, header, footer and footnotes; directions follow the language', () => {
  const hebrew = mockParagraph('במחקר של Bouck et al. (2017) המשתתפים', null);
  const english = mockParagraph('Bouck, E. C. (2017). Concrete and app-based manipulatives.', false);
  const empty = mockParagraph('', null);
  const header = mockParagraph('©מתמטיקאור | MathematiCore סקירת ספרות', true);
  const footer = mockParagraph('עמוד של Agustin (2026) כאן');
  const note = mockParagraph('ראו Root et al. (2017) שם');
  const ctx = load({ body: [hebrew, english, empty], header: [header], footer: [footer], footnotes: [[note]] });

  const preview = ctx.previewDirections();
  assert.equal(preview.length, 6);
  assert.equal(hebrew.getText().includes(LRM), false, 'preview changes nothing');
  assert.equal(hebrew.isLeftToRight(), null, 'preview changes nothing');

  ctx.fixDirections();
  assert.equal(hebrew.getText(), `במחקר של Bouck et al. (2017)${LRM} המשתתפים`);
  assert.equal(hebrew.isLeftToRight(), false);
  assert.equal(english.getText(), 'Bouck, E. C. (2017). Concrete and app-based manipulatives.', 'English text untouched');
  assert.equal(english.isLeftToRight(), true);
  assert.equal(empty.isLeftToRight(), null, 'empty paragraph untouched');
  assert.equal(header.isLeftToRight(), false);
  assert.equal(header.getText(), '©מתמטיקאור | MathematiCore סקירת ספרות');
  assert.equal(footer.getText(), `עמוד של Agustin (2026)${LRM} כאן`);
  assert.equal(note.getText(), `ראו Root et al. (2017)${LRM} שם`);

  assert.deepEqual([...ctx.fixDirections()], [], 'a second run changes nothing');
});

test('a closing bracket at the very end of a paragraph is handled', () => {
  const p = mockParagraph('ראו Agustin (2026)');
  const ctx = load({ body: [p] });
  ctx.fixDirections();
  assert.equal(p.getText(), `ראו Agustin (2026)${LRM}`);
});
