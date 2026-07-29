import { describe, expect, it } from "vitest";
import { findContentSecretLabels, findPathFailures } from "../../../scripts/check-repository.mjs";

describe("findPathFailures", () => {
  it("should reject generated output and dependency directories", () => {
    expect(findPathFailures("packages/app/node_modules/tool.js")).toContain(
      "generated dependency/build output must not be committed",
    );
    expect(findPathFailures("coverage/report.json")).toContain(
      "generated dependency/build output must not be committed",
    );
    expect(findPathFailures("playwright-report/trace.zip")).toContain(
      "generated dependency/build output must not be committed",
    );
    expect(findPathFailures(".cache/review-result.json")).toContain(
      "generated dependency/build output must not be committed",
    );
  });

  it("should reject environment and private-key files", () => {
    expect(findPathFailures(".env.local")).toContain(
      "environment files may contain credentials; commit a template instead",
    );
    expect(findPathFailures("certificates/service.p12")).toContain(
      "private key or certificate-container file is not allowed",
    );
  });

  it("should reject local credentials and agent-private state", () => {
    expect(findPathFailures(".npmrc")).toContain(
      "credential or local-only configuration file is not allowed",
    );
    expect(findPathFailures("config/service-account-production.json")).toContain(
      "credential or local-only configuration file is not allowed",
    );
    expect(findPathFailures(".claude/settings.local.json")).toContain(
      "credential or local-only configuration file is not allowed",
    );
    expect(findPathFailures(".ccr/journal/2026-07-28.json")).toContain(
      "credential or local-only configuration file is not allowed",
    );
    expect(findPathFailures(".ccr/cache/index.json")).toContain(
      "credential or local-only configuration file is not allowed",
    );
    expect(findPathFailures(".claude/worktrees/task/source.ts")).toContain(
      "credential or local-only configuration file is not allowed",
    );
    expect(findPathFailures("fixtures/run.response.json")).toContain(
      "credential or local-only configuration file is not allowed",
    );
    expect(findPathFailures("logs/review.log")).toContain(
      "credential or local-only configuration file is not allowed",
    );
  });

  it("should allow environment templates", () => {
    expect(findPathFailures(".env.example")).toEqual([]);
    expect(findPathFailures("config/.env.test.template")).toEqual([]);
    expect(findPathFailures(".npmrc.example")).toEqual([]);
  });
});

describe("findContentSecretLabels", () => {
  it("should detect private keys and supported provider tokens", () => {
    expect(findContentSecretLabels(`-----BEGIN ${"PRIVATE"} KEY-----`)).toContain("private key");
    expect(findContentSecretLabels(`token=${"AKIA"}${"A".repeat(16)}`)).toContain("AWS access key");
    expect(findContentSecretLabels(`token=${"sk-ant-"}${"a".repeat(24)}`)).toContain(
      "Anthropic API key",
    );
  });

  it("should ignore ordinary source text", () => {
    expect(findContentSecretLabels("const model = 'claude';")).toEqual([]);
  });
});
