import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { buildAutomaticContextEvidencePacket } from "../../../src/context/automatic-context-evidence";
import { createSafeCommitEvidenceReader } from "../../../src/context/broker";
import {
  createTemporaryGitRepository,
  createTemporaryRootRegistry,
  runCommand,
} from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should share approved immutable evidence only while HEAD and privacy remain unchanged", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-commit-reader-");
  await mkdir(path.join(root, ".ccr"));
  await writeFile(path.join(root, ".ccr/config.json"), "{}");
  await writeFile(path.join(root, "source.txt"), "approved\n");
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "-qm", "test: seed"], { cwd: root });
  const commit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const reader = await createSafeCommitEvidenceReader(root, commit);
  expect((await reader.listPaths()).paths).toContain("source.txt");
  await expect(reader.readFile("source.txt")).resolves.toContain("approved");
  await expect(reader.readDiff("source.txt")).resolves.toContain("+approved");
  await expect(reader.readFile("not-approved.txt")).rejects.toThrow(/approved/u);

  await writeFile(
    path.join(root, ".ccr/config.json"),
    JSON.stringify({ privacy: { excludedPaths: ["source.txt"] } }),
  );
  await expect(reader.readFile("source.txt")).rejects.toThrow(/configuration changed/u);
  await expect(reader.readDiff("source.txt")).rejects.toThrow(/configuration changed/u);
  await writeFile(path.join(root, ".ccr/config.json"), "{}");
  await runCommand("git", ["commit", "--allow-empty", "-qm", "test: advance"], { cwd: root });
  await expect(reader.readFile("source.txt")).rejects.toThrow(/current HEAD/u);
});

it("should serve a commit in the current history only to history-scoped readers", async () => {
  const root = await createTemporaryGitRepository(roots, "ccr-commit-history-reader-");
  await mkdir(path.join(root, ".ccr"));
  await writeFile(path.join(root, ".ccr/config.json"), "{}");
  await writeFile(path.join(root, "source.txt"), "approved\n");
  await runCommand("git", ["add", "."], { cwd: root });
  await runCommand("git", ["commit", "-qm", "test: seed"], { cwd: root });
  const commit = (await runCommand("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await runCommand("git", ["commit", "--allow-empty", "-qm", "test: later"], { cwd: root });

  await expect(createSafeCommitEvidenceReader(root, commit)).rejects.toThrow(/current HEAD/u);
  const reader = await createSafeCommitEvidenceReader(root, commit, { scope: "history" });
  await expect(reader.readFile("source.txt")).resolves.toContain("approved");
  await expect(reader.readDiff("source.txt")).resolves.toContain("+approved");
  // A background update that starts after the developer commits again still gets its evidence.
  await expect(buildAutomaticContextEvidencePacket(root, commit)).resolves.toContain("source.txt");
});
