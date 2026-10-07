/**
 * The learner-journey screen's "הורדת המפגש": one file with everything the
 * screen shows for a meeting — every recorded action of the meeting (not only
 * the exercise picked in the table), the resets that cut it, the chapters,
 * and the recording itself (the rrweb events the player replays). Owner's
 * request, 6.10.2026, so a meeting can be studied outside the dashboard.
 *
 * The file is a web page (.html), not raw data: a .json download opened as
 * code on the owner's computer ("הוא יורד JS", 6.10.2026). Double-clicked, the
 * page shows the decision table beside a player of the work-screen recording,
 * with the replay library inside the file, so it opens with no internet and
 * no sign-in. The raw data is in the page too (script#meeting-data).
 *
 * Nothing here is new data: the learner is the anonymous number 1–12 the
 * screen already shows, and the file holds what the screen already read.
 */
import {
  compulsoryNumbers,
  daySeparatorHe,
  describeEvent,
  exerciseTitle,
  formatClock,
  formatDate,
  meetingExerciseIds,
  resetSeparatorHe,
  withDaySeparators,
  withResetSeparators,
  type JourneyEvent,
  type MeetingResetMark,
  type RecordingChapter,
} from '@/infrastructure/services/LearnerJourneyService';
import { STATION_NAMES_HE } from '@/core/stationNames';

export interface MeetingExport {
  format: 'mathematicore-meeting-export';
  version: 1;
  exportedAt: string;
  learner: number;
  meeting: number;
  actions: JourneyEvent[];
  resets: unknown[];
  chapters: RecordingChapter[];
  recording: { truncated: boolean; events: unknown[] };
}

export function buildMeetingExport(input: {
  learner: number;
  meeting: number;
  actions: JourneyEvent[];
  resets: unknown[];
  chapters: RecordingChapter[];
  recordingEvents: unknown[];
  truncated: boolean;
  now?: Date;
}): MeetingExport {
  return {
    format: 'mathematicore-meeting-export',
    version: 1,
    exportedAt: (input.now ?? new Date()).toISOString(),
    learner: input.learner,
    meeting: input.meeting,
    actions: [...input.actions].sort((a, b) => a.timestamp - b.timestamp),
    resets: input.resets,
    chapters: input.chapters,
    recording: { truncated: input.truncated, events: input.recordingEvents },
  };
}

/** e.g. mathematicore-learner-3-meeting-4-2026-10-06.html */
export function meetingExportFileName(learner: number, meeting: number, now: Date = new Date()): string {
  return `mathematicore-learner-${learner}-meeting-${meeting}-${now.toISOString().slice(0, 10)}.html`;
}

/** One line of the page's table, worded as the dashboard words it. */
export type ExportRow =
  | { kind: 'event'; ts: number; clock: string; exercise: string; exerciseTitle: string; label: string; detail: string; attention: boolean; selfRegulation: boolean }
  | { kind: 'note'; text: string; tone: 'day' | 'reset' };

export function meetingExportRows(data: MeetingExport): ExportRow[] {
  const chapters = data.chapters;
  const ids = meetingExerciseIds(data.actions, chapters);
  const numbers = compulsoryNumbers(ids);
  const rows = withDaySeparators(withResetSeparators(data.actions, data.resets as MeetingResetMark[]));
  return rows.map((r): ExportRow => {
    if (r.kind === 'day') return { kind: 'note', text: daySeparatorHe(r.at), tone: 'day' };
    if (r.kind === 'reset') return { kind: 'note', text: resetSeparatorHe(r.reset), tone: 'reset' };
    const e = r.event;
    const d = describeEvent(e);
    const n = numbers.get(e.exerciseId);
    return {
      kind: 'event',
      ts: e.timestamp,
      clock: formatClock(e.timestamp),
      exercise: n !== undefined ? String(n) : ids.includes(e.exerciseId) ? 'בחירה' : '–',
      exerciseTitle: exerciseTitle(data.meeting, e.exerciseId),
      label: d.label,
      detail: d.detail,
      attention: d.attention,
      selfRegulation: d.selfRegulation,
    };
  });
}

/** JSON that can sit inside a <script> element: no "<" can close it early. */
const scriptJson = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003c');
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The page. `replayLib` is rrweb's standalone build and its stylesheet, put
 * inside the file so the player works offline.
 */
