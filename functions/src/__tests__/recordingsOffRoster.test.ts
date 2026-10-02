import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { RECORDINGS_ROOT, mergeRecordingField, withRecordings } from "../recordingsNode";
import { buildResetScope } from "../exportDriveReport";
import { LEARNER_RECORD_KEY, copyVerifyAndRemove, flattenEntries, learnerNumberOfKey, planLegacyRecordingsMove, resolveEntry, type RtdbLike } from "../moveLegacyRecordings";
import { truncatedRecordingMeetings } from "../meetingMetrics";

/**
 * Module 21 — the recordings left the learner record (teacher-dashboard audit,
 * 2.10.2026). The teacher's screens listen to the whole users/students tree;
 * recordings under it reached the teacher's computer on every dashboard open.
 * They now live at recordings/{student_userN}; what was recorded before is
 * merged by every reader, covered by every reset level, and moved only when
 * the teacher presses the button.
 */

const chunk = (t: number) => ({ data: `[{"timestamp":${t}}]`, idempotency_key: `k${t}` });

describe("readers see both places as one", () => {
  it("merges a recording or budget found in both, keeping every entry", () => {
    const merged = mergeRecordingField(
      { s1: { chunks: { a: chunk(1) }, recording_truncated: true }, s0: { chunks: { z: chunk(0) } } },
      { s1: { chunks: { b: chunk(2) } }, s2: { chunks: { c: chunk(3) } } }
    )!;
    expect(Object.keys(merged).sort()).toEqual(["s0", "s1", "s2"]);
    expect(Object.keys(merged.s1.chunks).sort()).toEqual(["a", "b"]);
    expect(merged.s1.recording_truncated).toBe(true);
    const budget = mergeRecordingField({ meeting_4: { chunks: { a: 5 } } }, { meeting_4: { chunks: { b: 7 }, truncated: true } })!;
    expect(budget.meeting_4).toEqual({ chunks: { a: 5, b: 7 }, truncated: true });
  });

  it("puts the recordings node back on each learner record, without changing the input", () => {
    const students = { student_user3: { isOnline: true, telemetry_sessions: { old: { chunks: { a: chunk(1) } } } }, student_user4: { isOnline: false } };
    const recordings = {
      student_user3: { telemetry_sessions: { new: { chunks: { b: chunk(2) } } } },
      student_user4: { recorded_bytes: { meeting_2: { chunks: { a: 1 }, truncated: true } } },
      student_user9: { telemetry_sessions: { s: { chunks: { c: chunk(3) } } } },
    };
    const out = withRecordings(students, recordings);
    expect(Object.keys(out.student_user3.telemetry_sessions).sort()).toEqual(["new", "old"]);
    expect(out.student_user3.isOnline).toBe(true);
    expect(truncatedRecordingMeetings(out.student_user4)).toEqual([2]);
    expect(out.student_user9.telemetry_sessions.s.chunks.c).toEqual(chunk(3));
    expect(students.student_user3.telemetry_sessions).toEqual({ old: { chunks: { a: chunk(1) } } });
    expect(withRecordings(null, null)).toEqual({});
  });

  it("the class report and the research export read the recordings node too", () => {
    for (const file of ["classReport.ts", "exportDriveReport.ts"]) {
      const src = readFileSync(resolve(__dirname, "..", file), "utf-8");
      expect(src, file).toContain("withRecordings(studentsSnap.val(), (await rtdb.ref(RECORDINGS_ROOT).get()).val())");
    }
  });
});

describe("every reset level covers the recordings node exactly as it covered the record (Module 23א)", () => {
  it("level 3 removes it whole (and backs it up)", () => {
    expect(buildResetScope("system", "").rtdbPaths).toContain(RECORDINGS_ROOT);
  });
  it("level 2, the whole learner: removed with the record", () => {
    const scope = buildResetScope("single_student", "4", "full_student", null, "student");
    expect(scope.rtdbPaths).toContain("recordings/student_user4");
    expect(scope.rtdbPaths).toContain("users/students/student_user4");
  });
  it("level 2, the active meeting: backed up with the record, not deleted", () => {
    const scope = buildResetScope("single_student", "4", "active_session", 3, "student");
    expect(scope.rtdbPaths).toEqual([]);
    expect(scope.rtdbBackupOnlyPaths).toContain("recordings/student_user4");
    expect((scope.fieldResets || []).some((f) => f.path.startsWith(RECORDINGS_ROOT))).toBe(false);
  });
  it("level 2, the whole class: backed up, not deleted", () => {
    const scope = buildResetScope("single_student", "", "active_session", 3, "class");
    expect(scope.rtdbPaths).toEqual([]);
    expect(scope.rtdbBackupOnlyPaths).toEqual(["users/students", "chat_messages", RECORDINGS_ROOT]);
  });
});

