/**
 * PRD v7.1 — Modules 4 & 26: Curriculum Catalog (Firestore + IndexedDB cache).
 *
 * The catalog is managed as a canonical Firestore collection
 * (`curriculum_catalog`) enabling asynchronous exercise-template updates.
 * The client caches every fetched bank in IndexedDB for zero-latency loads
 * and full offline resilience, and always falls back to the hardcoded task
 * banks in `src/data/sessionTasks.ts` when no server bank exists.
 *
 * Update-safety (Module 26): updates distributed mid-lesson are applied only
 * to sessions that have not started yet — fetched banks land in a *pending*
 * buffer and are promoted to the *active* snapshot exclusively at session
 * initialization (`activateForSession`), so a live exercise is never
 * disturbed.
 *
 * Firestore document layout — one document per bank:
 *   id: `session_1`, `session_8`, or `session_{3..7}_{green_path|remediation_path}`
 *   { session_number: number, learning_path: string | null,
 *     updated_at: number, tasks: SessionTask[] }
 */

import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '@/infrastructure/firebase';
import type { SessionTask } from '@/data/sessionTasks';

export type LearningPath = 'green_path' | 'remediation_path';

export interface CatalogBankDoc {
  session_number: number;
  learning_path: LearningPath | null;
  updated_at: number;
  tasks: SessionTask[];
}

export function catalogBankId(sessionNumber: number, path?: LearningPath | null): string {
  if (sessionNumber >= 3 && sessionNumber <= 7) {
    return `session_${sessionNumber}_${path === 'remediation_path' ? 'remediation_path' : 'green_path'}`;
  }
  return `session_${sessionNumber}`;
}

/** Minimal structural validation — an invalid bank is ignored (fail-safe to hardcoded). */
export function isValidCatalogBank(raw: unknown): raw is CatalogBankDoc {
  if (!raw || typeof raw !== 'object') return false;
  const bank = raw as Record<string, unknown>;
  if (typeof bank.session_number !== 'number' || bank.session_number < 1 || bank.session_number > 8) return false;
  if (!Array.isArray(bank.tasks) || bank.tasks.length === 0) return false;
  return bank.tasks.every((t) =>
    t && typeof t === 'object' &&
    typeof (t as Record<string, unknown>).id === 'string' &&
    typeof (t as Record<string, unknown>).titleHe === 'string'
  );
}

/** Pure resolution helper: server bank when present and valid, else the hardcoded fallback. */
export function resolveCatalogBank(
  activeBanks: ReadonlyMap<string, SessionTask[]>,
  sessionNumber: number,
  path: LearningPath | null | undefined,
  hardcodedFallback: SessionTask[]
): SessionTask[] {
  const override = activeBanks.get(catalogBankId(sessionNumber, path));
  return override && override.length > 0 ? override : hardcodedFallback;
}

const IDB_NAME = 'mathmaticore_curriculum';
const IDB_STORE = 'banks';

function openCatalogDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

class CurriculumCatalogService {
  private static instance: CurriculumCatalogService;

  /** Frozen snapshot the running session reads from (promoted at session init only). */
  private activeBanks = new Map<string, SessionTask[]>();
  /** Latest fetched banks, waiting for the next session initialization. */
  private pendingBanks = new Map<string, SessionTask[]>();
  private initStarted = false;

  public static getInstance(): CurriculumCatalogService {
    if (!CurriculumCatalogService.instance) {
      CurriculumCatalogService.instance = new CurriculumCatalogService();
    }
    return CurriculumCatalogService.instance;
  }

  /**
   * Load cached banks from IndexedDB immediately, then refresh from Firestore
   * in the background. Safe to call more than once; runs once.
   */
  public async init(): Promise<void> {
    if (this.initStarted) return;
    this.initStarted = true;
    await this.loadFromCache();
    // First load has no session running yet — promote the cache directly so the
    // very first session already uses it (zero-latency requirement).
    this.activeBanks = new Map(this.pendingBanks);
    this.refreshFromServer().catch(() => {});
  }

  /** Promote pending server banks at a safe boundary — a new session is initializing. */
  public activateForSession(): void {
    if (this.pendingBanks.size > 0) {
      this.activeBanks = new Map(this.pendingBanks);
    }
  }

  /** Bank for the given session/path, or null when no server bank exists. */
  public getActiveBank(sessionNumber: number, path?: LearningPath | null): SessionTask[] | null {
    const bank = this.activeBanks.get(catalogBankId(sessionNumber, path));
    return bank && bank.length > 0 ? bank : null;
  }

  private async loadFromCache(): Promise<void> {
    const db = await openCatalogDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        tx.oncomplete = () => {
          const keys = (keysReq.result || []) as string[];
          const vals = (valsReq.result || []) as unknown[];
          keys.forEach((key, i) => {
            if (isValidCatalogBank(vals[i])) {
              this.pendingBanks.set(key, (vals[i] as CatalogBankDoc).tasks);
            }
          });
          resolve();
        };
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private async writeToCache(banks: Map<string, CatalogBankDoc>): Promise<void> {
    const db = await openCatalogDb();
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      banks.forEach((bank, id) => store.put(bank, id));
    } catch {
      // Cache write failures are silent — Firestore/hardcoded still serve.
    }
  }

  public async refreshFromServer(): Promise<void> {
    try {
      const snap = await getDocs(collection(firestore, 'curriculum_catalog'));
      if (snap.empty) return;
      const fetched = new Map<string, CatalogBankDoc>();
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (isValidCatalogBank(data)) {
          fetched.set(docSnap.id, data as CatalogBankDoc);
          this.pendingBanks.set(docSnap.id, (data as CatalogBankDoc).tasks);
        }
      });
      if (fetched.size > 0) {
        await this.writeToCache(fetched);
      }
    } catch (err) {
      // Offline or rules-denied: keep serving cache/hardcoded silently (Module 17 posture).
      console.warn('[CurriculumCatalog] server refresh skipped:', err);
    }
  }
}

export const curriculumCatalog = CurriculumCatalogService.getInstance();
