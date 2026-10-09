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

  const handleSpeak = () => {
    if (isPlaying) {
      tts.stop();
      handleRef.current = 0;
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    handleRef.current = tts.speak(
      text,
      lang,
      () => setIsPlaying(false),
      () => setIsPlaying(false)
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
