import { expect, it } from "vitest";
import { quoteGitPath } from "../../../src/context/git-process";

it("should quote paths in Git's C style rather than JSON's unicode escapes", () => {
  expect(quoteGitPath("plain.ts")).toBe('"plain.ts"');
  expect(quoteGitPath('a"b\\c')).toBe('"a\\"b\\\\c"');
  expect(quoteGitPath("line\nbreak")).toBe('"line\\012break"');
  expect(quoteGitPath("esc\u001bname")).toBe('"esc\\033name"');
  expect(quoteGitPath("del\u007f")).toBe('"del\\177"');
  expect(quoteGitPath("rôle.ts")).toBe('"rôle.ts"');
});
