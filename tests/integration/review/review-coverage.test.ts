import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { isReviewSnapshotCovered, recordReviewCoverage } from "../../../src/review/review-coverage";
import type { ReviewEntry, ReviewSnapshot } from "../../../src/review/review-fingerprint";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
const CONTEXT = `sha256:${"c".repeat(64)}`;

function snapshot(fingerprint: string, entries: ReviewEntry[], context = CONTEXT): ReviewSnapshot {
  return {
    state: {
      baseCommit: "a".repeat(40),
      fingerprint: `sha256:${fingerprint.repeat(64)}`,
      contextFingerprint: context,
      inputContextFingerprint: context,
      pathCount: entries.length,
    },
    entries,
  };
}

it("should cover a commit made only of reviewed, unchanged files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-review-coverage-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet", "-b", "main"], { cwd: root });
  const reviewed = snapshot("1", [
    ["app.ts", "100644", "1".repeat(40)],
    ["scratch.txt", "100644", "2".repeat(40)],
  ]);
  await recordReviewCoverage(root, "review", reviewed);
  const recorded = {
    fingerprint: reviewed.state.fingerprint,
    contextFingerprint: CONTEXT,
  };

  const subset = snapshot("2", [["app.ts", "100644", "1".repeat(40)]]);
  const edited = snapshot("3", [["app.ts", "100644", "9".repeat(40)]]);
  const unreviewed = snapshot("4", [["other.ts", "100644", "1".repeat(40)]]);
  const newContext = snapshot("2", subset.entries, `sha256:${"d".repeat(64)}`);

  expect(await isReviewSnapshotCovered(root, "review", recorded, reviewed)).toBe(true);
  expect(await isReviewSnapshotCovered(root, "review", recorded, subset)).toBe(true);
  expect(await isReviewSnapshotCovered(root, "review", recorded, edited)).toBe(false);
  expect(await isReviewSnapshotCovered(root, "review", recorded, unreviewed)).toBe(false);
  expect(await isReviewSnapshotCovered(root, "review", recorded, newContext)).toBe(false);
  expect(await isReviewSnapshotCovered(root, "assessment", recorded, subset)).toBe(false);
});
