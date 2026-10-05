// node --test scripts/google-docs/fix-first-page-bidi.test.mjs
// Runs the Apps Script file against a minimal DocumentApp stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const LRM = '‎';
const RLM = '‏';
const code = readFileSync(new URL('./fix-first-page-bidi.gs', import.meta.url), 'utf8');

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
    getType: () => 'PARAGRAPH',
    asParagraph: () => p,
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

function load(paragraphs) {
  const body = { getNumChildren: () => paragraphs.length, getChild: (i) => paragraphs[i] };
  const ctx = vm.createContext({
    Logger: { log() {} },
    DocumentApp: {
      ElementType: { PARAGRAPH: 'PARAGRAPH', LIST_ITEM: 'LIST_ITEM' },
      getActiveDocument: () => ({ getBody: () => body }),
      getUi() {
        throw new Error('no UI in tests');
      },
    },
  });
  vm.runInContext(code, ctx);
  return ctx;
}

const apply = (s, fixes) =>
  [...fixes].reverse().reduce((acc, f) => acc.slice(0, f.offset) + f.mark + acc.slice(f.offset), s);

test('narrative citations get an LRM right after the closing bracket', () => {
  const { planBidiFixes } = load([]);
  for (const [before, after] of [
    ['במחקר של Bouck et al. (2017) המשתתפים', `במחקר של Bouck et al. (2017)${LRM} המשתתפים`],
    ['במחקרים של Bassette et al. (2019, 2020) המשתתפים', `במחקרים של Bassette et al. (2019, 2020)${LRM} המשתתפים`],
    ['המאמר של Agustin (2026) תיאורטי', `המאמר של Agustin (2026)${LRM} תיאורטי`],
    ['של Root et al. (2017).', `של Root et al. (2017)${LRM}.`],
  ]) {
    const fixed = apply(before, planBidiFixes(before));
    assert.equal(fixed, after);
    assert.deepEqual([...planBidiFixes(fixed)], [], 'a second run adds nothing');
  }
});

test('parenthetical citations in Hebrew get an RLM on both sides', () => {
  const { planBidiFixes } = load([]);
  const s = 'כך נמצא (Root et al., 2017). ובהמשך';
  assert.equal(apply(s, planBidiFixes(s)), `כך נמצא ${RLM}(Root et al., 2017)${RLM}. ובהמשך`);
  assert.deepEqual([...planBidiFixes(`תובנה מספרית ${RLM}(Number Sense)${RLM}?`)], []);
});

test('brackets with no English are left alone', () => {
  const { planBidiFixes } = load([]);
  assert.deepEqual([...planBidiFixes('תלמידים (בכיתה ג) ומורים')], []);
  assert.deepEqual([...planBidiFixes('בשנת (2017) נמצא')], []);
  assert.deepEqual([...planBidiFixes('Smith (המחקר הראשון) מצא')], []);
});

test('fixFirstPage touches only the paragraphs before "תמה 1"', () => {
  const page1 = [
    mockParagraph('כותרת בעברית בלבד'),
    mockParagraph('במחקר של Bouck et al. (2017) המשתתפים, והמאמר של Agustin (2026) תיאורטי.', null),
    mockParagraph(''),
  ];
  const heading = mockParagraph('תמה 1: תובנה מספרית וייצוגים דיגיטליים');
  const later = mockParagraph('במחקר של Root et al. (2017) המשתתפים');
  const ctx = load([...page1, heading, later]);

  const preview = ctx.previewFirstPage();
  assert.equal(preview.length, 3);
  assert.equal(page1[1].getText().includes(LRM), false, 'preview changes nothing');
  assert.equal(page1[1].isLeftToRight(), null, 'preview changes nothing');

  ctx.fixFirstPage();
  assert.equal(
    page1[1].getText(),
    `במחקר של Bouck et al. (2017)${LRM} המשתתפים, והמאמר של Agustin (2026)${LRM} תיאורטי.`,
  );
  assert.equal(page1[1].isLeftToRight(), false);
  assert.equal(page1[0].getText(), 'כותרת בעברית בלבד');
  assert.equal(heading.getText(), 'תמה 1: תובנה מספרית וייצוגים דיגיטליים');
  assert.equal(later.getText(), 'במחקר של Root et al. (2017) המשתתפים', 'after the heading: untouched');

  assert.deepEqual([...ctx.fixFirstPage()], [], 'a second run changes nothing');
});

test('without the "תמה 1" heading nothing is changed', () => {
  const p = mockParagraph('במחקר של Bouck et al. (2017) המשתתפים');
  const ctx = load([p]);
  assert.throws(() => ctx.fixFirstPage(), /לא נמצאה/);
  assert.equal(p.getText(), 'במחקר של Bouck et al. (2017) המשתתפים');
});

test('a closing bracket at the very end of a paragraph is handled', () => {
  const p = mockParagraph('ראו Agustin (2026)');
  const ctx = load([p, mockParagraph('תמה 1: x')]);
  ctx.fixFirstPage();
  assert.equal(p.getText(), `ראו Agustin (2026)${LRM}`);
});
