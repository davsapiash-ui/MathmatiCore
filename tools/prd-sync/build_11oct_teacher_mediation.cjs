// One source for the 11.10.2026 teacher-mediation edits (PRD module 23 measure 5 and module 24, documents 01 and 04).
// Writes: ops JSON, the Apps Script for the owner's Google Docs, and applies the PRD edits to the repo Markdown mirror.
// Run from the repo root: node tools/prd-sync/build_11oct_teacher_mediation.cjs
const fs = require('fs');
const path = require('path');

const PRD_MD = 'מסמכי אפיון/07- 3.MathematiCore_PRD_v07 הסופי.md';
// Plain text as it is in the Google Doc; mdOld / mdNew only where the Markdown export escapes underscores.
const md = (s) => s.replace(/_/g, '\\_');

const edits = [
  {
    doc: 'PRD',
    where: 'מודול 23, מדד 5 (11.10.2026)',
    old: 'מדד 5, השפעת האנליטיקה על תיווך המורה, בוחן את המורה החוקרת עצמה. הוא נמדד ביומן החוקר ואינו מחושב במערכת.',
    add: ' יומן החוקר מתנהל בתום כל מפגש, שורה לכל אירוע תיווך ולא שורה לכל לומד, כי לומד יכול לקרוא למורה כמה פעמים, וכל קריאה היא החלטה נפרדת של המורה. המערכת רושמת עם זמן כל קריאת עזרה, התראת רדאר והודעת צ\'אט, והמורה החוקרת מוסיפה לכל שורה בקובץ "תיווך המורה" (מודול 24) שלוש עמודות: מה עשתה (כתבה, ניגשה, כתבה וניגשה, או לא פעלה), האם הנתונים הובילו אותה לכך (כן או לא), והערה של מילה אחת כשצריך. גישה פיזית שלא בעקבות אירוע נרשמת כשורה נוספת, עם שעה משוערת.',
  },
  {
    doc: 'PRD',
    where: 'מודול 24 §ב, מספר הקבצים (11.10.2026)',
    old: 'הייצוא מפיק חמישה קובצי CSV נפרדים:',
    new: 'הייצוא מפיק חמישה קובצי CSV נפרדים של הלומדים, וקובץ שישי, תיווך המורה, המתואר אחרי הרשימה:',
  },
  {
    doc: 'PRD',
    where: 'מודול 24 §ב, הקובץ השישי (11.10.2026)',
    old: 'בקובץ המפגשים, עמודות המונים סופרות כל אירוע שנרשם במפגש',
    new: 'קובץ תיווך המורה הוא הצד של המערכת ביומן החוקר של מדד 5 (מודול 23): שורה לכל אירוע תיווך של לומד, עם זמן. הוא מכיל קריאות עזרה, התראות רדאר, הודעות צ\'אט של המורה ושל הלומד לפי כיוון, זמן ואורך בלבד וללא הטקסט, אישור שער האבחון, שיוך פרופיל התמיכה וסבבי זמן ההשלמה. הוא אינו כולל טקסט חופשי ואינו כולל זהות של מורה. בקובץ המפגשים, עמודות המונים סופרות כל אירוע שנרשם במפגש',
  },
  {
    doc: 'PRD',
    where: 'מודול 24 §ב, חוזה העמודות (11.10.2026)',
    old: 'יומן איפוסים — שורה לכל רישום ב-reset_audit_log, כולל ייצואים.',
    new: 'יומן איפוסים — שורה לכל רישום ב-reset_audit_log, כולל ייצואים. תיווך המורה — שורה לכל אירוע תיווך של לומד, בעמודות event_time_iso, student_id, session_number, session_number_basis, event_kind, event_source, ref_id, detail_code, detail_number.',
  },
  {
    doc: 'PRD',
    where: 'מודול 24, ההוראה באנגלית: מספר הקבצים (11.10.2026)',
    old: 'Emit five separate CSV files',
    new: 'Emit six separate CSV files',
  },
  {
    doc: 'PRD',
    where: 'מודול 24, ההוראה באנגלית: הקובץ השישי (11.10.2026)',
    old: 'recordings, reflections, reset log)',
    new: 'recordings, reflections, reset log, teacher mediation with one row per mediation event of a learner, closed-list values only, no chat text and no teacher identity)',
  },
  {
    doc: 'מסמך 01',
    where: 'שלב ב, תכנון הערכה, אחרי "ארבעת המדדים הראשונים" (11.10.2026)',
    old: 'ארבעת המדדים הראשונים מחושבים במערכת מתוך עקבות הלמידה.',
    add: ' המדד החמישי נמדד ביומן המורה החוקרת. לצורך המדד שומרת המערכת, עם זמנים, את קריאות העזרה של הלומדים, את התראות הרדאר ואת הודעות המורה, ובתום כל מפגש מסמנת המורה לכל אירוע כזה מה עשתה (כתבה, ניגשה, כתבה וניגשה או לא פעלה) והאם הנתונים הובילו אותה לכך.',
  },
  {
    doc: 'מסמך 04',
    where: 'מפת הממשק, ייצוא נתוני מחקר (11.10.2026)',
    old: 'הרפלקציות ויומן האיפוסים)',
    new: 'הרפלקציות, יומן האיפוסים ויומן תיווך המורה, הכולל עם זמנים את קריאות העזרה, התראות הרדאר והודעות המורה, בלי טקסט ובלי זיהוי של המורה)',
  },
].map((e) => ({ doc: e.doc, where: e.where, old: e.old, new: e.new ?? e.old + e.add }));