/** An in-memory Realtime Database: root multi-path updates, null deletes, empty parents pruned. */
function fakeRtdb(initial: Record<string, any>) {
  const root: { tree: Record<string, any> } = { tree: JSON.parse(JSON.stringify(initial)) };
  const parts = (p: string) => p.split("/").filter(Boolean);
  // A copy, as a snapshot is: a later write never shows through an earlier read.
  const read = (p: string) => JSON.parse(JSON.stringify(parts(p).reduce<any>((n, k) => (n && typeof n === "object" ? n[k] : undefined), root.tree) ?? null));
  const prune = (n: any): any => {
    if (!n || typeof n !== "object") return n;
    for (const k of Object.keys(n)) {
      n[k] = prune(n[k]);
      if (n[k] === null || n[k] === undefined || (typeof n[k] === "object" && Object.keys(n[k]).length === 0)) delete n[k];
    }
    return n;
  };
  const write = (p: string, v: unknown) => {
    const ks = parts(p);
    let n = root.tree;
    for (const k of ks.slice(0, -1)) n = n[k] && typeof n[k] === "object" ? n[k] : (n[k] = {});
    n[ks[ks.length - 1]] = v === null ? null : JSON.parse(JSON.stringify(v));
    prune(root.tree);
  };
  const updates: number[] = [];
  const db: RtdbLike = {
    ref: (p: string) => ({
      get: async () => ({ val: () => read(p) }),
      update: async (values: Record<string, unknown>) => {
        updates.push(Object.keys(values).length);
        for (const [k, v] of Object.entries(values)) write(`${p}/${k}`, v);
      },
    }),
  };
  return { db, root, read, updates };
}

