# Original User Request

## 2026-07-27T15:34:45Z

Tasks:
1. In `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\infrastructure\services\FirebaseSyncService.ts`:
   Add export helper at the bottom of the file:
   ```ts
   export const syncPhysicalOverride = (studentId: string, overrideData: any) =>
     firebaseSyncService.syncPhysicalOverride(studentId, overrideData);
   ```

2. In `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\presentation\pages\TeacherDashboard\components\PhysicalOverrideControl.tsx`:
   Import `firebaseSyncService` from `@/infrastructure/services/FirebaseSyncService`.
   Inside `handleSaveOverride`:
   Call `await firebaseSyncService.syncPhysicalOverride(studentId, updates);`

3. Run `npm run build` in `react-ts-version/` using `run_command` and confirm exit code 0!

Send message when done.