// 1. ops JSON
fs.writeFileSync(path.join(__dirname, 'ops', 'ops_11oct_teacher_mediation.json'), JSON.stringify(edits, null, 1) + '\n', 'utf8');

// 2. Apps Script for the owner's Google Docs (the same pattern as apply_11oct_teacher_guide.gs)
const ids = {
  'PRD': { id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: '7.19' },
  'מסמך 01': { id: '1fD7rDVBHbwskJ7b2ybKNUjgSuCHijHxTkPvjZ3oXhMI', version: null },
  'מסמך 04': { id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', version: null },
};
const docsJs = Object.entries(ids).map(([name, d]) => {
  const list = edits.filter((e) => e.doc === name).map((e) => `  [${JSON.stringify(e.old)}, ${JSON.stringify(e.new)}]`).join(',\n');
  return ` { name: ${JSON.stringify(name)}, id: '${d.id}', version: ${d.version === null ? 'null' : JSON.stringify(d.version)}, edits: [\n${list}\n] }`;
}).join(',\n');
const tpl = fs.readFileSync(path.join(__dirname, 'apply_11oct_teacher_guide.gs'), 'utf8').replace(/\r\n/g, '\n');
const tail = tpl.slice(tpl.indexOf('function applyAll()'));
const gs = `// MathmatiCore — 11.10.2026: the teacher-mediation file and the researcher's journal for measure 5 (PRD modules 23 and 24, documents 01 and 04).\n// Run applyAll. Safe to run more than once. Each text is replaced only if it is found exactly once; anything else is skipped and logged.\nvar DOCS = [\n${docsJs}\n];\n${tail}`;
fs.writeFileSync(path.join(__dirname, 'apply_11oct_teacher_mediation.gs'), gs, 'utf8');

if (process.argv.includes('--prd')) {
// 3. The repo Markdown mirror of the PRD (the Docs 01 and 04 mirrors are re-exported from Drive after the owner applies the script)
let prd = fs.readFileSync(PRD_MD, 'utf8');
const crlf = prd.includes('\r\n');
if (crlf) prd = prd.replace(/\r\n/g, '\n');
for (const e of edits.filter((x) => x.doc === 'PRD')) {
  const from = md(e.old);
  const to = md(e.new);
  const n = prd.split(from).length - 1;
  if (n !== 1) throw new Error(`PRD anchor found ${n} times: ${e.old.slice(0, 60)}`);
  prd = prd.replace(from, () => to);
}
if (crlf) prd = prd.replace(/\n/g, '\r\n');
fs.writeFileSync(PRD_MD, prd, 'utf8');
}
console.log('ok: ops json and apps script written;', edits.length, 'edits; PRD mirror', process.argv.includes('--prd') ? 'edited' : 'NOT edited (needs --prd)');
