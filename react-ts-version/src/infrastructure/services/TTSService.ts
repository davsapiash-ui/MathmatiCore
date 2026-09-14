/**
 * TTSService.ts
 * Hebrew narration for the student interface (PRD Module 24 / UDL): client-side Web
 * Speech API, in Hebrew, and only ever on an explicit student click — autoplay is
 * forbidden, and there is no voice input anywhere in the system.
 *
 * There are no narration audio files: the browser synthesises every instruction on the
 * spot. That API fails in several browser-specific ways a child experiences identically
 * — "the speaker button is dead" — so each workaround below is labelled with the failure
 * it exists for:
 *   F1. cancel() is asynchronous; an utterance handed over in the same tick is dropped
 *       without a sound, which is why a second press used to do nothing.
 *   F2. an engine left paused silently swallows everything queued after it.
 *   F3. Chromium stops mid-read after ~15 seconds, truncating our longer instructions.
 *   F4. utterances nothing references get garbage collected, onend never arrives, and
 *       the button stays stuck mid-read with no way to replay.
 *   F5. getVoices() is empty until the voice list loads, so an early click gets the
 *       default (English) voice reading Hebrew.
 */

export class TTSService {
  private static instance: TTSService;

  /** Ceiling per utterance, chosen to stay well inside Chromium's ~15s cutoff (F3). */
  private static readonly MAX_CHUNK_CHARS = 140;
  /** Below this a sentence break is not worth a chunk of its own. */
  private static readonly MIN_CHUNK_CHARS = 60;
  /** How long a first click waits for the voice list before speaking anyway (F5). */
  private static readonly VOICE_WAIT_MS = 600;
  /** Poll cadence and ceiling while waiting for cancel() to drain the queue (F1). */
  private static readonly DRAIN_INTERVAL_MS = 25;
  private static readonly DRAIN_MAX_ATTEMPTS = 20;
  /** Watchdog cadence for an engine that drops the queue without telling us (F4). */
  private static readonly WATCHDOG_MS = 1500;

  private voices: SpeechSynthesisVoice[] = [];
  private isLoaded = false;
  private audioUnlocked = false;
  private warnedNoVoice = false;

  /** Holds the utterances the engine is reading, so they are not collected (F4). */
  private activeUtterances: SpeechSynthesisUtterance[] = [];
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  /** Identifies the newest request, so a stale callback cannot clear newer state. */
  private currentToken = 0;
  private voiceWaiters: Array<() => void> = [];

  private constructor() {
    this.initVoices();
  }

