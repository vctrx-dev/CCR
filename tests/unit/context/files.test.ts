import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  createManagedTextExclusive,
  deleteManagedTextIfUnchanged,
  fingerprintManagedTree,
  readRegularFileGitMode,
  tryAcquireManagedLock,
  writeManagedText,
  writeManagedTextIfUnchanged,
} from "../../../src/context/files";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should atomically write inside the repository and reject traversal", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-files-"));
  roots.push(root);

  await writeManagedText(root, ".ccr/context.md", "safe\n");
  expect(await readFile(path.join(root, ".ccr/context.md"), "utf8")).toBe("safe\n");
  await expect(writeManagedText(root, "../outside.md", "unsafe\n")).rejects.toThrow(
    "escapes the repository",
  );
});

it("should derive Git modes only for safe regular files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-file-mode-"));
  roots.push(root);
  await writeFile(path.join(root, "regular.txt"), "content\n", "utf8");
  await mkdir(path.join(root, "directory"));

  await expect(readRegularFileGitMode(root, "regular.txt")).resolves.toBe("100644");
  await expect(readRegularFileGitMode(root, "directory")).resolves.toBeUndefined();
  await expect(readRegularFileGitMode(root, "missing.txt")).resolves.toBeUndefined();
});

it("should bound managed-tree fingerprints and tolerate an absent tree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-fingerprint-files-"));
  roots.push(root);
  await expect(fingerprintManagedTree(root, ".ccr")).resolves.toEqual(new Map());
  await mkdir(path.join(root, ".ccr/nested"), { recursive: true });
  await writeFile(path.join(root, ".ccr/nested/context.md"), "context\n");

  expect(await fingerprintManagedTree(root, ".ccr")).toEqual(
    new Map([[".ccr/nested/context.md", expect.stringMatching(/^[a-f0-9]{64}$/u)]]),
  );
  await expect(fingerprintManagedTree(root, ".ccr", 0)).rejects.toThrow("file limit");
  await expect(fingerprintManagedTree(root, ".ccr", 1, 2)).rejects.toThrow("content limit");
});

it("should hold an exclusive managed lock and permit release more than once", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-lock-files-"));
  roots.push(root);
  const release = await tryAcquireManagedLock(root, ".ccr/private/test.lock");
  expect(release).toBeTypeOf("function");
  await expect(tryAcquireManagedLock(root, ".ccr/private/test.lock")).resolves.toBeUndefined();
  await release?.();
  await expect(release?.()).resolves.toBeUndefined();
});

it("should preserve a replacement lock when an earlier owner releases", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-owned-lock-files-"));
  roots.push(root);
  const relativePath = ".ccr/private/test.lock";
  const target = path.join(root, relativePath);
  const firstRelease = await tryAcquireManagedLock(root, relativePath);
  expect(firstRelease).toBeTypeOf("function");

  await rename(target, `${target}.orphaned`);
  const secondRelease = await tryAcquireManagedLock(root, relativePath);
  expect(secondRelease).toBeTypeOf("function");
  await firstRelease?.();
  await expect(tryAcquireManagedLock(root, relativePath)).resolves.toBeUndefined();
  await secondRelease?.();
});

it("should reclaim an over-age live lock without letting its former owner release the replacement", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-aged-lock-files-"));
  roots.push(root);
  const relativePath = ".ccr/private/test.lock";
  const target = path.join(root, relativePath);
  const firstRelease = await tryAcquireManagedLock(root, relativePath);
  const ownerFile = (await readdir(target))[0];
  if (ownerFile === undefined) throw new Error("Expected managed lock owner metadata.");
  await writeFile(
    path.join(target, ownerFile),
    `${JSON.stringify({
      token: ownerFile.replace(/\.owner\.json$/u, ""),
      pid: process.pid,
      createdAt: 946_684_800_000,
    })}\n`,
  );

  const replacementRelease = await tryAcquireManagedLock(root, relativePath);
  expect(replacementRelease).toBeTypeOf("function");
  await firstRelease?.();
  await expect(tryAcquireManagedLock(root, relativePath)).resolves.toBeUndefined();
  await replacementRelease?.();
});

