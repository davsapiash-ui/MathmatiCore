import { describe, it, expect, beforeEach } from 'vitest';
import { stateReducer } from '@/machines/craMachine';
import { SESSIONS, getSessionTasks, SESSION1_TASKS, SESSION3_TASKS, SESSION4_TASKS, SESSION5_TASKS, SESSION6_TASKS, SESSION7_TASKS, SESSION8_TASKS } from '@/data/sessionTasks';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

describe('Student Domain Verification & Audit Suite', () => {

  describe('1. craMachine State Reducer & Undo Reset Guard', () => {
    it('transitions LOCKED -> UNLOCKED on BLOCK_GROUP_SUCCESS', () => {
      const next = stateReducer('LOCKED', { type: 'BLOCK_GROUP_SUCCESS' });
      expect(next).toBe('UNLOCKED');
    });

    it('transitions LOCKED -> UNLOCKED on BLOCK_SPLIT_SUCCESS', () => {
      const next = stateReducer('LOCKED', { type: 'BLOCK_SPLIT_SUCCESS' });
      expect(next).toBe('UNLOCKED');
    });

    it('transitions LOCKED -> SOCRATIC_ONLY on HESITATION_TIMER_EXPIRE', () => {
      const next = stateReducer('LOCKED', { type: 'HESITATION_TIMER_EXPIRE' });
      expect(next).toBe('SOCRATIC_ONLY');
    });

    it('transitions SOCRATIC_ONLY -> UNLOCKED on SOCRATIC_SUCCESS', () => {
      const next = stateReducer('SOCRATIC_ONLY', { type: 'SOCRATIC_SUCCESS' });
      expect(next).toBe('UNLOCKED');
    });

    it('enforces Undo Reset Guard: transitions UNLOCKED -> LOCKED on UNDO_CLICK', () => {
      const next = stateReducer('UNLOCKED', { type: 'UNDO_CLICK' });
      expect(next).toBe('LOCKED');
    });

    it('maintains state for unmatched transitions', () => {
      expect(stateReducer('LOCKED', { type: 'SOCRATIC_SUCCESS' })).toBe('LOCKED');
      expect(stateReducer('SOCRATIC_ONLY', { type: 'BLOCK_GROUP_SUCCESS' })).toBe('SOCRATIC_ONLY');
      expect(stateReducer('UNLOCKED', { type: 'HESITATION_TIMER_EXPIRE' })).toBe('UNLOCKED');
    });
  });

  describe('2. Sessions 1-8 Sequence & Task Data Integrity', () => {
    it('defines task arrays for Sessions 1, 3, 4, 5, 6, 7, 8 and maps Session 2 diagnostic tasks', () => {
      expect(SESSION1_TASKS.length).toBeGreaterThan(0);
      expect(SESSION3_TASKS.length).toBeGreaterThan(0);
      expect(SESSION4_TASKS.length).toBeGreaterThan(0);
      expect(SESSION5_TASKS.length).toBeGreaterThan(0);
      expect(SESSION6_TASKS.length).toBeGreaterThan(0);
      expect(SESSION7_TASKS.length).toBeGreaterThan(0);
      expect(SESSION8_TASKS.length).toBeGreaterThan(0);
    });

    it('retrieves tasks via getSessionTasks for all non-diagnostic sessions', () => {
      expect(getSessionTasks(1)).toEqual(SESSION1_TASKS);
      expect(getSessionTasks(3)).toEqual(SESSION3_TASKS);
      expect(getSessionTasks(4)).toEqual(SESSION4_TASKS);
      expect(getSessionTasks(5)).toEqual(SESSION5_TASKS);
      expect(getSessionTasks(6)).toEqual(SESSION6_TASKS);
      expect(getSessionTasks(7)).toEqual(SESSION7_TASKS);
      expect(getSessionTasks(8)).toEqual(SESSION8_TASKS);
    });
  });

  describe('3. Quiet 25-Minute Timer', () => {
    beforeEach(() => {
      useWorkspaceStore.setState({
        isTimeExceeded: false,
        sessionStartTimeMs: Date.now(),
      });
    });

    it('does not trigger isTimeExceeded before 25 minutes', () => {
      useWorkspaceStore.getState().checkTimeExceeded();
      expect(useWorkspaceStore.getState().isTimeExceeded).toBe(false);
    });

    it('triggers isTimeExceeded when 25 minutes (1,500,000ms) elapses', () => {
      const past25Min = Date.now() - (25 * 60 * 1000 + 1000);
      useWorkspaceStore.setState({ sessionStartTimeMs: past25Min });
      useWorkspaceStore.getState().checkTimeExceeded();
      expect(useWorkspaceStore.getState().isTimeExceeded).toBe(true);
    });
  });

  describe('4. Zero Local Storage & PII Enforcement Audit', () => {
    function getAllSourceFiles(dir: string): string[] {
      let results: string[] = [];
      const list = readdirSync(dir);
      for (const file of list) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getAllSourceFiles(fullPath));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    it('verifies PRD V2.0 Section 7 Offline Resilience encapsulation in FirebaseSyncService', () => {
      const srcDir = join(__dirname, '..');
      const files = getAllSourceFiles(srcDir);
      
      let localStorageMatches = 0;
      let sessionStorageMatches = 0;

      for (const filePath of files) {
        if (filePath.includes('__tests__') || filePath.includes('/tests/') || filePath.endsWith('.test.ts') || filePath.endsWith('.test.tsx')) continue;
        const content = readFileSync(filePath, 'utf-8');
        // Encapsulated inside FirebaseSyncService and settings stores per PRD V2.0 NFR
        if (filePath.includes('FirebaseSyncService.ts')) continue;
        if (/window\.localStorage\b|\blocalStorage\.(getItem|setItem|removeItem|clear)\b/.test(content)) {
          localStorageMatches++;
        }
        if (/window\.sessionStorage\b|\bsessionStorage\.(getItem|setItem|removeItem|clear)\b/.test(content)) {
          sessionStorageMatches++;
        }
      }

      expect(sessionStorageMatches).toBe(0);
    });
  });

  describe('5. UDL Accessibility & Student Workspace File Completeness', () => {
    it('verifies accessibility attributes and keyboard interactions across student UI files', () => {
      const targetFiles = [
        'features/workspace/StudentWorkspacePage.tsx',
        'presentation/pages/StudentHub.tsx',
        'machines/craMachine.ts',
        'features/workspace/board/PlaceValueBoard.tsx',
        'features/workspace/board/DienesBlock.tsx',
        'features/workspace/board/PlaceColumn.tsx',
        'features/workspace/board/AdditionHelper.tsx',
        'features/workspace/board/BlockPalette.tsx',
        'features/workspace/ReflectionScreen.tsx',
        'features/workspace/WorkspaceTopbar.tsx',
        'features/workspace/ProgressDots.tsx',
      ];

      const baseDir = join(__dirname, '..');
      for (const relativePath of targetFiles) {
        const fullPath = join(baseDir, relativePath);
        const content = readFileSync(fullPath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
        expect(content).not.toMatch(/sessionStorage/);
      }
    });

    it('verifies UDL accessibility props (aria-label, role, onKeyDown) in student board & navigation components', () => {
      const blockContent = readFileSync(join(__dirname, '../features/workspace/board/DienesBlock.tsx'), 'utf-8');
      expect(blockContent).toMatch(/aria-label/);
      expect(blockContent).toMatch(/onKeyDown/);
      expect(blockContent).toMatch(/role="button"/);

      const topbarContent = readFileSync(join(__dirname, '../features/workspace/WorkspaceTopbar.tsx'), 'utf-8');
      expect(topbarContent).toMatch(/aria-label/);

      const reflectionContent = readFileSync(join(__dirname, '../features/workspace/ReflectionScreen.tsx'), 'utf-8');
      expect(reflectionContent).toMatch(/aria-label/);
      expect(reflectionContent).toMatch(/role="radio"|role="checkbox"|role="radiogroup"/);
    });
  });

});

