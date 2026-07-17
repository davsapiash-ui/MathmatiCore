import { ref, set, get, update, serverTimestamp, onValue, onDisconnect, push, type DataSnapshot } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore, type QMatrix, type TraceData } from '@/application/useStore';
import { useAdminStore, type School, type Teacher, type ClassRoom } from '@/application/useAdminStore';

class FirebaseSyncService {
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
    // Delay initialization to avoid circular dependency with stores
    setTimeout(() => this.init(), 0);
  }

  public static getInstance(): FirebaseSyncService {
    if (!FirebaseSyncService.instance) {
      FirebaseSyncService.instance = new FirebaseSyncService();
    }
    return FirebaseSyncService.instance;
  }

  private init() {
    // Check initial auth state
    const initialAuth = useAuthStore.getState();
    this.syncSharedListeners(initialAuth.isAuthenticated);

    if (initialAuth.isAuthenticated && initialAuth.user) {
      if (initialAuth.role === 'student') {
        const userId = initialAuth.user.uid || initialAuth.user.id || initialAuth.user.email?.split('@')[0];
        if (userId) {
          this.currentUserId = userId;
          this.startSync(userId, initialAuth.user);
        }
      } else if (initialAuth.role === 'admin') {
        this.startAdminSync();
      }
    }

    // Subscribe to auth changes
    useAuthStore.subscribe((authState) => {
      this.syncSharedListeners(authState.isAuthenticated);

      if (authState.isAuthenticated && authState.user && authState.role === 'student') {
        const newUserId = authState.user.uid || authState.user.id || authState.user.email?.split('@')[0];
        if (newUserId && newUserId !== this.currentUserId) {
          this.currentUserId = newUserId;
          this.startSync(newUserId, authState.user);
        }
      } else {
        this.stopSync();
      }

      if (authState.isAuthenticated && authState.role === 'admin') {
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
      
      const syncableData = {
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

      const additionBoardEnabled = useStore.getState().students[studentId]?.additionBoardEnabled;

      update(studentRef, {
        workspaceState: syncableData,
        lastActive: serverTimestamp(),
        ...(additionBoardEnabled !== undefined && { additionBoardEnabled })
      });
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
  public async syncQMatrix(studentId: string, qMatrixUpdates: Partial<QMatrix>) {
    if (!studentId) return;
    const qMatrixRef = ref(database, `users/students/${studentId}/qMatrixResults`);
    await update(qMatrixRef, qMatrixUpdates);
  }

  public async syncTraceData(studentId: string, traceDataUpdates: Partial<TraceData>) {
    if (!studentId) return;
    const traceRef = ref(database, `users/students/${studentId}/traceData`);
    await update(traceRef, traceDataUpdates);
  }

  public async syncConceptMastery(studentId: string, masteryUpdates: any) {
    if (!studentId) return;
    const masteryRef = ref(database, `users/students/${studentId}/conceptMastery`);
    await update(masteryRef, masteryUpdates);
  }

  public async syncLiveSessionMetrics(studentId: string, metricsUpdates: any) {
    if (!studentId) return;
    const metricsRef = ref(database, `users/students/${studentId}/live_session_metrics`);
    await update(metricsRef, metricsUpdates);
  }

  public async syncRouteRecommendation(studentId: string, route: string) {
    if (!studentId) return;
    const routeRef = ref(database, `users/students/${studentId}`);
    await update(routeRef, { routeRecommendation: route, routeStatus: 'PENDING' });
  }

  public async syncMeeting2Complete(studentId: string) {
    if (!studentId) return;
    const refPath = ref(database, `users/students/${studentId}`);
    await update(refPath, { completedMeeting2: true });
  }

  public async syncHighestCompletedMeeting(studentId: string, meeting: number) {
    if (!studentId) return;
    const refPath = ref(database, `users/students/${studentId}`);
    await update(refPath, { highestCompletedMeeting: meeting });
  }

  public async syncApproveRoute(studentId: string) {
    if (!studentId) return;
    const refPath = ref(database, `users/students/${studentId}`);
    await update(refPath, { routeStatus: 'APPROVED' });
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
  public async addSchool(name: string) {
    const id = push(ref(database, 'schools')).key;
    if (!id) throw new Error("Failed to generate school ID");
    const school: School = { id, name, createdAt: Date.now() };
    await set(ref(database, `schools/${id}`), school);
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

  public async addClassRoom(schoolId: string, teacherId: string, name: string) {
    const id = push(ref(database, 'classes')).key;
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
  }

  public async deleteClassRoom(id: string) {
    const updates: Record<string, null> = {};
    updates[`classes/${id}`] = null;
    updates[`public_classes/${id}`] = null;
    await update(ref(database), updates);
  }

  public async setGlobalStudentLimit(limit: number) {
    await set(ref(database, 'system_control/globalStudentLimit'), limit);
  }
}

export const firebaseSyncService = FirebaseSyncService.getInstance();
