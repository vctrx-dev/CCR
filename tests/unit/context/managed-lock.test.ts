import * as filesystem from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { tryAcquireManagedLock } from "../../../src/context/managed-lock";
import { createTemporaryRootRegistry } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof filesystem>();
  return { ...actual, lstat: vi.fn(actual.lstat), writeFile: vi.fn(actual.writeFile) };
});

it("should reject a delayed incomplete creator that resumes inside a live replacement", async () => {
  const root = await filesystem.mkdtemp(path.join(tmpdir(), "ccr-delayed-lock-"));
  roots.push(root);
  const relativePath = ".ccr/private/test.lock";
  const target = path.join(root, relativePath);
  const originalWrite = (await vi.importActual<typeof filesystem>("node:fs/promises")).writeFile;
  let resume: () => void = () => undefined;
  let notify: () => void = () => undefined;
  const paused = new Promise<void>((resolve) => {
    notify = resolve;
  });
  const continued = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let shouldPause = true;
  vi.mocked(filesystem.writeFile).mockImplementation(async (...args) => {
    if (shouldPause && String(args[0]).endsWith(".owner.json")) {
      shouldPause = false;
      notify();
      await continued;
    }
    return originalWrite(...args);
  });
  const delayed = tryAcquireManagedLock(root, relativePath);
  await paused;
  await filesystem.utimes(target, new Date(0), new Date(0));
  const replacementRelease = await tryAcquireManagedLock(root, relativePath);
  resume();
  const delayedRelease = await delayed;
  try {
    expect(replacementRelease).toBeTypeOf("function");
    expect(delayedRelease).toBeUndefined();
    await expect(tryAcquireManagedLock(root, relativePath)).resolves.toBeUndefined();
  } finally {
    await delayedRelease?.();
    await replacementRelease?.();
  }
});
afterEach(() => vi.restoreAllMocks());

it("should leave old malformed owner metadata untouched rather than evict a delayed writer", async () => {
  const root = await filesystem.mkdtemp(path.join(tmpdir(), "ccr-incomplete-owner-"));
  roots.push(root);
  const relativePath = ".ccr/private/test.lock";
  const target = path.join(root, relativePath);
  await filesystem.mkdir(target, { recursive: true });
  const ownerPath = path.join(target, "11111111-1111-1111-1111-111111111111.owner.json");
  await filesystem.writeFile(ownerPath, '{"pid":');
  await filesystem.utimes(target, new Date(0), new Date(0));

  await expect(tryAcquireManagedLock(root, relativePath)).resolves.toBeUndefined();
  await expect(filesystem.readFile(ownerPath, "utf8")).resolves.toBe('{"pid":');
});

it("should not reclaim a live replacement after observing a stale lock", async () => {
  const root = await filesystem.mkdtemp(path.join(tmpdir(), "ccr-lock-replacement-"));
  roots.push(root);
  const relativePath = ".ccr/private/test.lock";
  const target = path.join(root, relativePath);
  await filesystem.mkdir(target, { recursive: true });
  await filesystem.writeFile(
    path.join(target, "11111111-1111-1111-1111-111111111111.owner.json"),
    JSON.stringify({
      token: "11111111-1111-1111-1111-111111111111",
      pid: 999_999_999,
      createdAt: 0,
    }),
  );
  const originalLstat = (await vi.importActual<typeof filesystem>("node:fs/promises")).lstat;
  let observations = 0;
  let replacementRelease: (() => Promise<void>) | undefined;
  vi.mocked(filesystem.lstat).mockImplementation(async (...args) => {
    const details = await originalLstat(...args);
    if (args[0] === target && ++observations === 4) {
      await filesystem.rename(target, `${target}.old`);
      replacementRelease = await tryAcquireManagedLock(root, relativePath);
    }
    return details;
  });

  const staleRelease = await tryAcquireManagedLock(root, relativePath);
  try {
    expect(replacementRelease).toBeTypeOf("function");
    expect(staleRelease).toBeUndefined();
    await expect(tryAcquireManagedLock(root, relativePath)).resolves.toBeUndefined();
  } finally {
    await staleRelease?.();
    await replacementRelease?.();
  }
});
