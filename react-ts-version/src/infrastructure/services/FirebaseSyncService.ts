import { ref, set, get, update, runTransaction, serverTimestamp, onValue, onDisconnect, push, type DataSnapshot } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore, type QMatrix, type TraceData } from '@/application/useStore';
import { normalizeStudentId } from '@/application/useChatStore';
import { useAdminStore, type School, type Teacher, type ClassRoom } from '@/application/useAdminStore';

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
  current_path: 'green_path' | 'gap_reduction';
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
    const initialAuth = useAuthStore.getState();
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

  private startSync(studentId: string, userData: Record<string, unknown>) {
    this.stopSync();

    const studentRef = ref(database, `users/students/${studentId}`);
    
    // Set online presence
    const statusRef = ref(database, `users/students/${studentId}/isOnline`);
    set(statusRef, true);
    onDisconnect(statusRef).set(false);
    
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

          // Update the top-level useStore so StudentHub knows about route approvals and Q-Matrix
          const currentStudents = useStore.getState().students;
          useStore.setState({
            students: {
              ...currentStudents,
              [studentId]: {
                ...(currentStudents[studentId] || {}),
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
                ...(data.additionBoardEnabled !== undefined && { additionBoardEnabled: data.additionBoardEnabled }),
              }
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
      
      const syncableData: Record<string, any> = {
        sessionNumber: state.sessionNumber,
        isASD: state.isASD,
        standardTaskIdx: state.standardTaskIdx,
        qflow: state.qflow,
        flowStatus: state.flowStatus,
        counts: state.counts,

        undoCount: state.undoCount,
        hesitationCount: state.hesitationCount,
        hasInteracted: state.hasInteracted,
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

      update(studentRef, {
        workspaceState: updatePayload,
        lastActive: serverTimestamp()
      }).catch((err) => {
        this.handlePermissionOrAuthError(err);
      });

      if (this.currentUserId) {
        const isStruggling = (state.hesitationCount || 0) > 6 || (state.undoCount || 0) > 3;
        const currentPath: 'green_path' | 'gap_reduction' = isStruggling ? 'gap_reduction' : 'green_path';
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
        this.syncSessionState(this.currentUserId, sessionState).catch(() => {});
      }
    });
  }

  private getSyncableWorkspaceState() {
    const state = useWorkspaceStore.getState();
    return {
      sessionNumber: state.sessionNumber,
      isASD: state.isASD,
      standardTaskIdx: state.standardTaskIdx,
      qflow: state.qflow,
      flowStatus: state.flowStatus,
      counts: state.counts,

      undoCount: state.undoCount,
      hesitationCount: state.hesitationCount,
      hasInteracted: state.hasInteracted,
      aiTasks: state.aiTasks
    };
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

  public async authenticateTeacher(taz: string) {
    const teacherRef = ref(database, `users/teachers/${taz}`);
    const snapshot = await get(teacherRef);
    if (!snapshot.exists()) return null;
    return snapshot.val();
  }

  public async registerTeacher(teacherData: Record<string, unknown>) {
    const teacherRef = ref(database, `users/teachers/${teacherData.id}`);
    await set(teacherRef, teacherData);
  }

  // --- NEW: Sync specific fields to Firebase directly ---
  public async syncQMatrix(rawStudentId: string, qMatrixUpdates: Partial<QMatrix>) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const qMatrixRef = ref(database, `users/students/${studentId}/qMatrixResults`);
    await update(qMatrixRef, qMatrixUpdates);
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/qMatrixResults`), qMatrixUpdates).catch(() => {});
    }
  }

  public async syncTraceData(rawStudentId: string, traceDataUpdates: Partial<TraceData>) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const traceRef = ref(database, `users/students/${studentId}/traceData`);
    await update(traceRef, traceDataUpdates);
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/traceData`), traceDataUpdates).catch(() => {});
    }
  }

  public async syncConceptMastery(rawStudentId: string, masteryUpdates: any) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const masteryRef = ref(database, `users/students/${studentId}/conceptMastery`);
    await update(masteryRef, masteryUpdates);
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/conceptMastery`), masteryUpdates).catch(() => {});
    }
  }

  public async syncLiveSessionMetrics(rawStudentId: string, metricsUpdates: any) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    const metricsRef = ref(database, `users/students/${studentId}/live_session_metrics`);
    await update(metricsRef, metricsUpdates);
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}/live_session_metrics`), metricsUpdates).catch(() => {});
    }
  }

  public async syncApproveRoute(rawStudentId: string) {
    if (!rawStudentId) return;
    const studentId = normalizeStudentId(rawStudentId);
    await update(ref(database, `users/students/${studentId}`), { routeStatus: 'APPROVED' });
    if (rawStudentId !== studentId) {
      await update(ref(database, `users/students/${rawStudentId}`), { routeStatus: 'APPROVED' }).catch(() => {});
    }
  }

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
    const routeStatus = overrideData.routeStatus ?? 'APPROVED';
    const difficultyRec = overrideData.difficultyRecommendation ?? 'REGULAR';
    const updatedAt = overrideData.overrideUpdatedAt ?? Date.now();

    const updates: Record<string, any> = {};

    // 1. Primary path: users/students/${studentId}
    updates[`users/students/${studentId}/routeStatus`] = routeStatus;
    updates[`users/students/${studentId}/difficultyRecommendation`] = difficultyRec;
    updates[`users/students/${studentId}/isASD`] = isASD;
    updates[`users/students/${studentId}/physicalOverride`] = isPhysical;
    updates[`users/students/${studentId}/physicalOverrideActive`] = overrideData.physicalOverrideActive ?? isPhysical;
    updates[`users/students/${studentId}/overrideUpdatedAt`] = updatedAt;
    updates[`users/students/${studentId}/workspaceState/isASD`] = isASD;

    // 2. Secondary path: students/${studentId} (backup per requirement 3)
    updates[`students/${studentId}/routeStatus`] = routeStatus;
    updates[`students/${studentId}/difficultyRecommendation`] = difficultyRec;
    updates[`students/${studentId}/isASD`] = isASD;
    updates[`students/${studentId}/physicalOverride`] = isPhysical;
    updates[`students/${studentId}/physicalOverrideActive`] = overrideData.physicalOverrideActive ?? isPhysical;
    updates[`students/${studentId}/overrideUpdatedAt`] = updatedAt;

    await update(ref(database), updates).catch((_err) => {
      // Gracefully catch unauthenticated or offline simulation errors
    });
  }

  // --- NEW: PRD Section 5.2 FIFO In-Memory Network Sync Queue ---
  private offlineTelemetryQueue: Array<{ refPath: string, payload: any }> = [];
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

  private loadOfflineQueueFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('mathmaticore_offline_queue');
      if (raw) {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          this.offlineTelemetryQueue = items.slice(-10);
        }
      }
    } catch (e) {
      console.warn("Failed to load offline telemetry queue from storage:", e);
    }
  }

  private saveOfflineQueueToStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('mathmaticore_offline_queue', JSON.stringify(this.offlineTelemetryQueue));
    } catch (e) {
      console.warn("Failed to save offline telemetry queue to storage:", e);
    }
  }

  private enqueueOfflineTransaction(refPath: string, payload: any) {
    this.offlineTelemetryQueue.push({ refPath, payload });
    // Enforce 10 items max per PRD V2.0 NFR (FIFO: shift oldest item out)
    if (this.offlineTelemetryQueue.length > 10) {
      this.offlineTelemetryQueue.shift();
      console.warn("Offline telemetry queue exceeded 10 items. Dropping oldest transaction.");
    }
    this.saveOfflineQueueToStorage();
  }

  private async flushOfflineQueue() {
    this.loadOfflineQueueFromStorage();
    if (this.offlineTelemetryQueue.length === 0) return;
    console.log(`Flushing ${this.offlineTelemetryQueue.length} transactions from offline queue.`);
    const queueToFlush = [...this.offlineTelemetryQueue];
    this.offlineTelemetryQueue = [];
    this.saveOfflineQueueToStorage();
    
    for (const transaction of queueToFlush) {
      try {
        await push(ref(database, transaction.refPath), transaction.payload);
      } catch (e) {
        console.error("Failed to flush transaction, re-queueing:", e);
        this.enqueueOfflineTransaction(transaction.refPath, transaction.payload);
      }
    }
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

  // --- NEW: PRD Section 6 Vector Replay Schema ---
  public async logVectorReplayEvent(
    studentId: string, 
    sessionId: string, 
    actionType: string, 
    details: any, 
    somaticIndicators: { hesitation_detected: boolean, undo_triggered: boolean }
  ) {
    if (!studentId) return;
    const replayEvent = {
      event_type: "vector_replay",
      session_id: sessionId,
      timestamp: Date.now(),
      interaction_data: {
        action_type: actionType,
        details: details
      },
      somatic_indicators: somaticIndicators
    };
    
    const refPath = `users/students/${studentId}/vector_replays`;
    
    if (!this.isOnline) {
      this.enqueueOfflineTransaction(refPath, replayEvent);
      return;
    }

    try {
      await push(ref(database, refPath), replayEvent);
    } catch {
      this.enqueueOfflineTransaction(refPath, replayEvent);
    }
  }

  // --- PRD v4 Task 1 Implementation Functions ---
  public async syncSessionState(studentId: string, sessionState: SessionState): Promise<void> {
    if (!studentId) return;
    const updates: Record<string, any> = {};
    updates[`sessions/${studentId}`] = sessionState;
    updates[`users/students/${studentId}/sessionState`] = sessionState;
    await update(ref(database), updates);
  }

  public async syncHighestCompletedMeeting(studentId: string, meeting: number): Promise<void> {
    if (!studentId) return;
    const cleanId = studentId.trim().toLowerCase();
    const normId = cleanId === 'admin' || cleanId === 'teacher' || cleanId.startsWith('student_') ? cleanId : `student_${cleanId}`;
    
    const updates: Record<string, any> = {};
    updates[`users/students/${studentId}/highestCompletedMeeting`] = meeting;
    if (normId !== studentId) {
      updates[`users/students/${normId}/highestCompletedMeeting`] = meeting;
    }
    await update(ref(database), updates).catch(console.error);
  }

  public async syncMeeting2Complete(studentId: string): Promise<void> {
    if (!studentId) return;
    const cleanId = studentId.trim().toLowerCase();
    const normId = cleanId === 'admin' || cleanId === 'teacher' || cleanId.startsWith('student_') ? cleanId : `student_${cleanId}`;
    
    const updates: Record<string, any> = {};
    updates[`users/students/${studentId}/completedMeeting2`] = true;
    if (normId !== studentId) {
      updates[`users/students/${normId}/completedMeeting2`] = true;
    }
    await update(ref(database), updates).catch(console.error);
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
    const cleanId = studentId.trim().toLowerCase();
    const normId = cleanId === 'admin' || cleanId === 'teacher' || cleanId.startsWith('student_') ? cleanId : `student_${cleanId}`;
    
    const updates: Record<string, any> = {};
    updates[`users/students/${studentId}/routeRecommendation`] = route;
    updates[`users/students/${studentId}/routeStatus`] = 'PENDING';
    if (normId !== studentId) {
      updates[`users/students/${normId}/routeRecommendation`] = route;
      updates[`users/students/${normId}/routeStatus`] = 'PENDING';
    }
    try {
      await update(ref(database), updates);
    } catch (err: any) {
      this.handlePermissionOrAuthError(err);
      throw err;
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
          anonymous_students: c.anonymous_students || c.students || Array.from({ length: 35 }, (_, i) => `student_${i + 1}`)
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
    if (!this.unsubscribeSchools) {
      const schoolsRef = ref(database, 'schools');
      this.unsubscribeSchools = onValue(schoolsRef, (snapshot) => {
        if (snapshot.exists()) {
          const schoolsVal = snapshot.val();
          const schools = schoolsVal ? Object.values(schoolsVal) as School[] : [];
          useAdminStore.setState({ schools });
        } else {
          useAdminStore.setState({ schools: [] });
        }
      }, (error) => {
        console.error("Schools listener error:", error);
      });
    }

    if (isAuthenticated) {
      if (this.unsubscribePublicClasses) {
        this.unsubscribePublicClasses();
        this.unsubscribePublicClasses = null;
      }
      if (!this.unsubscribeClasses) {
        const classesRef = ref(database, 'classes');
        this.unsubscribeClasses = onValue(classesRef, (snapshot) => {
          const classesVal = snapshot.val();
          const classes = classesVal ? Object.values(classesVal) as ClassRoom[] : [];
          useAdminStore.setState({ classes });
        }, (error) => {
          console.error("Classes listener error:", error);
        });
      }
    } else {
      if (this.unsubscribeClasses) {
        this.unsubscribeClasses();
        this.unsubscribeClasses = null;
      }
      if (!this.unsubscribePublicClasses) {
        const publicClassesRef = ref(database, 'public_classes');
        this.unsubscribePublicClasses = onValue(publicClassesRef, (snapshot) => {
          const classesVal = snapshot.val();
          const classes = classesVal ? Object.values(classesVal) as ClassRoom[] : [];
          useAdminStore.setState({ classes });
        }, (error) => {
          console.error("Public classes listener error:", error);
        });
      }
    }
  }

  private async seedDefaultData() {
    const timestamp = Date.now();
    const initialSchool = { id: 'school_bikorot', name: 'ביקורת', createdAt: timestamp };
    const initialTeacher = { 
      id: '039604483', 
      schoolId: 'school_bikorot', 
      name: 'דוד', 
      taz: '039604483', 
      dob: '290984', 
      licenseActive: true, 
      createdAt: timestamp 
    };
    const initialClass = { 
      id: 'class_1', 
      schoolId: 'school_bikorot', 
      teacherId: '039604483', 
      name: 'כיתה 1', 
      studentLimit: 35, 
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
      updates[`users/teachers/039604483`] = initialTeacher;
      updates[`classes/class_1`] = initialClass;
      updates[`public_classes/class_1`] = initialPublicClass;
      updates[`system_control/globalStudentLimit`] = 35;
      
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
      const globalStudentLimit = limitVal !== null ? Number(limitVal) : 35;
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
    useAdminStore.setState({ teachers: [], globalStudentLimit: 35 });
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

  public async addTeacher(schoolId: string, name: string, taz: string, dob: string) {
    const id = taz; // Use taz as ID to align with auth and security rules
    const newTeacher: Teacher = {
      id,
      schoolId,
      name,
      taz,
      dob,
      licenseActive: true,
      createdAt: Date.now()
    };
    await set(ref(database, `users/teachers/${id}`), newTeacher);
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
    const limit = limitSnap.exists() ? Number(limitSnap.val()) : 35;

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


