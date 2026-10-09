import type { ReactNode } from 'react';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

export const DEVICE_SUPERSEDED_TITLE = 'המשכתם במכשיר אחר';
export const DEVICE_SUPERSEDED_LINE = 'העבודה שלכם נשמרה. אם לא עברתם למכשיר אחר, קראו למורה.';

/**
 * PRD Module 1 §א: the earlier device "עובר למצב קריאה בלבד עם ההודעה
 * "המשכתם במכשיר אחר", ובשורה שנייה "העבודה שלכם נשמרה. אם לא עברתם למכשיר
 * אחר, קראו למורה."". The same screen in the lobby and in the workspace.
 *
 * The child is locked out here with no other cue: the screen's own words get
 * a read-aloud button (PRD 7 §א), on the child's click only. `children` sits
 * above the card (the workspace's cloud, PRD 17 §ד: work may still wait in
 * this device's queue).
 */
export function DeviceSupersededScreen({ children }: { children?: ReactNode }) {
  return (
    <div
      data-testid="device-superseded"
      role="status"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ws-bg p-6 font-body text-center"
      dir="rtl"
    >
      {children}
      {/* The same quiet card as the lobby, the opening and the end screens
          (PRD 7 §א: one calm colour code), no emoji. */}
      <div className="max-w-md w-full bg-ws-surface text-ws-ink border-2 border-ws-surface2 rounded-3xl p-10 shadow-sm space-y-4">
        <h2 className="font-display font-black text-2xl text-ws-ink">{DEVICE_SUPERSEDED_TITLE}</h2>
        <p className="text-base text-ws-soft leading-relaxed">{DEVICE_SUPERSEDED_LINE}</p>
        <UdlSpeechButton text={`${DEVICE_SUPERSEDED_TITLE}. ${DEVICE_SUPERSEDED_LINE}`} />
      </div>
    </div>
  );
}
