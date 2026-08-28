import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createCli } from "../../../src/cli/index";
import { createTemporaryRootRegistry, runCommand } from "../../helpers/test-environment";

const roots = createTemporaryRootRegistry();

it("should apply package updates without replacing shared context or local journals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-cli-update-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await createCli({ cwd: root, write: () => undefined }).parseAsync(["node", "ccr", "setup"]);
  const projectPath = path.join(root, ".ccr/project.md");
  const journalPath = path.join(root, ".ccr/journal/local.md");
  await writeFile(projectPath, "# Team-owned project context\n", "utf8");
  await mkdir(path.dirname(journalPath), { recursive: true });
  await writeFile(journalPath, "# Local continuity\n", "utf8");
  let output = "";

  await createCli({
    cwd: root,
    write: (message: string) => {
      output += message;
    },
  }).parseAsync(["node", "ccr", "update"]);

  expect(output).toContain("CCR update is already current.");
  expect(await readFile(projectPath, "utf8")).toBe("# Team-owned project context\n");
  expect(await readFile(journalPath, "utf8")).toBe("# Local continuity\n");
});

it("should direct legacy hook owners to safe cleanup before synchronization", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccr-cli-legacy-hooks-"));
  roots.push(root);
  await runCommand("git", ["init", "--quiet"], { cwd: root });
  await writeFile(
    path.join(root, ".git/hooks/pre-commit"),
    "#!/bin/sh\n# ccr:start - advisory context check\nlegacy\n# ccr:end\n",
    "utf8",
  );
  let output = "";

  await createCli({
    cwd: root,
    write: (message: string) => {
      output += message;
    },
  }).parseAsync(["node", "ccr", "setup"]);

  expect(output).toContain("ccr hooks uninstall");
  expect(output).toContain("/ccr-hooks sync");
});
