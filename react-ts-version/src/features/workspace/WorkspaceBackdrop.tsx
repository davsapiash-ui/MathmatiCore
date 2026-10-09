/**
 * The learner's background shapes: static, unblended, 5% opacity (see the
 * note in StudentWorkspacePage on why they no longer animate). Shared with the
 * teacher's demonstration screen, which shows the learner's screen as it is.
 */
export function WorkspaceBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-indigo-500/5" />
      <div className="absolute -bottom-32 -right-20 w-[380px] h-[380px] rounded-full bg-teal-500/5" />
      <div className="absolute top-[30%] right-[42%] w-16 h-16 rounded-2xl rotate-12 bg-blue-500/5" />
    </div>
  );
}
