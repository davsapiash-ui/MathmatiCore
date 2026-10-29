import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { UdlButton } from './UdlButton';
import { tts } from '@/infrastructure/services/TTSService';

interface UdlSpeechButtonProps {
  text: string;
  lang?: string;
  className?: string;
  /** Told when this button's read starts and ends — a passing message stays on screen while it is read. */
  onPlayingChange?: (playing: boolean) => void;
}

/**
 * Whether the read-aloud buttons exist on this screen. The learner's screens
 * have them; the teacher's demonstration screen (ProjectorSandboxPage) shows
 * the learner's own components with narration off — the teacher's screens
 * have no narration at all (AGENTS.md invariant 6; PRD Modules 7, 15 §ג, 24).
 */
export const NarrationContext = createContext(true);

/** How long a second press waits for the voice to start before it may stop the read. */
const STARTUP_GRACE_MS = 4000;

export function UdlSpeechButton(props: UdlSpeechButtonProps) {
  return useContext(NarrationContext) ? <SpeechButton {...props} /> : null;
}

function SpeechButton({ text, lang = 'he-IL', className = '', onPlayingChange }: UdlSpeechButtonProps) {
  const [isPlaying, setIsPlayingState] = useState(false);
  /** Which read this button owns, so unmounting it cannot silence a different button. */
  const handleRef = useRef(0);
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;
  const setIsPlaying = (playing: boolean) => {
    setIsPlayingState(playing);
    onPlayingChangeRef.current?.(playing);
  };

  /** When this button's read was pressed, and whether its voice has been heard yet. */
  const pressedAtRef = useRef(0);
  const startedRef = useRef(false);

  const handleSpeak = () => {
    if (isPlaying) {
      // The engine can take a second or more before the first word (2.7s measured on
      // a cold Windows engine). A child who hears nothing presses again, and that
      // press used to stop the read before it was ever heard. Until the voice starts,
      // a second press leaves the read alone; the ceiling keeps an engine that never
      // reports its start from locking the button.
      if (!startedRef.current && Date.now() - pressedAtRef.current < STARTUP_GRACE_MS) return;
      tts.stop();
      handleRef.current = 0;
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    pressedAtRef.current = Date.now();
    startedRef.current = false;
    handleRef.current = tts.speak(
      text,
      lang,
      () => setIsPlaying(false),
      () => setIsPlaying(false),
      () => {
        startedRef.current = true;
      }
    );
  };

  useEffect(() => {
    // Scoped to the student surfaces by construction: this button exists nowhere else.
    // Covers the child who reloads mid-lesson and never passes the login gate again.
    tts.armAudioGate();
    return () => {
      // Only our own read: tts is a singleton shared by every speech button, so an
      // unconditional stop() here cuts off whichever button is actually speaking —
      // under StrictMode that happens on every mount.
      tts.stopIfCurrent(handleRef.current);
    };
  }, []);

  return (
    <UdlButton
      variant="outline"
      size="icon"
      semanticColor={isPlaying ? "primary" : "neutral"}
      onClick={handleSpeak}
      // The touch target is 44×44 (DESIGN_SYSTEM_RULES.md) — this is the
      // child's read-aloud, on every screen, on tablets too — but the button
      // keeps its 32px look: the extra 6px on each side is an invisible hit
      // area, so no instruction row, checklist or heading grows and no screen
      // that fits today stops fitting (a visible 44px button pushed the iPad's
      // task card and the meeting-1 checklist into scrolling).
      className={`relative before:absolute before:-inset-1.5 before:content-[''] before:rounded-full rounded-full shadow-sm hover:shadow-md transition-all ${isPlaying ? 'animate-pulse' : ''} ${className}`}
      aria-label="הקראה בקול"
      title="הקראה בקול"
    >
      {isPlaying ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
    </UdlButton>
  );
}
