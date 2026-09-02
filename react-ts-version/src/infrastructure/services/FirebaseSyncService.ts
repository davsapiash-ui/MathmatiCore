import { ref, set, get, update, runTransaction, serverTimestamp, onValue, onDisconnect, push, type DataSnapshot } from 'firebase/database';
import { database, firestore } from '@/infrastructure/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { useStore, type QMatrix, type TraceData } from '@/application/useStore';
import { normalizeStudentId } from '@/application/useChatStore';
import { hasEnhancedSupport, ENHANCED_SUPPORT_PROFILE_ID } from '@/core/supportProfile';
import { useAdminStore, type School, type Teacher, type ClassRoom } from '@/application/useAdminStore';
import { indexedDBQueue } from './IndexedDBQueue';
import type { SessionDocument, PedagogicalPath } from '@/types';
import {
  type TelemetryPayload,
  type TelemetryEventType,
  type TelemetryDetailsMap,
  type HesitationDetectedDetails,
  type SocraticCardShownDetails,
  type SocraticOptionSelectedDetails,
  type UndoExecutedDetails,
  validateTelemetryColumnIndexRule,
} from '@/types/telemetry';

export function extractTeacherId(email?: string | null, uid?: string | null): string {
  if (email && typeof email === 'string') {
    const cleaned = email
      .replace(/^teacher_/, '')
      .replace(/@mathmaticore\.local$/, '');
    if (cleaned.endsWith('@edu-haifa.org.il')) {
      return cleaned.replace('@edu-haifa.org.il', '');
    }
    return cleaned.replace(/[.@#$[\]]/g, '_');
  }
  if (uid && typeof uid === 'string') {
    const cleaned = uid
      .replace(/^teacher_/, '')
      .replace(/@mathmaticore\.local$/, '');
    if (cleaned.endsWith('@edu-haifa.org.il')) {
      return cleaned.replace('@edu-haifa.org.il', '');
    }
    return cleaned.replace(/[.@#$[\]]/g, '_');
  }
  return 'teacher_default';
}

// --- PRD v4 Schema Interfaces ---
export interface TeacherProfile {
  id: string;
  email: string;
  name: string;
  classes: string[];
}

export interface Classroom {
  id: string;
  teacher_id: string;
  name: string;
  anonymous_students: string[];
}

export interface SessionState {
  student_id: string;
  session_number: number; // 1-8
  status: 'active' | 'locked' | 'completed';
  current_path: 'green_path' | 'remediation_path';
  hesitation_seconds?: number;
  error_count?: number;
  physical_override?: boolean;
  last_alert?: string;
}

export interface TelemetryEvent {
  event_type: 'vector_replay';
  session_id: string;
  timestamp: number;
  interaction_data: Record<string, any>;
  somatic_indicators: {
    hesitation_detected?: boolean;
    undo_triggered?: boolean;
    [key: string]: any;
  };
}

/**
 * Monotonic progress updater function for highestCompletedMeeting.
 * Ensures meeting progress moves strictly forward (monotonic).
 * Returns the new meeting number if it is higher than currentVal, otherwise returns undefined (aborts / no-op in Firebase runTransaction).
 * If currentVal is corrupt / NaN / invalid, logs a warning and falls back to 0 so new progress can heal the node.
 */
export function calculateMonotonicMeetingUpdate(currentVal: any, newMeeting: number): number | undefined {
  let currentNum = typeof currentVal === 'number' ? currentVal : (currentVal ? Number(currentVal) : 0);
  if (Number.isNaN(currentNum)) {
    console.warn(`[FirebaseSyncService] Invalid non-numeric highestCompletedMeeting detected in DB:`, currentVal);
    currentNum = 0;
  }
  const parsedNew = typeof newMeeting === 'number' ? newMeeting : Number(newMeeting);
  if (Number.isNaN(parsedNew) || parsedNew < 1) {
    return undefined;
  }
  const boundedNew = Math.min(Math.floor(parsedNew), 8);
  if (boundedNew > currentNum) {
    return boundedNew;
  }
  return undefined;
}

export class FirebaseSyncService {
  private static instance: FirebaseSyncService;
  private unsubscribeWorkspace: (() => void) | null = null;
  private unsubscribeFirebase: (() => void) | null = null;
  private currentUserId: string | null = null;
  private isInitialLoad = false;
  private unsubscribeSchools: (() => void) | null = null;
  private unsubscribeClasses: (() => void) | null = null;
  private unsubscribePublicClasses: (() => void) | null = null;
  private unsubscribeTeachers: (() => void) | null = null;
  private unsubscribeGlobalStudentLimit: (() => void) | null = null;

  private constructor() {
    this.setupNetworkListeners();
    // Module 17: RTDB delivery path for queue items recovered from IndexedDB after a reload.
    // The deterministic child key keeps redelivery idempotent (overwrite, never duplicate).
    indexedDBQueue.registerSyncHandler(async (refPath, payload) => {
      const key = payload?.idempotency_key || this.generateQueueIdempotencyKey();
      await set(ref(database, `${refPath}/${key}`), payload);
    });
    // Delay initialization to avoid circular dependency with stores
    setTimeout(() => this.init(), 0);
  }

  public static getInstance(): FirebaseSyncService {
    if (!FirebaseSyncService.instance) {
      FirebaseSyncService.instance = new FirebaseSyncService();
    }
    return FirebaseSyncService.instance;
  }

  public static async syncPhysicalOverride(
    studentId: string,
    overrideData: {
      routeStatus: string;
      difficultyRecommendation: string;
      isASD: boolean;
      physicalOverride: boolean;
      physicalOverrideActive?: boolean;
      overrideUpdatedAt: number;
    }
  ) {
    return FirebaseSyncService.getInstance().syncPhysicalOverride(studentId, overrideData);
  }

  private init() {
    // Check initial auth state
    const initialAuth = typeof useAuthStore?.getState === 'function' ? useAuthStore.getState() : { isAuthenticated: false, user: null, role: null };
    this.syncSharedListeners(initialAuth.isAuthenticated);

    if (initialAuth.isAuthenticated && initialAuth.user) {
      const initialRoles = Array.isArray(initialAuth.role) ? initialAuth.role : [initialAuth.role];
      if (initialRoles.includes('student')) {
        const userId = initialAuth.user.uid || initialAuth.user.id || initialAuth.user.email?.split('@')[0];
        if (userId) {
          this.currentUserId = userId;
          this.startSync(userId, initialAuth.user);
        }
      }
      if (initialRoles.includes('admin')) {
        this.startAdminSync();
      }
    }

    // Subscribe to auth changes
    if (typeof useAuthStore?.subscribe === 'function') {
      useAuthStore.subscribe((authState) => {
        this.syncSharedListeners(authState.isAuthenticated);

      const authRoles = Array.isArray(authState.role) ? authState.role : [authState.role];
      const isStudent = authRoles.includes('student');
      const isAdmin = authRoles.includes('admin');

      if (authState.isAuthenticated && authState.user && isStudent) {
        const newUserId = authState.user.uid || authState.user.id || authState.user.email?.split('@')[0];
        if (newUserId && newUserId !== this.currentUserId) {
          this.currentUserId = newUserId;
          this.startSync(newUserId, authState.user);
        }
      } else {
        this.stopSync();
      }

      if (authState.isAuthenticated && isAdmin) {
        this.startAdminSync();
      } else {
        this.stopAdminSync();
      }
    });
    }
  }

  private startSync(rawStudentId: string, userData: Record<string, unknown>) {
    this.stopSync();

    const studentId = normalizeStudentId(rawStudentId);
    this.currentUserId = studentId;
    const studentRef = ref(database, `users/students/${studentId}`);
    // Set online presence
    const statusRef = ref(database, `users/students/${studentId}/isOnline`);
    set(statusRef, true);
    try {
      onDisconnect(statusRef).set(false);
      onDisconnect(ref(database, `users/students/${studentId}/lastPing`)).set(0);
    } catch {}
    update(studentRef, {
      onlineStatus: 'active',
      lastPing: Date.now(),
      lastActivityTimestamp: Date.now(),
      hasJoinedSession: true,
    }).catch(() => {});
    
    this.isInitialLoad = true;

    // Load initial state from Firebase and keep it synced LIVE
    this.unsubscribeFirebase = onValue(studentRef, (snapshot: DataSnapshot) => {
      try {
        if (snapshot.exists()) {
          const rawData = snapshot.val();
          const data = (rawData && typeof rawData === 'object') ? rawData : {};
          // NOTE: We deliberately do NOT restore workspaceState from Firebase here.
          // StudentWorkspacePage.initSession() is the single source of truth for
          // session state. Overwriting it from Firebase mid-session causes race conditions
          // and could reset a live student's work.
          
          if (data.forceReload) {
            // Teacher initiated a deep reset. Reload the browser to clear local memory.
            update(studentRef, { forceReload: null }).then(() => {
              window.location.reload();
            }).catch((err) => {
              console.error("Failed to clear forceReload flag:", err);
              window.location.reload();
            });
            return;
          }

          if (data.workspaceState?.aiTasks && Array.isArray(data.workspaceState.aiTasks)) {
            // Check if server aiTasks is newer than local aiTasks (Merge Conflict Resolution)
            const localAiTasks = useWorkspaceStore.getState().aiTasks;
            const serverTimestamp = data.workspaceState.aiTasksUpdatedAt || 0;
            const localTimestamp = (useWorkspaceStore.getState() as any).aiTasksUpdatedAt || 0;

            if (!localAiTasks || serverTimestamp >= localTimestamp) {
              useWorkspaceStore.setState({
                aiTasks: data.workspaceState.aiTasks,
                ...(data.workspaceState.dynamicTasks ? { dynamicTasks: data.workspaceState.dynamicTasks } : {})
              });
            }
          }

          // Real-time synchronization of teacher adaptations to student workspace
          const wsOverrides: Record<string, any> = {};
          if (data.isASD !== undefined && data.isASD !== useWorkspaceStore.getState().isASD) {
            wsOverrides.isASD = Boolean(data.isASD);
          }
          // PRD v7.1 Modules 9/19: propagate the authoritative support profile so the
          // keyboard lock and adaptive addition grid react live to the teacher toggle.
          if (data.support_profile_id !== undefined || data.enhanced_support_profile !== undefined) {
            const resolvedProfile = hasEnhancedSupport(data) ? ENHANCED_SUPPORT_PROFILE_ID : null;
            if (resolvedProfile !== (useWorkspaceStore.getState() as any).support_profile_id) {
              wsOverrides.support_profile_id = resolvedProfile;
            }
          }
          const targetBoardLocked = data.workspaceState?.isBoardLocked !== undefined
            ? Boolean(data.workspaceState.isBoardLocked)
            : (data.isBoardLocked !== undefined ? Boolean(data.isBoardLocked) : undefined);
          if (targetBoardLocked !== undefined && targetBoardLocked !== useWorkspaceStore.getState().isBoardLocked) {
            wsOverrides.isBoardLocked = targetBoardLocked;
          }
          if (Object.keys(wsOverrides).length > 0) {
            useWorkspaceStore.setState(wsOverrides);
          }

          // Update the top-level useStore so StudentHub knows about route approvals, adaptations, and Q-Matrix
          const currentStudents = useStore.getState().students;
          const additionEnabled = Boolean(data.additionBoardEnabled || data.forceAdditionHelper);
          const updatedStudent = {
            ...(currentStudents[studentId] || currentStudents[rawStudentId] || {}),
            // Merge Firebase data: qMatrixResults, traceData, route info
            ...(data.qMatrixResults && { qMatrixResults: data.qMatrixResults }),
            ...(data.traceData && { traceData: data.traceData }),
            ...(data.completedMeeting2 !== undefined && { completedMeeting2: data.completedMeeting2 }),
            ...(data.highestCompletedMeeting !== undefined && { highestCompletedMeeting: data.highestCompletedMeeting }),
            ...(data.routeRecommendation !== undefined && { routeRecommendation: data.routeRecommendation }),
            ...(data.routeStatus !== undefined && { routeStatus: data.routeStatus }),
            ...(data.difficultyRecommendation !== undefined && { difficultyRecommendation: data.difficultyRecommendation }),
            ...(data.isASD !== undefined && { isASD: data.isASD }),
            ...(data.physicalOverride !== undefined && { physicalOverride: data.physicalOverride }),
            ...(data.overrideUpdatedAt !== undefined && { overrideUpdatedAt: data.overrideUpdatedAt }),
            ...(data.isOnline !== undefined && { isOnline: data.isOnline }),
            ...(data.workspaceState && { workspaceState: data.workspaceState }),
            ...(data.additionBoardEnabled !== undefined || data.forceAdditionHelper !== undefined ? { additionBoardEnabled: additionEnabled } : {}),
            ...(data.forceAdditionHelper !== undefined && { forceAdditionHelper: data.forceAdditionHelper }),
            ...(data.scaffoldLevel !== undefined && { scaffoldLevel: data.scaffoldLevel }),
            ...(data.pedagogicalPath !== undefined && { pedagogicalPath: data.pedagogicalPath }),
            ...(data.teacher_gate_approved !== undefined && { teacher_gate_approved: data.teacher_gate_approved }),
            ...(targetBoardLocked !== undefined && { isBoardLocked: targetBoardLocked }),
            ...((data.support_profile_id !== undefined || data.enhanced_support_profile !== undefined) && {
              support_profile_id: hasEnhancedSupport(data) ? ENHANCED_SUPPORT_PROFILE_ID : null,
            }),
          };
          useStore.setState({
            students: {
              ...currentStudents,
              [studentId]: updatedStudent,
              ...(rawStudentId !== studentId ? { [rawStudentId]: updatedStudent } : {})
            },
            firebaseLoaded: true
          });
        } else {
          // Initialize user in Firebase
          set(studentRef, {
            profile: userData,
            workspaceState: this.getSyncableWorkspaceState(),
            traceData: { hesitation_events: 0, undo_clicks: 0 },
            lastActive: serverTimestamp(),
            completedMeeting2: false,
            highestCompletedMeeting: 0,
            routeStatus: null,
            additionBoardEnabled: false
          });
          useStore.setState({ firebaseLoaded: true });
        }
      } catch (e) {
        console.error("Firebase sync error:", e);
      } finally {
        this.isInitialLoad = false;
      }
    });


    // Subscribe to local Workspace changes and push to Firebase
    this.unsubscribeWorkspace = useWorkspaceStore.subscribe((state) => {
      if (this.isInitialLoad) return;
      
      const activeTasks = getActiveTasks(state);
      const currentTask = activeTasks[state.standardTaskIdx] || null;

      const syncableData: Record<string, any> = {
        sessionNumber: state.sessionNumber,
        isASD: state.isASD,
        standardTaskIdx: state.standardTaskIdx,
        qflow: state.qflow,
        flowStatus: state.flowStatus,
        counts: state.counts,
        answerDigits: state.answerDigits,
        carryDigits: state.carryDigits,
        probeAnswer: state.probeAnswer,
        selectedChoiceId: state.selectedChoiceId,
        isBoardLocked: state.isBoardLocked,
        keyboardState: state.keyboardState,
        undoCount: state.undoCount,
        hesitationCount: state.hesitationCount,
        hasInteracted: state.hasInteracted,
        helpRequested: Boolean(state.helpRequested),
        activeTask: currentTask ? {
          id: currentTask.id,
          titleHe: currentTask.titleHe,
          instructionHe: currentTask.instructionHe,
          numberA: currentTask.numberA ?? null,
          numberB: currentTask.numberB ?? null,
          isSubtraction: currentTask.isSubtraction ?? false,
        } : null,
      };

      // Protection against Socratic Engine Desync: Only sync aiTasks if explicitly set by local user action
      if (state.aiTasks && Array.isArray(state.aiTasks) && state.aiTasks.length > 0) {
        syncableData.aiTasks = state.aiTasks;
      }

      // PRD Section 5.2: Enforce <50KB payload limit for Transient State Sync
      const MAX_PAYLOAD_BYTES = 50 * 1024; // 50KB
      const payloadJson = JSON.stringify(syncableData);
      const updatePayload = payloadJson.length > MAX_PAYLOAD_BYTES ? (() => {
        console.warn(
          `[FirebaseSyncService] Payload size ${payloadJson.length} bytes exceeds 50KB limit. Trimming aiTasks and qflow history.`
        );
        const trimmed = { ...syncableData };
        if (trimmed.aiTasks && Array.isArray(trimmed.aiTasks) && trimmed.aiTasks.length > 5) {
          trimmed.aiTasks = trimmed.aiTasks.slice(-5);
        }
        if (trimmed.qflow && typeof trimmed.qflow === 'object' && trimmed.qflow.results) {
          const keys = Object.keys(trimmed.qflow.results);
          if (keys.length > 20) {
            const recentKeys = keys.slice(-20);
            trimmed.qflow = { ...trimmed.qflow, results: Object.fromEntries(recentKeys.map(k => [k, trimmed.qflow.results[k]])) };
          }
        }
        return trimmed;
      })() : syncableData;

      // Clean all undefined values to guarantee Firebase Realtime Database compatibility
      const sanitizedPayload = JSON.parse(JSON.stringify(updatePayload, (_k, v) => (v === undefined ? null : v)));

      const normId = normalizeStudentId(this.currentUserId || '');
      const rawNum = (this.currentUserId || '').replace(/[^0-9]/g, '');
      const studentKeys = Array.from(new Set([this.currentUserId, normId, rawNum ? `student_user${rawNum}` : null, rawNum ? `user${rawNum}` : null].filter(Boolean) as string[]));
      
      // Save locally to prevent refresh race conditions
      if (normId) this.saveSessionProgressLocally(normId, sanitizedPayload);
      if (this.currentUserId && this.currentUserId !== normId) {
        this.saveSessionProgressLocally(this.currentUserId, sanitizedPayload);
      }

      studentKeys.forEach(key => {
        const studentDirectRef = ref(database, `users/students/${key}`);
        update(studentDirectRef, {
          workspaceState: sanitizedPayload,
          lastActive: serverTimestamp(),
          currentTaskIdx: state.standardTaskIdx,
          activeStep: state.standardTaskIdx + 1,
          lastActivityTimestamp: Date.now(),
          onlineStatus: 'active'
        }).catch((err) => {
          this.handlePermissionOrAuthError(err);
        });
      });

      if (this.currentUserId) {
        const isStruggling = (state.hesitationCount || 0) > 6 || (state.undoCount || 0) > 3;
        const currentPath: 'green_path' | 'remediation_path' = isStruggling ? 'remediation_path' : 'green_path';
        const sessionStatus: 'active' | 'locked' | 'completed' = state.flowStatus === 'sessionDone' 
          ? 'completed' 
          : state.keyboardState === 'LOCKED' ? 'locked' : 'active';

        const sessionState: SessionState = {
          student_id: this.currentUserId,
          session_number: state.sessionNumber,
          status: sessionStatus,
          current_path: currentPath,
          hesitation_seconds: (state.hesitationCount || 0) * 5,
          error_count: state.undoCount || 0,
        };
        this.syncSessionState(this.currentUserId, sessionState).catch((err) => {
          console.warn('[FirebaseSyncService] syncSessionState notice:', err);
        });
      }
    });
  }

  private getSyncableWorkspaceState() {
    const state = useWorkspaceStore.getState();
    const activeTasks = getActiveTasks(state);
    const currentTask = activeTasks[state.standardTaskIdx] || null;

    const raw = {
      sessionNumber: state.sessionNumber,
      isASD: state.isASD,
      standardTaskIdx: state.standardTaskIdx,
      qflow: state.qflow,
      flowStatus: state.flowStatus,
      counts: state.counts,
      answerDigits: state.answerDigits,
      carryDigits: state.carryDigits,
      probeAnswer: state.probeAnswer,
      selectedChoiceId: state.selectedChoiceId,
      isBoardLocked: state.isBoardLocked,
      keyboardState: state.keyboardState,
      undoCount: state.undoCount,
      hesitationCount: state.hesitationCount,
      hasInteracted: state.hasInteracted,
      activeTask: currentTask ? {
        id: currentTask.id,
        titleHe: currentTask.titleHe,
        instructionHe: currentTask.instructionHe,
        numberA: currentTask.numberA ?? null,
        numberB: currentTask.numberB ?? null,
        isSubtraction: currentTask.isSubtraction ?? false,
      } : null,
      aiTasks: state.aiTasks
    };

    return JSON.parse(JSON.stringify(raw, (_k, v) => (v === undefined ? null : v)));
  }

  private stopSync() {
    if (this.currentUserId) {
      const statusRef = ref(database, `users/students/${this.currentUserId}/isOnline`);
      set(statusRef, false).catch((err) => {
        console.error("Failed to set student offline during logout:", err);
      });
      this.currentUserId = null;
    }
    if (this.unsubscribeWorkspace) {
      this.unsubscribeWorkspace();
      this.unsubscribeWorkspace = null;
    }
    if (this.unsubscribeFirebase) {
      this.unsubscribeFirebase();
      this.unsubscribeFirebase = null;
    }
  }

  public async loadTeacher(teacherId: string) {
    const teacherRef = ref(database, `users/teachers/${teacherId}`);
    const snapshot = await get(teacherRef);
    return snapshot.val();
  }

  public async authenticateTeacher(ssoEmail: string) {
    const teacherRef = ref(database, `users/teachers/${ssoEmail}`);
    const snapshot = await get(teacherRef);
    if (!snapshot.exists()) return null;
    return snapshot.val();
  }

  public async registerTeacher(teacherData: Record<string, unknown>) {
    const id = (teacherData.id || teacherData.ssoEmail || teacherData.uid) as string;
    if (!id) throw new Error("Missing teacher ID for registration");
    const dataToSave = {
      ...teacherData,
      id,
      licenseActive: false, // Security rules require licenseActive to be false upon new registration
    };
    const teacherRef = ref(database, `users/teachers/${id}`);
    await set(teacherRef, dataToSave);
  }

  // --- NEW: Sync specific fields to Firebase directly ---
  public async syncQMatrix(rawStudentId: string, qMatrixUpdates: Partial<QMatrix>) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const qMatrixRef = ref(database, `users/students/${studentId}/qMatrixResults`);
    await update(qMatrixRef, qMatrixUpdates).catch((err) => {
      console.error(`[FirebaseSyncService] Failed to sync Q-Matrix for ${studentId}:`, err);
      throw err;
    });
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/qMatrixResults`), qMatrixUpdates).catch((err) => {
        console.warn(`[FirebaseSyncService] Legacy Q-Matrix mirror notice for ${rawStudentId}:`, err);
      });
    }
  }

  public async syncTraceData(rawStudentId: string, traceDataUpdates: Partial<TraceData>) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const traceRef = ref(database, `users/students/${studentId}/traceData`);
    await update(traceRef, traceDataUpdates).catch((err) => {
      console.error(`[FirebaseSyncService] Failed to sync trace data for ${studentId}:`, err);
      throw err;
    });
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/traceData`), traceDataUpdates).catch((err) => {
        console.warn(`[FirebaseSyncService] Legacy trace data mirror notice for ${rawStudentId}:`, err);
      });
    }
  }

  public async syncConceptMastery(rawStudentId: string, masteryUpdates: any) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const masteryRef = ref(database, `users/students/${studentId}/conceptMastery`);
    await update(masteryRef, masteryUpdates).catch((err) => {
      console.error(`[FirebaseSyncService] Failed to sync concept mastery for ${studentId}:`, err);
      throw err;
    });
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/conceptMastery`), masteryUpdates).catch((err) => {
        console.warn(`[FirebaseSyncService] Legacy concept mastery mirror notice for ${rawStudentId}:`, err);
      });
    }
  }

  public async syncLiveSessionMetrics(rawStudentId: string, metricsUpdates: any) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const metricsRef = ref(database, `users/students/${studentId}/live_session_metrics`);
    await update(metricsRef, metricsUpdates).catch((err) => {
      console.error(`[FirebaseSyncService] Failed to sync live session metrics for ${studentId}:`, err);
      throw err;
    });
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/live_session_metrics`), metricsUpdates).catch((err) => {
        console.warn(`[FirebaseSyncService] Legacy metrics mirror notice for ${rawStudentId}:`, err);
      });
    }
  }

  // syncApproveRoute() was removed deliberately. It wrote teacher_gate_approved
  // and routeStatus:'APPROVED' to RTDB with no Firestore write, no session-2
  // completion check and no pedagogical path — a second, unverified gate
  // approval competing with Module 20's single source of truth. Every gate
  // approval now goes through core/teacherGate.ts, which writes the
  // SessionDocument first and mirrors to RTDB only as transport.

  public async syncPhysicalOverride(
    studentId: string,
    overrideInput: boolean | {
      routeStatus?: string;
      difficultyRecommendation?: string;
      isASD?: boolean;
      physicalOverride?: boolean;
      physicalOverrideActive?: boolean;
      overrideUpdatedAt?: number;
    }
  ) {
    if (!studentId) return;

    const overrideData = typeof overrideInput === 'boolean' 
      ? { physicalOverride: overrideInput }
      : overrideInput;

    const isPhysical = overrideData.physicalOverride ?? true;
    const isASD = overrideData.isASD ?? false;
    const updatedAt = overrideData.overrideUpdatedAt ?? Date.now();

    // routeStatus is the teacher-gate decision (Module 20) and is owned by
    // core/teacherGate.ts. This function used to default a missing routeStatus
    // to 'APPROVED' and write it unconditionally, so saving unrelated learning
    // conditions (scaffold, ASD, addition helper) for a learner still
    // PENDING_TEACHER_APPROVAL silently unlocked them into session 3 with no
    // gate decision ever made — and left Firestore (no teacher_gate_approved)
    // disagreeing with RTDB. Gate fields are written only when the caller
    // explicitly supplies them; the same applies to difficultyRecommendation.
    const studentOverridePayload = {
      ...(overrideData.routeStatus !== undefined && { routeStatus: overrideData.routeStatus }),
      ...(overrideData.difficultyRecommendation !== undefined && {
        difficultyRecommendation: overrideData.difficultyRecommendation,
      }),
      isASD: isASD,
      physicalOverride: isPhysical,
      physicalOverrideActive: overrideData.physicalOverrideActive ?? isPhysical,
      overrideUpdatedAt: updatedAt,
    };

    await update(ref(database, `users/students/${studentId}`), {
      ...studentOverridePayload,
      'workspaceState/isASD': isASD,
    }).catch((err) => {
      console.error(`[FirebaseSyncService] Failed to sync physical override for ${studentId}:`, err);
      throw err;
    });

    await update(ref(database, `students/${studentId}`), studentOverridePayload).catch((err) => {
      console.warn(`[FirebaseSyncService] Legacy students collection mirror notice for ${studentId}:`, err);
    });
  }

  // --- Module 17: FIFO Offline Sync Queue (IndexedDB persistence; LocalStorage is strictly forbidden for queues) ---
  private offlineTelemetryQueue: Array<{ refPath: string, payload: any, idempotency_key: string }> = [];
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.flushOfflineQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  private generateQueueIdempotencyKey(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `idem_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Legacy migration only (Module 17): drains a queue persisted by older client
   * versions into localStorage, then removes the key. New writes never touch
   * localStorage — IndexedDB is the sole durable buffer for the sync queue.
   */
  private loadOfflineQueueFromStorage() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('mathmaticore_offline_queue');
      if (raw) {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          this.offlineTelemetryQueue = items
            .slice(-500)
            .filter((it: any) => it && typeof it.refPath === 'string')
            .map((it: any) => ({
              refPath: it.refPath,
              payload: it.payload,
              idempotency_key: it.idempotency_key || this.generateQueueIdempotencyKey(),
            }));
        }
        localStorage.removeItem('mathmaticore_offline_queue');
      }
    } catch (e) {
      console.warn("Failed to migrate legacy offline telemetry queue:", e);
    }
  }

  private enqueueOfflineTransaction(refPath: string, payload: any) {
    const idempotency_key = payload?.idempotency_key || this.generateQueueIdempotencyKey();
    this.offlineTelemetryQueue.push({ refPath, payload, idempotency_key });
    // Queue capacity is 500 items in strict FIFO order; oldest transaction drops on overflow
    if (this.offlineTelemetryQueue.length > 500) {
      this.offlineTelemetryQueue.shift();
      console.warn("Offline telemetry queue exceeded 500 items. Dropping oldest transaction.");
    }
    // Module 17: durable persistence goes to IndexedDB only, carrying the idempotency key
    indexedDBQueue.enqueue(refPath, { ...payload, idempotency_key }).catch(() => {});
  }

  private async flushOfflineQueue() {
    this.loadOfflineQueueFromStorage();
    if (this.offlineTelemetryQueue.length === 0) {
      indexedDBQueue.flushQueue().catch(() => {});
      return;
    }
    console.log(`Flushing ${this.offlineTelemetryQueue.length} transactions from offline queue.`);
    const queueToFlush = [...this.offlineTelemetryQueue];
    this.offlineTelemetryQueue = [];

    for (const transaction of queueToFlush) {
      try {
        // Idempotent write: the deterministic child key makes retries overwrite instead of duplicate
        await set(ref(database, `${transaction.refPath}/${transaction.idempotency_key}`), transaction.payload);
      } catch (e) {
        console.error("Failed to flush transaction, re-queueing:", e);
        this.enqueueOfflineTransaction(transaction.refPath, { ...transaction.payload, idempotency_key: transaction.idempotency_key });
      }
    }

    // Drain items persisted in IndexedDB; shared idempotency keys make this a no-op for already-sent events
    indexedDBQueue.flushQueue().catch(() => {});
  }

  // --- PRD V2.0 Section 7: Offline-First Resilience (Session Progress Cache) ---
  public saveSessionProgressLocally(studentId: string, sessionData: any): void {
    if (typeof window === 'undefined' || !studentId) return;
    try {
      const key = `mathmaticore_session_cache_${studentId}`;
      localStorage.setItem(key, JSON.stringify({
        ...sessionData,
        updatedAt: Date.now()
      }));
    } catch (e) {
      console.warn("Failed to cache session progress locally:", e);
    }
  }

  public getLocalSessionProgress(studentId: string): any | null {
    if (typeof window === 'undefined' || !studentId) return null;
    try {
      const key = `mathmaticore_session_cache_${studentId}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("Failed to retrieve local session progress:", e);
      return null;
    }
  }

  public clearLocalSessionProgress(studentId: string): void {
    if (typeof window === 'undefined' || !studentId) return;
    try {
      localStorage.removeItem(`mathmaticore_session_cache_${studentId}`);
    } catch (_e) {
      // ignore
    }
  }

  // --- PRD V2.0 Section 7: Milestone Telemetry Logging ---
  public async logMilestoneEvent(
    studentId: string,
    sessionId: string,
    milestoneType: 'GROUP' | 'UNGROUP' | 'INPUT_SUBMIT' | 'UNDO' | 'SOCRATIC_SUBMIT' | 'DELETE_TRASH',
    details: Record<string, any>
  ): Promise<void> {
    if (!studentId) return;
    const milestonePayload = {
      event_type: 'milestone',
      milestone_type: milestoneType,
      session_id: sessionId,
      timestamp: Date.now(),
      details
    };

    if (!this.isOnline) {
      this.enqueueOfflineTransaction(`users/students/${studentId}/milestones`, milestonePayload);
      return;
    }

    try {
      const milestoneRef = push(ref(database, `users/students/${studentId}/milestones`));
      await set(milestoneRef, milestonePayload);
    } catch (_e) {
      this.enqueueOfflineTransaction(`users/students/${studentId}/milestones`, milestonePayload);
    }
  }

  // --- Module 5 & Module 17: Canonical Telemetry Emitter ---
  /**
   * Unified single entry point for all 13 telemetry event types.
   * 1. Constructs typed TelemetryPayload<T> with UUID idempotency_key.
   * 2. Validates column_index rule per Module 5 §C.
   * 3. Performs RTDB live-state write to users/students/{studentId} (Presence, lastAction, error_category, etc.).
   * 4. Enqueues payload into IndexedDB FIFO queue for resilient sync to Firestore telemetry_logs.
   */
  public async emitTelemetry<T extends TelemetryEventType>(event: {
    session_id: string;
    student_id?: number | string;
    exercise_id: string;
    event_type: T;
    column_index?: number;
    details: TelemetryDetailsMap[T];
  }): Promise<TelemetryPayload<T>> {
    // 1. Resolve numeric student_id (Strictly 1-12)
    let numStudentId = 1;
    if (typeof event.student_id === 'number') {
      numStudentId = Math.min(12, Math.max(1, event.student_id));
    } else if (typeof event.student_id === 'string') {
      const parsed = parseInt(event.student_id.replace(/\D/g, ''), 10);
      numStudentId = !isNaN(parsed) && parsed >= 1 && parsed <= 12 ? parsed : 1;
    } else if (this.currentUserId) {
      const parsed = parseInt(this.currentUserId.replace(/\D/g, ''), 10);
      numStudentId = !isNaN(parsed) && parsed >= 1 && parsed <= 12 ? parsed : 1;
    }

    const normUid = `student_user${numStudentId}`;
    const rawStudentUid = `student_${numStudentId}`;

    // 2. Generate UUID idempotency_key
    const idempotency_key = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `telemetry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 3. Build TelemetryPayload<T>
    const payload: TelemetryPayload<T> = {
      idempotency_key,
      client_timestamp: Date.now(),
      session_id: event.session_id || 'session_1',
      student_id: numStudentId,
      exercise_id: event.exercise_id || 'ex_1',
      event_type: event.event_type,
      ...(event.column_index !== undefined ? { column_index: event.column_index } : {}),
      details: event.details,
    };

    // 4. Validate column_index rule (Module 5 §C)
    const validation = validateTelemetryColumnIndexRule(payload);
    if (!validation.isValid) {
      console.warn(`[FirebaseSyncService] Telemetry validation warning for ${event.event_type}:`, validation.reason);
    }

    // 5. Unified RTDB live-state snapshot update (Module 4 & Module 18)
    const rtdbLiveUpdate: Record<string, any> = {
      lastPing: Date.now(),
      lastActivityTimestamp: Date.now(),
      onlineStatus: 'active',
    };

    // Derive Hebrew lastAction label
    const eventLabels: Record<TelemetryEventType, string> = {
      SESSION_START: 'תחילת מפגש למידה',
      PROBLEM_LOAD: 'טעינת תרגיל במרחב העבודה',
      BLOCK_DRAG_COMPLETE: 'גרירת לבנה בלוח',
      REGROUPING_TRIGGERED: 'הפעלת המרה / פריטה',
      REGROUPING_SUCCESS: 'השלמת פריטה / קיבוץ בהצלחה',
      DIGIT_ENTERED: 'הקלדת ספרה',
      DIGIT_DELETED: 'מחיקת ספרה (בקרה עצמית)',
      UNDO_EXECUTED: 'ביטול פעולה (Undo)',
      HESITATION_DETECTED: 'היסוס קוגניטיבי (45 שנ׳)',
      SOCRATIC_CARD_SHOWN: 'הצגת כרטיס חניכה סוקרטי',
      SOCRATIC_OPTION_SELECTED: 'בחירת תשובה בכרטיס חניכה',
      PROBLEM_COMPLETE: 'השלמת תרגיל בהצלחה',
      REFLECTION_SUBMITTED: 'הגשת רפלקציה SRL',
    };
    rtdbLiveUpdate.lastAction = eventLabels[event.event_type] || event.event_type;

    // Special event-driven RTDB state mappings
    if (event.event_type === 'HESITATION_DETECTED') {
      rtdbLiveUpdate.hesitationSeconds = (event.details as HesitationDetectedDetails).hesitation_seconds;
    } else if (event.event_type === 'SOCRATIC_CARD_SHOWN') {
      rtdbLiveUpdate.isSocraticActive = true;
      const details = event.details as SocraticCardShownDetails;
      if (details.error_category) {
        rtdbLiveUpdate.error_category = details.error_category;
        // PRD v7.1 Module 18: the radar detail layer shows the learner's
        // classification DISTRIBUTION for the current session, so every
        // classification is tallied per session, not just the latest one.
        const sessionNum = useWorkspaceStore.getState().sessionNumber || 1;
        runTransaction(
          ref(database, `users/students/${normUid}/errorCategoryDistribution/session_${sessionNum}/${details.error_category}`),
          (current) => (typeof current === 'number' ? current : 0) + 1
        ).catch(() => {});
      }
    } else if (event.event_type === 'SOCRATIC_OPTION_SELECTED') {
      const details = event.details as SocraticOptionSelectedDetails;
      if (details.is_correct) {
        rtdbLiveUpdate.isSocraticActive = false;
      }
    } else if (event.event_type === 'UNDO_EXECUTED') {
      rtdbLiveUpdate['workspaceState/undoCount'] = (event.details as UndoExecutedDetails).undo_stack_depth_before;
    }

    // Write live snapshot to RTDB for both student aliases
    update(ref(database, `users/students/${normUid}`), rtdbLiveUpdate).catch(() => {});
    if (normUid !== rawStudentUid) {
      update(ref(database, `users/students/${rawStudentUid}`), rtdbLiveUpdate).catch(() => {});
    }

    // 6. Enqueue into IndexedDB FIFO queue (Module 17) -> syncs to Firestore telemetry_logs
    await indexedDBQueue.enqueue(payload).catch((err) => {
      console.error('[FirebaseSyncService] Failed to enqueue telemetry payload to IndexedDB:', err);
    });

    return payload;
  }

  // --- PRD v4 Task 1 Implementation Functions ---
  public async syncSessionState(studentId: string, sessionState: SessionState): Promise<void> {
    if (!studentId) return;
    const normId = normalizeStudentId(studentId);
    await update(ref(database, `users/students/${normId}/sessionState`), sessionState as any).catch((err) => {
      console.warn(`[FirebaseSyncService] Failed to sync sessionState for ${normId}, enqueuing to offline queue:`, err);
      indexedDBQueue.enqueue(`users/students/${normId}/sessionState`, sessionState).catch(console.error);
    });
  }

  public async syncHighestCompletedMeeting(studentId: string, meeting: number): Promise<void> {
    if (!studentId || typeof meeting !== 'number') return;
    const normId = normalizeStudentId(studentId);

    const updateNode = async (id: string) => {
      const meetingRef = ref(database, `users/students/${id}/highestCompletedMeeting`);
      await runTransaction(meetingRef, (currentVal) => {
        return calculateMonotonicMeetingUpdate(currentVal, meeting);
      }).catch((err) => {
        console.error(`[FirebaseSyncService] runTransaction failed for highestCompletedMeeting on ${id}:`, err);
      });
    };

    await updateNode(studentId);
    if (normId !== studentId) {
      await updateNode(normId);
    }
  }

  public async syncMeeting2Complete(studentId: string): Promise<void> {
    if (!studentId) return;
    const normId = normalizeStudentId(studentId);
    await this.syncHighestCompletedMeeting(studentId, 2);
    await update(ref(database, `users/students/${studentId}`), { completedMeeting2: true }).catch(console.error);
    if (normId !== studentId) {
      await update(ref(database, `users/students/${normId}`), { completedMeeting2: true }).catch(console.error);
    }
  }

  public handlePermissionOrAuthError(error: any) {
    const errMsg = String(error?.message || error?.code || error);
    if (
      errMsg.includes('PERMISSION_DENIED') ||
      errMsg.includes('auth/id-token-expired') ||
      errMsg.includes('auth/user-token-expired') ||
      error?.code === 'PERMISSION_DENIED'
    ) {
      console.error('[FirebaseSyncService] Auth token expired or PERMISSION_DENIED detected. Dispatching auth error event.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('firebase:auth_expired', { detail: { error: errMsg } }));
      }
    }
  }

  public async syncRouteRecommendation(studentId: string, route: string): Promise<void> {
    if (!studentId) return;
    const normId = normalizeStudentId(studentId);
    const payload = { routeRecommendation: route, routeStatus: 'PENDING' };
    await update(ref(database, `users/students/${studentId}`), payload).catch((err) => this.handlePermissionOrAuthError(err));
    if (normId !== studentId) {
      await update(ref(database, `users/students/${normId}`), payload).catch((err) => this.handlePermissionOrAuthError(err));
    }
  }

  public async logTelemetryEvent(studentId: string, event: TelemetryEvent): Promise<void> {
    if (!studentId) return;
    const refPath = `telemetry_events/${studentId}`;
    
    if (!this.isOnline) {
      this.enqueueOfflineTransaction(refPath, event);
      return;
    }

    try {
      await push(ref(database, refPath), event);
    } catch {
      this.enqueueOfflineTransaction(refPath, event);
    }
  }

  public async syncSession2Completion(
    rawStudentId: string,
    sessionScorePercent: number,
    recommendedPath: PedagogicalPath,
    classId: string = 'class_1'
  ) {
    const studentId = normalizeStudentId(rawStudentId);
    const studentNum = studentId.replace(/\D/g, '') || '1';
    const now = Date.now();
    const docId = `session_02_student_${studentNum}`;

    const sessionDoc: SessionDocument = {
      session_id: docId,
      class_id: classId,
      session_number: 2,
      session_start_time: now - 1800000,
      session_deadline_time: now + 1800000,
      active_exercise_id: 'task8_missing_addend',
      is_completed: true,
      session_score_percent: sessionScorePercent,
      teacher_gate_approved: false,
      gate_approved_at: null,
      gate_approved_by: null,
      teacher_selected_path: null,
      matrix_recommended_path: recommendedPath,
    };

    // 1. Write to RTDB users/students/${studentId}
    try {
      await update(ref(database, `users/students/${studentId}`), {
        session_02_completed: true,
        session_score_percent: sessionScorePercent,
        matrix_recommended_path: recommendedPath,
        teacher_gate_approved: false,
        routeStatus: 'PENDING_TEACHER_APPROVAL',
        updatedAt: now
      });
    } catch (e) {
      console.warn('[FirebaseSyncService] RTDB Session 2 completion update warning:', e);
    }

    // 2. Write to Firestore `sessions/${docId}`
    if (firestore && (typeof (firestore as any).type === 'string' || (firestore as any)._delegate || (firestore as any).app)) {
      try {
        const docRef = doc(firestore, 'sessions', docId);
        await setDoc(docRef, sessionDoc, { merge: true });
      } catch (err) {
        console.warn('[FirebaseSyncService] Firestore Session 2 completion write warning:', err);
      }
    }
  }

  public async fetchTeacherClassrooms(teacherId: string): Promise<Classroom[]> {
    const classesSnapshot = await get(ref(database, 'classes'));
    if (!classesSnapshot.exists()) return [];
    const classesVal = classesSnapshot.val() || {};
    const classrooms: Classroom[] = [];
    Object.values(classesVal).forEach((c: any) => {
      if (c.teacherId === teacherId || c.teacher_id === teacherId) {
        classrooms.push({
          id: c.id,
          teacher_id: c.teacher_id || c.teacherId || teacherId,
          name: c.name || `כיתה ${c.id}`,
          anonymous_students: c.anonymous_students || c.students || Array.from({ length: 12 }, (_, i) => `student_${i + 1}`)
        });
      }
    });
    return classrooms;
  }

  public async fetchClassroomSessions(classId: string): Promise<SessionState[]> {
    const sessionsSnapshot = await get(ref(database, 'sessions'));
    if (!sessionsSnapshot.exists()) return [];
    const sessionsVal = sessionsSnapshot.val() || {};
    const sessionList: SessionState[] = [];
    Object.values(sessionsVal).forEach((s: any) => {
      if (!classId || s.class_id === classId || s.classId === classId) {
        sessionList.push({
          student_id: s.student_id || s.studentId || '',
          session_number: s.session_number || s.sessionNumber || 1,
          status: s.status || 'active',
          current_path: s.current_path || s.currentPath || 'green_path',
          hesitation_seconds: s.hesitation_seconds || 0,
          error_count: s.error_count || 0,
          physical_override: s.physical_override || false,
          last_alert: s.last_alert || undefined
        });
      }
    });
    return sessionList;
  }

  // --- NEW: Public and Admin Listeners ---
  private syncSharedListeners(isAuthenticated: boolean) {
    if (isAuthenticated) {
      if (!this.unsubscribeSchools) {
        const schoolsRef = ref(database, 'schools');
        this.unsubscribeSchools = onValue(schoolsRef, (snapshot) => {
          if (typeof useAdminStore?.setState === 'function') {
            if (snapshot.exists()) {
              const schoolsVal = snapshot.val();
              const schools = schoolsVal ? Object.values(schoolsVal) as School[] : [];
              useAdminStore.setState({ schools });
            } else {
              useAdminStore.setState({ schools: [] });
            }
          }
        }, (error) => {
          console.warn("Schools listener notice:", error?.message || error);
        });
      }

      if (this.unsubscribePublicClasses) {
        this.unsubscribePublicClasses();
        this.unsubscribePublicClasses = null;
      }
      if (!this.unsubscribeClasses) {
        const classesRef = ref(database, 'classes');
        this.unsubscribeClasses = onValue(classesRef, (snapshot) => {
          if (typeof useAdminStore?.setState === 'function') {
            const classesVal = snapshot.val();
            const classes = classesVal ? Object.values(classesVal) as ClassRoom[] : [];
            useAdminStore.setState({ classes });
          }
        }, (error) => {
          console.warn("Classes listener notice:", error?.message || error);
        });
      }
    } else {
      if (this.unsubscribeSchools) {
        this.unsubscribeSchools();
        this.unsubscribeSchools = null;
      }
      if (this.unsubscribeClasses) {
        this.unsubscribeClasses();
        this.unsubscribeClasses = null;
      }
      if (!this.unsubscribePublicClasses) {
        const publicClassesRef = ref(database, 'public_classes');
        this.unsubscribePublicClasses = onValue(publicClassesRef, (snapshot) => {
          if (typeof useAdminStore?.setState === 'function') {
            const classesVal = snapshot.val();
            const classes = classesVal ? Object.values(classesVal) as ClassRoom[] : [];
            useAdminStore.setState({ classes });
          }
        }, (error) => {
          console.warn("Public classes listener notice:", error?.message || error);
        });
      }
    }
  }

  private async seedDefaultData() {
    const timestamp = Date.now();
    const initialSchool = { id: 'school_bikorot', name: 'ביקורת', createdAt: timestamp };
    const initialTeacher = { 
      id: 'teacher_mock_1', 
      schoolId: 'school_bikorot', 
      name: 'דוד', 
      ssoEmail: 'teacher.demo@edu-haifa.org.il', 
      dob: '010190', 
      licenseActive: false, // Security rules require licenseActive to be false upon creation
      createdAt: timestamp 
    };
    const initialClass = { 
      id: 'class_1', 
      schoolId: 'school_bikorot', 
      teacherId: 'teacher_mock_1', 
      name: 'כיתה 1', 
      studentLimit: 12, 
      createdAt: timestamp 
    };
    const initialPublicClass = {
      id: 'class_1',
      name: 'כיתה 1',
      schoolId: 'school_bikorot'
    };

    try {
      const updates: Record<string, any> = {};
      updates[`schools/school_bikorot`] = initialSchool;
      updates[`users/teachers/teacher_mock_1`] = initialTeacher;
      updates[`classes/class_1`] = initialClass;
      updates[`public_classes/class_1`] = initialPublicClass;
      updates[`system_control/globalStudentLimit`] = 12;
      
      await update(ref(database), updates);
      console.log("Auto-seeding completed successfully.");
    } catch (err) {
      console.error("Auto-seeding failed:", err);
    }
  }

  private async startAdminSync() {
    this.stopAdminSync();

    try {
      const schoolsSnapshot = await get(ref(database, 'schools'));
      if (!schoolsSnapshot.exists() || !schoolsSnapshot.val()) {
        await this.seedDefaultData();
      }
    } catch (err) {
      console.error("Error checking schools for seeding:", err);
    }

    const teachersRef = ref(database, 'users/teachers');
    this.unsubscribeTeachers = onValue(teachersRef, (snapshot) => {
      const teachersVal = snapshot.val();
      const teachers = teachersVal ? Object.values(teachersVal) as Teacher[] : [];
      useAdminStore.setState({ teachers });
    });

    const limitRef = ref(database, 'system_control/globalStudentLimit');
    this.unsubscribeGlobalStudentLimit = onValue(limitRef, (snapshot) => {
      const limitVal = snapshot.val();
      const globalStudentLimit = limitVal !== null ? Number(limitVal) : 12;
      useAdminStore.setState({ globalStudentLimit });
    });
  }

  private stopAdminSync() {
    if (this.unsubscribeTeachers) {
      this.unsubscribeTeachers();
      this.unsubscribeTeachers = null;
    }
    if (this.unsubscribeGlobalStudentLimit) {
      this.unsubscribeGlobalStudentLimit();
      this.unsubscribeGlobalStudentLimit = null;
    }
    useAdminStore.setState({ teachers: [], globalStudentLimit: 12 });
  }

  // --- Admin actions syncing to Firebase ---
  public async addSchool(name: string, preferredId?: string): Promise<School> {
    const id = preferredId || push(ref(database, 'schools')).key;
    if (!id) throw new Error("Failed to generate school ID");
    const school: School = { id, name, createdAt: Date.now() };
    await set(ref(database, `schools/${id}`), school);
    return school;
  }

  public async deleteSchool(schoolId: string) {
    // Fetch the latest teachers/classes list from Firebase via get()
    const teachersSnapshot = await get(ref(database, 'users/teachers'));
    const classesSnapshot = await get(ref(database, 'classes'));

    const teachersVal = teachersSnapshot.val() || {};
    const classesVal = classesSnapshot.val() || {};

    const teachers = Object.values(teachersVal) as Teacher[];
    const classes = Object.values(classesVal) as ClassRoom[];

    const updates: Record<string, null> = {};
    updates[`schools/${schoolId}`] = null;

    // Cascade delete teachers in this school
    const schoolTeachers = teachers.filter(t => t.schoolId === schoolId);
    schoolTeachers.forEach(t => {
      updates[`users/teachers/${t.id}`] = null;
    });

    // Cascade delete classes in this school (from both classes and public_classes)
    const schoolClasses = classes.filter(c => c.schoolId === schoolId);
    schoolClasses.forEach(c => {
      updates[`classes/${c.id}`] = null;
      updates[`public_classes/${c.id}`] = null;
    });

    await update(ref(database), updates);
  }

  public async addTeacher(schoolId: string, name: string, ssoEmail: string, dob: string) {
    // A raw email contains '.', which Firebase RTDB rejects as a key segment
    // (ref() throws, so the write never happened and the caller's .catch
    // swallowed it — the teacher looked created in local state but had no
    // users/teachers record at all). Sanitize to the same key shape every
    // other teacher-lookup path already uses: useAdminStore's own
    // addClassRoom/approveGate, TeacherDashboard's own-identity lookup, and
    // the teacherAdminChat Cloud Function.
    const id = ssoEmail.trim().replace(/[@.#$[\]]/g, '_');
    const newTeacher: Teacher = {
      id,
      schoolId,
      name,
      ssoEmail,
      dob,
      licenseActive: false,
      createdAt: Date.now()
    };
    await set(ref(database, `users/teachers/${id}`), newTeacher);
    if (ssoEmail.includes('@')) {
      const { addAuthorizedTeacherFirestore } = await import('./AuthService');
      await addAuthorizedTeacherFirestore(ssoEmail, 'teacher', name, schoolId).catch(console.error);
    }
  }

  public async deleteTeacher(teacherId: string) {
    // Fetch the latest classes list from Firebase via get()
    const classesSnapshot = await get(ref(database, 'classes'));
    const classesVal = classesSnapshot.val() || {};
    const classes = Object.values(classesVal) as ClassRoom[];

    const updates: Record<string, null> = {};
    updates[`users/teachers/${teacherId}`] = null;

    // Cascade delete classes belonging to this teacher (from both classes and public_classes)
    const teacherClasses = classes.filter(c => c.teacherId === teacherId);
    teacherClasses.forEach(c => {
      updates[`classes/${c.id}`] = null;
      updates[`public_classes/${c.id}`] = null;
    });

    await update(ref(database), updates);
  }

  public async addClassRoom(schoolId: string, teacherId: string, name: string, preferredId?: string): Promise<ClassRoom> {
    const id = preferredId || push(ref(database, 'classes')).key;
    if (!id) throw new Error("Failed to generate class ID");
    const limit = useAdminStore.getState().globalStudentLimit;
    const newClass: ClassRoom = {
      id,
      schoolId,
      teacherId,
      name,
      studentLimit: limit,
      createdAt: Date.now()
    };
    const updates: Record<string, any> = {};
    updates[`classes/${id}`] = newClass;
    updates[`public_classes/${id}`] = { id, name, schoolId };
    await update(ref(database), updates);
    return newClass;
  }

  public async deleteClassRoom(id: string) {
    const updates: Record<string, null> = {};
    updates[`classes/${id}`] = null;
    updates[`public_classes/${id}`] = null;
    await update(ref(database), updates);
  }

  public async registerStudentAtomic(studentId: string): Promise<boolean> {
    if (!studentId) throw new Error("Student ID is required for atomic registration");
    const limitRef = ref(database, 'system_control/globalStudentLimit');
    const limitSnap = await get(limitRef);
    const limit = limitSnap.exists() ? Number(limitSnap.val()) : 12;

    const countRef = ref(database, 'system_control/activeStudentCount');
    let transactionPassed = false;

    await runTransaction(countRef, (currentCount) => {
      const count = currentCount || 0;
      if (count >= limit) {
        transactionPassed = false;
        return; // Abort transaction if limit reached
      }
      transactionPassed = true;
      return count + 1;
    });

    if (!transactionPassed) {
      throw new Error(`Student registration blocked: Global limit (${limit}) reached.`);
    }

    return true;
  }

  public async setGlobalStudentLimit(limit: number) {
    if (typeof limit !== 'number' || limit < 1) {
      throw new Error("Invalid global student limit");
    }
    const limitRef = ref(database, 'system_control/globalStudentLimit');
    await runTransaction(limitRef, () => limit);
  }
}

export const firebaseSyncService = FirebaseSyncService.getInstance();

export const syncSessionState = (studentId: string, sessionState: SessionState) =>
  firebaseSyncService.syncSessionState(studentId, sessionState);

export const logTelemetryEvent = (studentId: string, event: TelemetryEvent) =>
  firebaseSyncService.logTelemetryEvent(studentId, event);

export const fetchTeacherClassrooms = (teacherId: string) =>
  firebaseSyncService.fetchTeacherClassrooms(teacherId);

export const fetchClassroomSessions = (classId: string) =>
  firebaseSyncService.fetchClassroomSessions(classId);

export const syncPhysicalOverride = (studentId: string, overrideData: any) =>
  firebaseSyncService.syncPhysicalOverride(studentId, overrideData);

export const syncQMatrix = (studentId: string, qMatrixUpdates: any) =>
  firebaseSyncService.syncQMatrix(studentId, qMatrixUpdates);

export const syncConceptMastery = (studentId: string, masteryUpdates: any) =>
  firebaseSyncService.syncConceptMastery(studentId, masteryUpdates);

export const emitTelemetry = <T extends TelemetryEventType>(
  event: Parameters<FirebaseSyncService['emitTelemetry']>[0]
) => firebaseSyncService.emitTelemetry(event as any);


