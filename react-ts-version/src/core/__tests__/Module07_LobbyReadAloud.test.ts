import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 7 (UDL): "כל הנחיה המוצגת ללומד על גבי המסך מלווה בכפתור הקראה קולית
 * ייעודי… מופעלת אך ורק בלחיצה יזומה של הלומד."
 *
 * Found on the live site (15.9.2026): the student lobby was the one learner
 * screen with text and no read-aloud button. Every other waiting screen — the
 * bee flight, the projector, the paused and closed overlays — already had one.
 * A learner who cannot read the Hebrew had no way to hear "היום עוד לא
 * התחלנו" or the name of the meeting the teacher opened.
 */
const hub = readFileSync(resolve(__dirname, '../../presentation/pages/StudentHub.tsx'), 'utf-8');

describe('Module 7 — the lobby reads its own text aloud on request', () => {
  it('imports the shared read-aloud button', () => {
    expect(hub).toContain("import { UdlSpeechButton } from \"@/presentation/design-system/UdlSpeechButton\";");
  });

  it('covers every waiting sentence a learner can see in the lobby (PRD 14 §ב0)', () => {
    // One sentence per state — not started, paused, finished, closed unfinished —
    // in the teacher's gender (core/lobbyState.ts, core/teacherGender.ts); the
    // one waiting screen reads whichever is shown. The other lobby state is the
    // station's opening screen, which carries its own button (StationOpening).
    expect(hub).toContain('<UdlSpeechButton text={sentence} className="shrink-0" />');
  });

  it('never speaks on its own — no autoplay anywhere in the lobby', () => {
    expect(hub).not.toMatch(/speechSynthesis\.speak|\.speak\(/);
    expect(hub).not.toMatch(/autoPlay|autoplay/);
  });
});