describe("moving the old recordings (moveLegacyRecordings)", () => {
  const legacyTree = () => ({
    users: {
      students: {
        student_user8: {
          isOnline: true,
          latestTelemetrySessionId: "session_2",
          telemetry_sessions: {
            session_1: { chunks: { a: chunk(1), b: chunk(2) }, metadata: { a: { startTime: 1 }, b: { startTime: 2 } }, recorded_bytes: 40 },
            session_2: { chunks: { c: chunk(3) }, metadata: { c: { startTime: 3 } }, recording_truncated: true },
          },
          recorded_bytes: { meeting_4: { chunks: { c: 20 }, truncated: true } },
        },
        student_1: { telemetry_sessions: { session_0: { chunks: { z: chunk(0) } } } },
        student_user2: { isOnline: false },
        teacher_1002220159: { telemetry_sessions: { x: { chunks: { y: chunk(9) } } } },
      },
    },
    recordings: {
      // Written by the new version after the update, into a recording that began before it.
      student_user8: { telemetry_sessions: { session_2: { chunks: { d: chunk(4) }, metadata: { d: { startTime: 4 } } } }, recorded_bytes: { meeting_4: { chunks: { d: 30 } } } },
    },
  });

  it("knows which keys are learners", () => {
    expect(["student_user8", "student_8", "user8", "8", "student_user13", "teacher_1002220159"].map(learnerNumberOfKey)).toEqual([8, 8, 8, 8, null, null]);
  });

  it("plans only learner records that still hold recordings, each to the canonical node", () => {
    const plan = planLegacyRecordingsMove(legacyTree().users.students);
    expect(plan.map((m) => [m.from, m.to])).toEqual([
      ["users/students/student_user8/telemetry_sessions", "recordings/student_user8/telemetry_sessions"],
      ["users/students/student_user8/recorded_bytes", "recordings/student_user8/recorded_bytes"],
      ["users/students/student_1/telemetry_sessions", "recordings/student_user1/telemetry_sessions"],
    ]);
    expect(planLegacyRecordingsMove(null)).toEqual([]);
  });

  it("flattens to whole chunks, never deeper", () => {
    const flat = flattenEntries({ s: { chunks: { a: { data: "x" } }, recording_truncated: true } }, "p", 3);
    expect(flat).toEqual({ "p/s/chunks/a": { data: "x" }, "p/s/recording_truncated": true });
  });

  it("copies, keeps what the new version wrote, removes only the old place, and leaves the rest of the record", async () => {
    const f = fakeRtdb(legacyTree());
    const result = await copyVerifyAndRemove(f.db, planLegacyRecordingsMove(f.read("users/students")));
    expect(result.mismatched).toEqual([]);
    expect(result.students).toEqual([1, 8]);
    const rec8 = f.read("recordings/student_user8");
    expect(Object.keys(rec8.telemetry_sessions).sort()).toEqual(["session_1", "session_2"]);
    expect(Object.keys(rec8.telemetry_sessions.session_2.chunks).sort()).toEqual(["c", "d"]);
    expect(rec8.telemetry_sessions.session_2.recording_truncated).toBe(true);
    expect(rec8.telemetry_sessions.session_1.recorded_bytes).toBe(40);
    expect(rec8.recorded_bytes.meeting_4).toEqual({ chunks: { c: 20, d: 30 }, truncated: true });
    expect(f.read("recordings/student_user1/telemetry_sessions/session_0/chunks/z")).toEqual(chunk(0));
    // The old place is empty; everything else on the record is untouched.
    expect(f.read("users/students/student_user8")).toEqual({ isOnline: true, latestTelemetrySessionId: "session_2" });
    expect(f.read("users/students/student_1")).toBeNull();
    expect(f.read("users/students/student_user2")).toEqual({ isOnline: false });
    expect(f.read("users/students/teacher_1002220159/telemetry_sessions/x/chunks/y")).toEqual(chunk(9));
  });

  it("running it again moves nothing and changes nothing", async () => {
    const f = fakeRtdb(legacyTree());
    await copyVerifyAndRemove(f.db, planLegacyRecordingsMove(f.read("users/students")));
    const after = JSON.stringify(f.root.tree);
    expect(planLegacyRecordingsMove(f.read("users/students"))).toEqual([]);
    const again = await copyVerifyAndRemove(f.db, []);
    expect(again.moved_entries).toBe(0);
    expect(JSON.stringify(f.root.tree)).toBe(after);
  });

  it("a chunk an old open page delivers during the move stays at the old place for the next run", async () => {
    const f = fakeRtdb(legacyTree());
    const plan = planLegacyRecordingsMove(f.read("users/students"));
    // Arrives after the plan was read.
    await f.db.ref("/").update({ "users/students/student_user8/telemetry_sessions/session_2/chunks/late": chunk(5) });
    await copyVerifyAndRemove(f.db, plan);
    expect(f.read("users/students/student_user8/telemetry_sessions/session_2/chunks/late")).toEqual(chunk(5));
    await copyVerifyAndRemove(f.db, planLegacyRecordingsMove(f.read("users/students")));
    expect(f.read("users/students/student_user8/telemetry_sessions")).toBeNull();
    expect(f.read("recordings/student_user8/telemetry_sessions/session_2/chunks/late")).toEqual(chunk(5));
  });

  it("two aliases of one learner that disagree are settled by a fixed rule, and a second press finds nothing left", async () => {
    const f = fakeRtdb({
      users: {
        students: {
          student_8: { telemetry_sessions: { s: { chunks: { a: chunk(10) }, recording_truncated: true } }, recorded_bytes: { meeting_2: { chunks: { a: 1 } } } },
          student_user8: { telemetry_sessions: { s: { chunks: { a: chunk(11) }, recording_truncated: false } }, recorded_bytes: { meeting_2: { chunks: { a: 2 }, truncated: false } } },
        },
      },
      recordings: { student_user8: { recorded_bytes: { meeting_2: { truncated: true } } } },
    });
    const result = await copyVerifyAndRemove(f.db, planLegacyRecordingsMove(f.read("users/students")));
    expect(result.mismatched).toEqual([]);
    expect(result.conflicts).toBe(4);
    // A truncated flag: true if any copy says so (including what the new place held).
    expect(f.read("recordings/student_user8/telemetry_sessions/s/recording_truncated")).toBe(true);
    expect(f.read("recordings/student_user8/recorded_bytes/meeting_2/truncated")).toBe(true);
    // Any other entry: the canonical record wins over the alias.
    expect(f.read("recordings/student_user8/telemetry_sessions/s/chunks/a")).toEqual(chunk(11));
    expect(f.read("recordings/student_user8/recorded_bytes/meeting_2/chunks/a")).toBe(2);
    // Nothing is left behind, so the radar button goes away.
    expect(f.read("users/students/student_8")).toBeNull();
    expect(f.read("users/students/student_user8")).toBeNull();
    expect(planLegacyRecordingsMove(f.read("users/students"))).toEqual([]);
  });

  it("what the new version already wrote at the new place is kept; the old value is only in the backup", async () => {
    expect(resolveEntry("recordings/student_user3/telemetry_sessions/s/chunks/k", { data: "new" }, [{ from: "users/students/student_user3/telemetry_sessions/s/chunks/k", value: { data: "old" } }])).toEqual({ data: "new" });
    expect(resolveEntry("recordings/student_user3/telemetry_sessions/s/recording_truncated", true, [{ from: "x", value: false }])).toBe(true);
    expect(resolveEntry("recordings/student_user3/telemetry_sessions/s/recording_truncated", undefined, [{ from: "x", value: false }])).toBe(false);
    expect(resolveEntry("recordings/student_user3/recorded_bytes/meeting_1/chunks/k", undefined, [
      { from: "users/students/user3/recorded_bytes/meeting_1/chunks/k", value: 9 },
      { from: "users/students/3/recorded_bytes/meeting_1/chunks/k", value: 8 },
    ])).toBe(8); // no canonical source: the first by path, every time
  });

  it("detection on the radar uses the very rule the move plans by", () => {
    const client = readFileSync(resolve(__dirname, "../../../react-ts-version/src/core/legacyRecordings.ts"), "utf-8");
    expect(client).toContain(`export const LEARNER_RECORD_KEY = ${LEARNER_RECORD_KEY.toString()};`);
    expect(client).toContain("return n >= 1 && n <= 12;");
  });

  it("an entry whose copy does not read back equal is not removed from the old place", async () => {
    const f = fakeRtdb(legacyTree());
    const realRef = f.db.ref;
    // A write that silently drops one chunk.
    f.db.ref = (p: string) => {
      const r = realRef(p);
      return { ...r, update: async (v: Record<string, unknown>) => r.update(Object.fromEntries(Object.entries(v).filter(([k, val]) => !(k.endsWith("/chunks/b") && val !== null)))) };
    };
    const result = await copyVerifyAndRemove(f.db, planLegacyRecordingsMove(f.read("users/students")));
    expect(result.mismatched).toEqual(["users/students/student_user8/telemetry_sessions/session_1/chunks/b"]);
    expect(f.read("users/students/student_user8/telemetry_sessions/session_1/chunks/b")).toEqual(chunk(2));
    expect(f.read("users/students/student_user8/telemetry_sessions/session_1/chunks/a")).toBeNull();
  });

  it("the callable backs up before it moves, is the class teacher's only, and is not run on deploy", () => {
    const src = readFileSync(resolve(__dirname, "../moveLegacyRecordings.ts"), "utf-8");
    expect(src).toContain("requireTeacherForIndividualData(token);");
    expect(src).toContain("assertCallerClass(token, class_id,");
    expect(src.indexOf("await uploadBufferToDrive(")).toBeLessThan(src.indexOf("await copyVerifyAndRemove(rtdb"));
    expect(src).toContain('throw new HttpsError("internal", "הגיבוי נכשל, ולכן ההקלטות לא הועברו. לא נמחק דבר.");');
    const index = readFileSync(resolve(__dirname, "../index.ts"), "utf-8");
    expect(index).toContain('export { moveLegacyRecordings } from "./moveLegacyRecordings";');
    expect(src).not.toMatch(/onValueWritten|onSchedule|onDocument/);
  });
});
