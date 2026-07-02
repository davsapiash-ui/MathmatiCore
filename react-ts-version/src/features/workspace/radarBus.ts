/**
 * radarBus — decouples store actions from the React radar hook.
 * The hook (useWorkspaceRadar, Increment 6) registers real recorders here;
 * until then every call is a safe no-op. The bus must NEVER surface anything
 * to the student (covert monitoring per spec).
 */

export interface RadarRecorders {
  recordAction: () => void;
  recordDelete: () => void;
  recordUndo: () => void;
  recordHintRequest: () => void;
  recordTaskError: (taskId: string, detail: string) => void;
  setTask: (taskId: string) => void;
}

const noop = () => {};

let recorders: RadarRecorders = {
  recordAction: noop,
  recordDelete: noop,
  recordUndo: noop,
  recordHintRequest: noop,
  recordTaskError: noop,
  setTask: noop,
};

export function registerRadar(r: RadarRecorders) {
  recorders = r;
}

export function unregisterRadar() {
  recorders = {
    recordAction: noop,
    recordDelete: noop,
    recordUndo: noop,
    recordHintRequest: noop,
    recordTaskError: noop,
    setTask: noop,
  };
}

export const radar: RadarRecorders = {
  recordAction: () => recorders.recordAction(),
  recordDelete: () => recorders.recordDelete(),
  recordUndo: () => recorders.recordUndo(),
  recordHintRequest: () => recorders.recordHintRequest(),
  recordTaskError: (taskId, detail) => recorders.recordTaskError(taskId, detail),
  setTask: (taskId) => recorders.setTask(taskId),
};
