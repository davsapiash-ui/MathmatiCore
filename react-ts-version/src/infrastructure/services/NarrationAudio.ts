/**
 * Recorded narration (PRD Module 7, owner, 29.10.2026): every fixed sentence of the
 * child's screens has a Hebrew recording made ahead of time from pointed text
 * (tools/narration), so a press sounds the same, and correct, on every device — the
 * device voice depends on which Hebrew voice the device happens to have, and reads
 * unpointed Hebrew by guessing ("בשורת" as בְּשׂוֹרַת, "לבנים" as לְבָנִים).
 *
 * A text is played from recordings only when every one of its sentences has one
 * (core/narrationSegments.ts); otherwise TTSService reads it with the device voice, as
 * before. A recording that fails to load hands the rest of the text to the device voice.
 */

import { narrationKey, narrationSegments } from '@/core/narrationSegments';
import type { TeacherGender } from '@/core/teacherGender';

const BASE = '/narration/';

interface Manifest {
  keys: string[];
}

export interface AudioRead {
  /** Called once, when the first recording starts to sound. */
  onStart?: () => void;
  /** Called once, after the last recording ends. */
  onEnd: () => void;
  /**
   * Called once if a recording cannot be played, with the sentences not yet heard, so
   * the caller can read them with the device voice.
   */
  onFail: (rest: string) => void;
}

class NarrationAudioPlayer {
  private keys: Set<string> | null = null;
  private loading: Promise<void> | null = null;
  private audio: HTMLAudioElement | null = null;
  /** Identifies the newest read, so a stale event cannot touch a newer one. */
  private token = 0;

  public isSupported(): boolean {
    return typeof window !== 'undefined' && typeof Audio !== 'undefined' && typeof fetch === 'function';
  }

  /**
   * Fetches the list of recordings. Called when a speech button first appears, so that
   * the first press finds it ready; until it arrives presses use the device voice.
   */
  public preload(): Promise<void> {
    if (!this.isSupported()) return Promise.resolve();
    if (this.keys || this.loading) return this.loading ?? Promise.resolve();
    this.loading = fetch(`${BASE}manifest.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .then((m) => {
        if (m && Array.isArray(m.keys)) this.keys = new Set(m.keys);
      })
      .catch(() => {
        // Offline at first load, or no recordings deployed: the device voice reads.
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  /** The recordings for this text, in order, or null when any sentence has none. */
  public plan(text: string, gender: TeacherGender): { files: string[]; segments: string[] } | null {
    if (!this.keys) return null;
    const segments = narrationSegments(text);
    if (segments.length === 0) return null;
    const files: string[] = [];
    for (const s of segments) {
      const key = narrationKey(s, gender);
      if (!this.keys.has(key)) return null;
      files.push(`${BASE}${key}.mp3`);
    }
    return { files, segments };
  }

  /**
   * Plays the recordings one after another on a single audio element. The first play()
   * runs inside the child's click, which is what lets tablets play the rest.
   */
  public play(plan: { files: string[]; segments: string[] }, read: AudioRead): void {
    const token = ++this.token;
    const audio = this.audio ?? (this.audio = new Audio());
    audio.preload = 'auto';
    let index = 0;
    let started = false;
    let settled = false;

    const current = () => token === this.token;
    const finish = (fn: () => void) => {
      if (settled || !current()) return;
      settled = true;
      audio.onended = audio.onerror = audio.onplaying = null;
      fn();
    };
    const fail = () => finish(() => read.onFail(plan.segments.slice(index).join(' ')));

    audio.onplaying = () => {
      if (!current() || started) return;
      started = true;
      read.onStart?.();
    };
    audio.onerror = fail;
    audio.onended = () => {
      if (!current()) return;
      index += 1;
      if (index >= plan.files.length) finish(read.onEnd);
      else start();
    };
    const start = () => {
      audio.src = plan.files[index];
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(fail);
    };
    start();
  }

  /** Stops whatever is playing. Its read is not told anything: the caller already moved on. */
  public stop(): void {
    this.token += 1;
    const audio = this.audio;
    if (!audio) return;
    audio.onended = audio.onerror = audio.onplaying = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
}

export const narrationAudio = new NarrationAudioPlayer();