export function buildMeetingViewerHtml(data: MeetingExport, replayLib: { js: string; css: string }): string {
  const rows = meetingExportRows(data);
  const chapters = data.chapters.map((c) => ({ start: c.start, end: c.end, title: exerciseTitle(data.meeting, c.exerciseId), clock: formatClock(c.start) }));
  const first = data.actions[0]?.timestamp ?? (data.recording.events[0] as { timestamp?: number } | undefined)?.timestamp;
  const title = `תלמיד ${data.learner} · מפגש ${data.meeting} · ${(STATION_NAMES_HE as Record<number, string>)[data.meeting] ?? ''}`;
  const sub = [
    first ? `התקיים ב-${formatDate(first)}` : null,
    `${data.actions.length} פעולות מתועדות`,
    `הורד ב-${formatDate(Date.parse(data.exportedAt))}`,
  ].filter(Boolean).join(' · ');
  const view = { rows, chapters, truncated: data.recording.truncated };
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${replayLib.css}</style>
<style>
:root{--ink:#0f172a;--soft:#64748b;--line:#e2e8f0;--bg:#f8fafc;--card:#fff;--accent:#4f46e5;--accentSoft:#eef2ff;--warn:#92400e;--warnBg:#fffbeb}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,"Segoe UI",Arial,sans-serif}
header{padding:20px 24px 12px}
h1{margin:0;font-size:20px;font-weight:800}
.sub{color:var(--soft);font-size:13px;margin-top:2px}
.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;padding:0 24px 24px;align-items:start}
@media (max-width:1100px){.grid{grid-template-columns:minmax(0,1fr)}}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.card h2{margin:0;font-size:14px;font-weight:800;padding:12px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
.card h2 span{color:var(--soft);font-weight:600;font-size:12px}
.tbl{max-height:calc(100vh - 140px);overflow:auto}
table{width:100%;border-collapse:collapse;font-size:12px}
th{position:sticky;top:0;background:var(--bg);color:var(--soft);text-align:right;padding:8px;border-bottom:1px solid var(--line)}
td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
tr.ev{cursor:pointer}
tr.ev:hover{background:var(--bg)}
tr.ev.on{background:var(--accentSoft);box-shadow:inset -4px 0 0 var(--accent)}
tr.att td{color:var(--warn)}
tr.note td{font-weight:800;font-size:11px;color:var(--soft);background:var(--bg)}
tr.note.reset td{color:#451a03;background:#fef3c7}
.clock{font-family:ui-monospace,monospace;color:var(--soft);white-space:nowrap}
.lbl{font-weight:700}
.player{background:#020617;color:#fff;border-color:#1e293b;position:sticky;top:12px}
.player h2{border-color:#1e293b}
.player h2 span{color:#94a3b8}
#stage{position:relative;overflow:hidden;background:#0f172a}
.ctl{display:flex;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid #1e293b}
.ctl button{background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:10px;padding:6px 10px;font:inherit;font-weight:700;cursor:pointer}
.ctl button.on,.ctl button.play{background:var(--accent);border-color:var(--accent);color:#fff}
.ctl input{flex:1;accent-color:#818cf8;direction:ltr}
.time{font-family:ui-monospace,monospace;color:#cbd5e1;font-size:12px;white-space:nowrap;direction:ltr}
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 12px}
.chips button{background:#0f172a;color:#cbd5e1;border:1px solid #334155;border-radius:8px;padding:3px 8px;font:inherit;font-size:11px;font-weight:700;cursor:pointer}
.empty{padding:48px 24px;text-align:center;color:#cbd5e1}
.warn{margin:10px 12px 0;padding:8px 12px;border-radius:10px;background:#451a03;color:#fde68a;font-size:12px;font-weight:700}
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <div class="sub">${escapeHtml(sub)}</div>
</header>
<div class="grid">
  <section class="card">
    <h2>ציר ההחלטות <span>לחיצה על שורה מקפיצה את ההקלטה לאותו רגע</span></h2>
    <div class="tbl"><table>
      <thead><tr><th>שעה</th><th>תרגיל</th><th>פעולה</th><th>פרטים</th><th title="מחיקה או ביטול פעולה">בקרה</th></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>
  </section>
  <section class="card player">
    <h2>שחזור מסך העבודה, ללא קול <span id="len"></span></h2>
    <div id="warn"></div>
    <div id="stage"></div>
    <div class="ctl" id="ctl" hidden>
      <button type="button" class="play" id="play">הפעלה</button>
      <input type="range" id="seek" min="0" max="1000" value="0" aria-label="מיקום בהקלטה">
      <span class="time" id="time">00:00 / 00:00</span>
      <button type="button" data-speed="1" class="on">×1</button>
      <button type="button" data-speed="2">×2</button>
      <button type="button" data-speed="4">×4</button>
    </div>
    <div class="chips" id="chips"></div>
  </section>
</div>
<script type="application/json" id="meeting-data">${scriptJson(data)}</script>
<script type="application/json" id="meeting-view">${scriptJson(view)}</script>
<script>${replayLib.js.replace(/<\/script/gi, '<\\/script')}</script>
<script>
(function () {
  var data = JSON.parse(document.getElementById('meeting-data').textContent);
  var view = JSON.parse(document.getElementById('meeting-view').textContent);
  var events = (data.recording.events || []).filter(function (e) { return e && isFinite(e.timestamp); });
  var start = events.length ? events[0].timestamp : 0;
  var total = events.length ? events[events.length - 1].timestamp - start : 0;
  var tbody = document.getElementById('rows');
  var evRows = [];
  var seekFn = null; // set once the recording plays
  function cell(tr, text, cls, title) { var td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; if (title) td.title = title; tr.appendChild(td); }
  view.rows.forEach(function (r) {
    var tr = document.createElement('tr');
    if (r.kind === 'note') { tr.className = 'note ' + r.tone; var td = document.createElement('td'); td.colSpan = 5; td.textContent = r.text; tr.appendChild(td); }
    else {
      tr.className = 'ev' + (r.attention ? ' att' : '');
      cell(tr, r.clock, 'clock'); cell(tr, r.exercise, '', r.exerciseTitle); cell(tr, r.label, 'lbl'); cell(tr, r.detail); cell(tr, r.selfRegulation ? '✓' : '');
      tr.addEventListener('click', function () { if (seekFn) seekFn(r.ts - start, true); });
      evRows.push({ ts: r.ts, tr: tr });
    }
    tbody.appendChild(tr);
  });
  function fmt(ms) { var s = Math.max(0, Math.round(ms / 1000)); var m = Math.floor(s / 60); return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  var stage = document.getElementById('stage');
  if (view.truncated) document.getElementById('warn').innerHTML = '<div class="warn">ההקלטה נקטעה בתקרת 50MB. הפעולות בטבלה מלאות.</div>';
  if (events.length < 2 || !window.rrweb) {
    stage.innerHTML = '<div class="empty">למפגש זה אין הקלטת מסך שמורה. הפעולות המתועדות מוצגות בטבלה.</div>';
    return;
  }
  document.getElementById('len').textContent = fmt(total);
  var meta = events.filter(function (e) { return e.type === 4; })[0];
  var w = (meta && meta.data && meta.data.width) || 1280, h = (meta && meta.data && meta.data.height) || 720;
  var replayer = new rrweb.Replayer(events, { root: stage, triggerFocus: false, showWarning: false, UNSAFE_replayCanvas: true, mouseTail: { duration: 500, lineCap: 'round', lineWidth: 3, strokeStyle: 'red' } });
  function fit() {
    var wrap = stage.querySelector('.replayer-wrapper'); if (!wrap) return;
    var k = stage.clientWidth / w;
    wrap.style.width = w + 'px'; wrap.style.height = h + 'px'; wrap.style.transformOrigin = 'top left';
    wrap.style.transform = 'scale(' + k + ')'; wrap.style.position = 'absolute'; wrap.style.top = '0'; wrap.style.left = '0';
    stage.style.height = Math.round(h * k) + 'px';
  }
  fit(); window.addEventListener('resize', fit);
  document.getElementById('ctl').hidden = false;
  var playing = false, playBtn = document.getElementById('play'), seek = document.getElementById('seek'), time = document.getElementById('time');
  function setPlaying(p) { playing = p; playBtn.textContent = p ? 'השהיה' : 'הפעלה'; }
  function seekTo(ms, play) { ms = Math.max(0, Math.min(total, ms)); if (play) { replayer.play(ms); setPlaying(true); } else { replayer.pause(ms); setPlaying(false); } tick(); }
  seekFn = seekTo;
  playBtn.addEventListener('click', function () { if (playing) { replayer.pause(); setPlaying(false); } else { var t = replayer.getCurrentTime(); replayer.play(t >= total ? 0 : t); setPlaying(true); } });
  seek.addEventListener('input', function () { seekTo(total * seek.value / 1000, playing); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-speed]'), function (b) {
    b.addEventListener('click', function () {
      replayer.setConfig({ speed: Number(b.getAttribute('data-speed')) });
      Array.prototype.forEach.call(document.querySelectorAll('[data-speed]'), function (o) { o.classList.toggle('on', o === b); });
    });
  });
  replayer.on('finish', function () { setPlaying(false); });
  var chips = document.getElementById('chips');
  view.chapters.forEach(function (c) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = c.clock + ' · ' + c.title; b.title = 'קפיצה לתחילת התרגיל';
    b.addEventListener('click', function () { seekTo(c.start - start, true); }); chips.appendChild(b);
  });
  var lastOn = null;
  function tick() {
    var t = Math.min(total, replayer.getCurrentTime() || 0);
    time.textContent = fmt(t) + ' / ' + fmt(total);
    if (document.activeElement !== seek) seek.value = String(total ? Math.round(t / total * 1000) : 0);
    var abs = start + t, on = null;
    for (var i = 0; i < evRows.length && evRows[i].ts <= abs; i++) on = evRows[i].tr;
    if (on !== lastOn) {
      if (lastOn) lastOn.classList.remove('on');
      if (on) { on.classList.add('on'); on.scrollIntoView({ block: 'nearest' }); }
      lastOn = on;
    }
  }
  setInterval(tick, 250);
  replayer.pause(0); tick();
})();
</script>
</body>
</html>
`;
}

/**
 * Builds the page and saves it. rrweb's standalone build is read only here,
 * on the click, so it is not part of what every dashboard load downloads.
 */
export async function downloadMeetingExport(data: MeetingExport): Promise<void> {
  const [js, css] = await Promise.all([
    import('../../../../node_modules/rrweb/dist/rrweb.umd.min.cjs?raw').then((m) => m.default),
    import('../../../../node_modules/rrweb/dist/style.min.css?raw').then((m) => m.default),
  ]);
  const html = buildMeetingViewerHtml(data, { js, css });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = meetingExportFileName(data.learner, data.meeting, new Date(data.exportedAt));
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
