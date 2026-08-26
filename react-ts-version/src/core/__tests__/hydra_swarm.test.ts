import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../../application/useWorkspaceStore';
import type { Place } from '../../core/placeValue';

describe('THE HYDRA SWARM INQUISITION (20-Node Concurrent Fuzzer)', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().initSession(1, false);
  });

  it('executes 20 concurrent chaos agents across network, pedagogy, rage-click, poison, and teacher override vectors', async () => {
    const agents: Promise<void>[] = [];
    const places: Place[] = ['units', 'tens', 'hundreds', 'thousands'];

    // --- Agents 1-5: The Network Ghosts ---
    for (let i = 1; i <= 5; i++) {
      agents.push(
        (async () => {
          for (let step = 0; step < 50; step++) {
            // Rapid toggle mock online/offline
            if (typeof window !== 'undefined') {
              Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: step % 2 === 0,
              });
            }
            const place = places[step % places.length];
            useWorkspaceStore.getState().splitBlockClick(place);
            useWorkspaceStore.getState().applyDrop({
              source: 'palette',
              sourcePlace: place,
              target: { kind: 'column', place },
            });
            await new Promise((r) => setTimeout(r, 2));
          }
        })()
      );
    }

    // --- Agents 6-10: The Pedagogical Nightmares ---
    for (let i = 6; i <= 10; i++) {
      agents.push(
        (async () => {
          for (let step = 0; step < 50; step++) {
            // Input 100% incorrect answers
            useWorkspaceStore.getState().setAnswerDigit('units', '999');
            useWorkspaceStore.getState().selectChoice('WRONG_CHOICE_ID');
            useWorkspaceStore.getState().proceed();

            // Instantly clear feedback modal millisecond it opens (memory leak / timer check)
            useWorkspaceStore.setState({ feedback: null });

            await new Promise((r) => setTimeout(r, 2));
          }
        })()
      );
    }

    // --- Agents 11-15: The Rage Clickers ---
    for (let i = 11; i <= 15; i++) {
      agents.push(
        (async () => {
          for (let step = 0; step < 100; step++) {
            const place = places[step % places.length];
            useWorkspaceStore.getState().applyDrop({
              source: 'palette',
              sourcePlace: place,
              target: { kind: 'column', place },
            });
            useWorkspaceStore.getState().groupColumnClick(place);
            useWorkspaceStore.getState().undo();
            await Promise.resolve(); // Async micro-tick rage firing
          }
        })()
      );
    }

    // --- Agents 16-19: The State Poisoners ---
    for (let i = 16; i <= 19; i++) {
      agents.push(
        (async () => {
          for (let step = 0; step < 30; step++) {
            // Inject invalid target nodes, malformed task IDs, null payloads
            try {
              useWorkspaceStore.getState().injectTask(
                {
                  id: null as any,
                  scaffoldLevel: -1 as any,
                  prompt: undefined as any,
                  targetNode: 'CORRUPT_NODE_999' as any,
                } as any,
                'next'
              );
            } catch (_e) {
              // Store should gracefully handle or swallow bad inputs
            }

            useWorkspaceStore.getState().setAnswerDigit('tens', null as any);
            useWorkspaceStore.getState().setProbeAnswer(undefined as any);
            useWorkspaceStore.setState((s: any) => ({
              nodeStrikes: { ...s.nodeStrikes, [null as any]: NaN },
            }));

            await new Promise((r) => setTimeout(r, 3));
          }
        })()
      );
    }

    // --- Agent 20: The Teacher Override Collision ---
    agents.push(
      (async () => {
        for (let step = 0; step < 80; step++) {
          useWorkspaceStore.setState({
            keyboardState: 'LOCKED',
            isBoardLocked: true,
            isAdditionHelperOpen: false,
          });
          useWorkspaceStore.getState().lockKeyboard();
          useWorkspaceStore.getState().closeAdditionHelper();

          // Interleaved unlock toggles
          if (step % 5 === 0) {
            useWorkspaceStore.getState().unlockKeyboard();
            useWorkspaceStore.setState({ isBoardLocked: false });
          }

          await new Promise((r) => setTimeout(r, 2));
        }
      })()
    );

    // Run all 20 concurrent chaos agents simultaneously
    await Promise.all(agents);

    // Assert final store state remains coherent and defined
    const finalState = useWorkspaceStore.getState();
    expect(finalState).toBeDefined();
    expect(typeof finalState.counts).toBe('object');
    expect(Array.isArray(finalState.undoStack)).toBe(true);
    expect(finalState.undoStack.length).toBeLessThanOrEqual(50);
  }, 30000);
});