it.each(["token-directory", "incomplete-directory", "legacy-file"] as const)(
  "should let at most one simultaneous contender reclaim the same stale %s lock",
  async (fixture) => {
    const root = await mkdtemp(path.join(tmpdir(), "ccr-stale-contenders-files-"));
    roots.push(root);
    const relativePaths = Array.from(
      { length: 16 },
      (_, index) => `.ccr/private/test-${index}.lock`,
    );
    await mkdir(path.join(root, ".ccr/private"), { recursive: true });
    await Promise.all(
      relativePaths.map(async (relativePath) => {
        const target = path.join(root, relativePath);
        if (fixture === "token-directory") {
          await mkdir(target);
          await writeFile(
            path.join(target, "00000000-0000-0000-0000-000000000000.owner.json"),
            `${JSON.stringify({
              token: "00000000-0000-0000-0000-000000000000",
              pid: 999_999_999,
              createdAt: 946_684_800_000,
            })}\n`,
          );
        } else if (fixture === "incomplete-directory") {
          await mkdir(target);
          const old = new Date("2000-01-01T00:00:00Z");
          await utimes(target, old, old);
        } else {
          await writeFile(
            target,
            `${JSON.stringify({ pid: 999_999_999, createdAt: 946_684_800_000 })}\n`,
          );
        }
      }),
    );
    const results = await Promise.all(
      relativePaths.map(async (relativePath) => ({
        relativePath,
        contenders: await Promise.all([
          tryAcquireManagedLock(root, relativePath),
          tryAcquireManagedLock(root, relativePath),
        ]),
      })),
    );

    const acquisitionCounts: number[] = [];
    for (const { relativePath, contenders } of results) {
      const releases = contenders.filter(
        (release): release is () => Promise<void> => release !== undefined,
      );
      acquisitionCounts.push(releases.length);
      await expect(tryAcquireManagedLock(root, relativePath)).resolves.toBeUndefined();
      await Promise.all(releases.map((release) => release()));
    }
    expect(acquisitionCounts).toEqual(Array.from({ length: 16 }, () => 1));
    expect(
      (await readdir(path.join(root, ".ccr/private"))).filter((entry) =>
        entry.includes(".ccr-stale-"),
      ),
    ).toEqual([]);
  },
);

it("should treat a recent incomplete lock as active and reclaim it only after a grace period", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-incomplete-lock-files-"));
  roots.push(root);
  const relativePath = ".ccr/private/test.lock";
  const target = path.join(root, relativePath);
  await mkdir(target, { recursive: true });

  await expect(tryAcquireManagedLock(root, relativePath)).resolves.toBeUndefined();
  const old = new Date("2000-01-01T00:00:00Z");
  await utimes(target, old, old);
  const release = await tryAcquireManagedLock(root, relativePath);
  expect(release).toBeTypeOf("function");
  await release?.();
});

it("should tolerate an owner releasing while another process inspects the lock", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-release-race-lock-files-"));
  roots.push(root);
  const relativePath = ".ccr/private/test.lock";

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const release = await tryAcquireManagedLock(root, relativePath);
    expect(release).toBeTypeOf("function");
    const contender = tryAcquireManagedLock(root, relativePath);
    await release?.();
    const contenderRelease = await contender;
    await contenderRelease?.();
  }
});

it("should create managed text exclusively without overwriting a concurrent winner", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-exclusive-files-"));
  roots.push(root);
  const relativePath = ".ccr/journal/main/entry.md";

  expect(await createManagedTextExclusive(root, relativePath, "first\n")).toBe(true);
  expect(await createManagedTextExclusive(root, relativePath, "second\n")).toBe(false);
  expect(await readFile(path.join(root, relativePath), "utf8")).toBe("first\n");
});

it("should compare and replace managed text while serializing cooperating writers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-cas-files-"));
  roots.push(root);
  const relativePath = ".ccr/config.json";
  await writeManagedText(root, relativePath, "before\n");

  const results = await Promise.all([
    writeManagedTextIfUnchanged(root, relativePath, "before\n", "first\n"),
    writeManagedTextIfUnchanged(root, relativePath, "before\n", "second\n"),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(["first\n", "second\n"]).toContain(await readFile(path.join(root, relativePath), "utf8"));
});

it("should delete managed text only while its observed content is unchanged", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-delete-cas-files-"));
  roots.push(root);
  const relativePath = ".ccr/private/evidence.json";
  await writeManagedText(root, relativePath, "replacement\n");

  expect(await deleteManagedTextIfUnchanged(root, relativePath, "original\n")).toBe(false);
  expect(await readFile(path.join(root, relativePath), "utf8")).toBe("replacement\n");
  expect(await deleteManagedTextIfUnchanged(root, relativePath, "replacement\n")).toBe(true);
  expect(await deleteManagedTextIfUnchanged(root, relativePath, "replacement\n")).toBe(false);
});

it("should reject managed compare-and-delete through a symbolic-link directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-delete-symlink-files-"));
  const outside = await mkdtemp(path.join(tmpdir(), "ccr-delete-symlink-target-"));
  roots.push(root, outside);
  await writeFile(path.join(outside, "evidence.json"), "outside\n");
  await symlink(outside, path.join(root, ".ccr"), "junction");

  await expect(
    deleteManagedTextIfUnchanged(root, ".ccr/evidence.json", "outside\n"),
  ).rejects.toThrow("crosses a symbolic link");
  expect(await readFile(path.join(outside, "evidence.json"), "utf8")).toBe("outside\n");
});