  public static getInstance(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  public isSupported(): boolean {
    // `'speechSynthesis' in window` is not enough: the property can exist and hold
    // undefined (jsdom, and browsers that expose the name without the engine), and
    // every call on it would then throw where a dead button is the better failure.
    return (
      typeof window !== 'undefined' &&
      typeof window.speechSynthesis === 'object' &&
      window.speechSynthesis !== null &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }

  /**
   * PRD Module 24 audio entry gate: captures the login click so the browser unlocks
   * speech for the rest of the session.
   */
  public initializeAudioGate(): boolean {
    if (!this.isSupported()) return false;
    try {
      // Browsers unlock speech only once the document has been interacted with, so this
      // has to stay on the login click path. The text is a real character on purpose —
      // Chromium discards a whitespace-only utterance and audio would stay locked.
      const silentUtterance = new SpeechSynthesisUtterance('.');
      silentUtterance.volume = 0;
      silentUtterance.lang = 'he-IL';
      window.speechSynthesis.speak(silentUtterance);
      this.audioUnlocked = true;
      // Warm the voice list here too, so the first real click finds it ready (F5).
      this.loadVoices();
      return true;
    } catch (e) {
      console.warn('Audio gate initialization failed:', e);
      return false;
    }
  }

  public isAudioUnlocked(): boolean {
    return this.audioUnlocked;
  }

  /** Whether a voice for this language is actually installed on the machine. */
  public hasVoiceFor(lang: string = 'he-IL'): boolean {
    return this.pickVoice(lang) !== undefined;
  }

  private loadVoices() {
    if (!this.isSupported()) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return;
    this.voices = voices;
    this.isLoaded = true;
    const waiters = this.voiceWaiters;
    this.voiceWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private initVoices() {
    if (!this.isSupported()) return;
    this.loadVoices();
    // addEventListener, not onvoiceschanged=: the list is replaced more than once
    // (Chromium appends its network voices after the local ones), and assigning the
    // property would clobber any other listener.
    window.speechSynthesis.addEventListener('voiceschanged', () => this.loadVoices());
  }

  /** Resolves once the voice list is populated, or after a short deadline (F5). */
  private whenVoicesReady(): Promise<void> {
    if (!this.isSupported()) return Promise.resolve();
    this.loadVoices();
    if (this.isLoaded) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      this.voiceWaiters.push(finish);
      setTimeout(finish, TTSService.VOICE_WAIT_MS);
    });
  }

  private pickVoice(lang: string): SpeechSynthesisVoice | undefined {
    if (this.voices.length === 0) return undefined;
    const langPrefix = lang.split('-')[0].toLowerCase();
    // Hebrew ships under more than one tag: 'he', the legacy 'iw', and vendor spellings.
    const tags = langPrefix === 'he' ? ['he', 'iw'] : [langPrefix];
    const names = langPrefix === 'he' ? ['hebrew', 'עברית', 'asaf', 'hila', 'carmit'] : [];

    const langVoices = this.voices.filter((v) => {
      const vl = v.lang.toLowerCase().replace(/_/g, '-');
      const vn = v.name.toLowerCase();
      return tags.some((t) => vl.startsWith(t)) || names.some((n) => vn.includes(n));
    });
    if (langVoices.length === 0) return undefined;

    // Prefer high quality, natural, or dedicated Hebrew voices.
    return (
      langVoices.find((v) => {
        const vn = v.name.toLowerCase();
        return (
          vn.includes('google') ||
          vn.includes('online') ||
          vn.includes('natural') ||
          vn.includes('asaf') ||
          vn.includes('hila')
        );
      }) ?? langVoices[0]
    );
  }

  private cleanTextForSpeech(text: string): string {
    if (!text) return '';
    // Strip markdown formatting (*, _, #, `, ~)
    let cleaned = text.replace(/[*_#`~]/g, '');
    // Strip emojis
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '');
    // Normalize numbered lists like "1. " and "2. " into natural speech pauses
    cleaned = cleaned.replace(/(?:^|\n)\s*1\.\s*/g, ' שלב ראשון: ');
    cleaned = cleaned.replace(/(?:^|\n)\s*2\.\s*/g, ' שלב שני: ');
    cleaned = cleaned.replace(/(?:^|\n)\s*3\.\s*/g, ' שלב שלישי: ');
    cleaned = cleaned.replace(/(?:^|\n)\s*4\.\s*/g, ' שלב רביעי: ');
    cleaned = cleaned.replace(/(?:^|\n)\s*5\.\s*/g, ' שלב חמישי: ');
    // Replace remaining newlines with natural pauses
    cleaned = cleaned.replace(/\n+/g, '. ');
    // Clean extra spaces
    return cleaned.replace(/\s+/g, ' ').trim();
  }

  /**
   * Splits a long instruction into utterances the engine will finish (F3). Packing is
   * done word by word and closed at sentence punctuation where one falls in range, so
   * the seam lands on a pause the child would hear anyway.
   */
  private chunkText(text: string): string[] {
    if (text.length <= TTSService.MAX_CHUNK_CHARS) return [text];

    const chunks: string[] = [];
    let current = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > TTSService.MAX_CHUNK_CHARS && current) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
      if (current.length >= TTSService.MIN_CHUNK_CHARS && /[.!?:;]$/.test(current)) {
        chunks.push(current);
        current = '';
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * Reads the text aloud. Returns a handle identifying this read, for stopIfCurrent.
   */
  public speak(
    text: string,
    lang: string = 'he-IL',
    onEnd?: () => void,
    onError?: (e: Event) => void
  ): number {
    if (!this.isSupported()) {
      if (onError) onError(new Event('TTSNotSupported'));
      return 0;
    }

    const cleanText = this.cleanTextForSpeech(text);
    if (!cleanText) {
      if (onEnd) onEnd();
      return 0;
    }

    const token = ++this.currentToken;
    this.cancelCurrent();

    const begin = () =>
      this.whenQueueDrained(token, () =>
        this.speakChunks(token, this.chunkText(cleanText), lang, onEnd, onError)
      );

    // Stay synchronous inside the click handler whenever the voice list is ready; only
    // a cold first click pays the wait (F5).
    if (this.isLoaded) {
      begin();
    } else {
      void this.whenVoicesReady().then(() => {
        if (token === this.currentToken) begin();
      });
    }

    return token;
  }

  /**
   * cancel() returns before the queue is actually empty, and an utterance handed over
   * in that window is discarded without a sound (F1). An idle engine runs `run`
   * straight away, so a single button pays no delay at all.
   */
  private whenQueueDrained(token: number, run: () => void, attempt = 0) {
    if (token !== this.currentToken) return;
    const synth = window.speechSynthesis;
    if ((synth.speaking || synth.pending) && attempt < TTSService.DRAIN_MAX_ATTEMPTS) {
      this.startTimer = setTimeout(
        () => this.whenQueueDrained(token, run, attempt + 1),
        TTSService.DRAIN_INTERVAL_MS
      );
      return;
    }
    this.startTimer = null;
    run();
  }

  private speakChunks(
    token: number,
    chunks: string[],
    lang: string,
    onEnd?: () => void,
    onError?: (e: Event) => void
  ) {
    if (token !== this.currentToken) return;
    if (chunks.length === 0) {
      if (onEnd) onEnd();
      return;
    }

    const synth = window.speechSynthesis;
    const voice = this.pickVoice(lang);
    if (!voice && !this.warnedNoVoice) {
      this.warnedNoVoice = true;
      console.warn(
        `[TTS] No ${lang} voice is installed in this browser, so narration will be silent ` +
          'or mispronounced. Install a Hebrew system voice (Windows: Settings → Time & ' +
          'Language → Speech; ChromeOS/Android: Google Text-to-Speech Hebrew).'
      );
    }

    // The caller is always told the read is over, even when a newer read superseded it,
    // so its button never stays stuck; only current state is cleared.
    let settled = false;
    const settle = (notify: () => void) => {
      if (settled) return;
      settled = true;
      if (token === this.currentToken) {
        this.stopWatchdog();
        this.activeUtterances = [];
      }
      notify();
    };

    const utterances = chunks.map((chunk) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = lang;
      utterance.rate = 0.92; // Slightly slower for better pedagogical clarity
      utterance.pitch = 1.0;
      if (voice) utterance.voice = voice;
      utterance.onerror = (e) => settle(() => onError && onError(e));
      return utterance;
    });
    utterances[utterances.length - 1].onend = () => settle(() => onEnd && onEnd());

    // Hold the references: an utterance only the engine knows about is collected
    // mid-read, and its onend never arrives (F4).
    this.activeUtterances = utterances;

    // A paused engine silently swallows whatever is queued next (F2).
    if (synth.paused) synth.resume();
    for (const utterance of utterances) synth.speak(utterance);

    this.startWatchdog(token, () => settle(() => onEnd && onEnd()));
  }

  /**
   * Some engines drop the queue without firing onend or onerror (F4). Two consecutive
   * idle observations mean the read is over whatever the engine claims, and releasing
   * the caller is what keeps its button from freezing mid-read.
   */
  private startWatchdog(token: number, settle: () => void) {
    this.stopWatchdog();
    let idleTicks = 0;
    this.watchdogTimer = setInterval(() => {
      if (token !== this.currentToken) {
        this.stopWatchdog();
        return;
      }
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) {
        idleTicks = 0;
        return;
      }
      idleTicks += 1;
      if (idleTicks >= 2) {
        this.stopWatchdog();
        settle();
      }
    }, TTSService.WATCHDOG_MS);
  }

  private stopWatchdog() {
    if (this.watchdogTimer !== null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private cancelCurrent() {
    if (!this.isSupported()) return;
    this.stopWatchdog();
    this.activeUtterances = [];
    if (this.startTimer !== null) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    const synth = window.speechSynthesis;
    // Resume first: cancel() on a paused engine can leave it paused, and everything
    // queued afterwards is then inaudible (F2).
    if (synth.paused) synth.resume();
    if (synth.speaking || synth.pending) synth.cancel();
  }

  public stop() {
    if (!this.isSupported()) return;
    this.currentToken += 1; // invalidates anything queued or waiting to start
    this.cancelCurrent();
  }

  /**
   * Stops only the read started by this handle. The service is a singleton shared by
   * every speech button, so an unmounting component calling stop() outright would cut
   * off whichever button is actually speaking — under StrictMode, on every mount.
   */
  public stopIfCurrent(handle: number) {
    if (handle !== 0 && handle === this.currentToken) this.stop();
  }
}

export const tts = TTSService.getInstance();
