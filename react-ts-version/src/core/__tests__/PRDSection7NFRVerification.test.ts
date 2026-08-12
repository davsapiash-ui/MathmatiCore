import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TTSService, tts } from '@/infrastructure/services/TTSService';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { FirebaseSyncService, firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

// Mock window and localStorage for Node test environment
if (typeof window === 'undefined' || !window.localStorage) {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    length: 0,
    key: () => null
  } as unknown as Storage;
  // @ts-ignore
  global.SpeechSynthesisUtterance = class {
    text: string;
    volume: number = 1;
    constructor(text: string) {
      this.text = text;
    }
  };
  // @ts-ignore
  global.window = {
    localStorage: mockStorage,
    SpeechSynthesisUtterance: global.SpeechSynthesisUtterance,
    speechSynthesis: {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => [])
    } as unknown as SpeechSynthesis
  };
  // @ts-ignore
  global.localStorage = mockStorage;
}

// Mock Firebase DB
vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  set: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
  update: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'mock_milestone_key' })),
  onValue: vi.fn(),
  onDisconnect: vi.fn(() => ({ set: vi.fn() })),
  serverTimestamp: vi.fn(() => 123456789)
}));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  functions: {},
  authReady: Promise.resolve(true)
}));

describe('PRD V2.0 Section 7 Non-Functional Requirements Verification Suite', () => {

  describe('1. Audio Initialization Entry Gate (TTSService)', () => {
    it('verifies initial state is locked before user gesture', () => {
      expect(tts.isAudioUnlocked()).toBe(false);
    });

    it('unlocks Web Audio & SpeechSynthesis permission upon initializeAudioGate user gesture', () => {
      const mockSpeak = vi.fn();
      // @ts-ignore
      global.window.speechSynthesis = {
        speak: mockSpeak,
        cancel: vi.fn(),
        getVoices: vi.fn(() => [])
      };

      const result = tts.initializeAudioGate();
      expect(result).toBe(true);
      expect(tts.isAudioUnlocked()).toBe(true);
      expect(mockSpeak).toHaveBeenCalled();
    });
  });

  describe('2. AI Latency Pre-fetching <200ms (SocraticEngine)', () => {
    it('pre-fetches and caches all session hints into memory upon session initialization', async () => {
      await SocraticEngine.prefetchSessionHints(3);

      const cachedHint1 = SocraticEngine.getCachedHint(3, 'subtraction_regrouping');
      expect(cachedHint1).not.toBeNull();
      expect(cachedHint1?.questionHe).toContain('חסרות לנו יחידות');

      const cachedHint2 = SocraticEngine.getCachedHint(3, 'addition_regrouping');
      expect(cachedHint2).not.toBeNull();
      expect(cachedHint2?.questionHe).toContain('יותר מ-9 קוביות');
    });

    it('returns cached hint instantly (<200ms) without blocking HTTP network calls', async () => {
      const startTime = performance.now();
      const hint = SocraticEngine.getCachedHint(3, 'q_matrix_general');
      const endTime = performance.now();

      expect(hint).not.toBeNull();
      expect(endTime - startTime).toBeLessThan(50); // Under 50ms instant cache lookup
    });
  });

  describe('3. Offline Resilience & Persistent Caching (FirebaseSyncService)', () => {
    it('caches session progress in localStorage to survive browser refreshes during network drops', () => {
      const sessionPayload = {
        sessionId: 'session_3_test',
        currentTaskIndex: 1,
        completedTasks: ['task_1'],
        blocksState: { units: 5, tens: 2, hundreds: 0, thousands: 0 }
      };

      firebaseSyncService.saveSessionProgressLocally('student_nfr_999', sessionPayload);
      const retrieved = firebaseSyncService.getLocalSessionProgress('student_nfr_999');

      expect(retrieved).not.toBeNull();
      expect(retrieved.sessionId).toBe('session_3_test');
      expect(retrieved.currentTaskIndex).toBe(1);
      expect(retrieved.blocksState.units).toBe(5);

      firebaseSyncService.clearLocalSessionProgress('student_nfr_999');
      expect(firebaseSyncService.getLocalSessionProgress('student_nfr_999')).toBeNull();
    });

    it('logs Milestone Telemetry events for mathematical decisions', async () => {
      await expect(
        firebaseSyncService.logMilestoneEvent('student_nfr_999', 'session_3', 'GROUP', { column: 'units', count: 10 })
      ).resolves.not.toThrow();

      await expect(
        firebaseSyncService.logMilestoneEvent('student_nfr_999', 'session_3', 'INPUT_SUBMIT', { value: 25 })
      ).resolves.not.toThrow();
    });
  });
});
