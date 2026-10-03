import { expect, it } from "vitest";
import {
  isUnmodifiedJsonArtifact,
  parseManagedJsonArtifact,
  serializeUpgradableJsonArtifact,
} from "../../../src/context/managed-json";

it("should distinguish default JSON payloads from custom edits without depending on whitespace", () => {
  const original = serializeUpgradableJsonArtifact({ example: ["first"] });
  expect(isUnmodifiedJsonArtifact(original)).toBe(true);
  expect(isUnmodifiedJsonArtifact(JSON.stringify(JSON.parse(original)))).toBe(true);
  expect(isUnmodifiedJsonArtifact(original.replace("first", "other"))).toBe(false);
  expect(isUnmodifiedJsonArtifact('{"example":["first"]}')).toBe(false);
  expect(isUnmodifiedJsonArtifact("invalid JSON")).toBe(false);
  expect(parseManagedJsonArtifact(original).data).toEqual({ example: ["first"] });
});

it("should safely reject malformed metadata, oversized input, and non-object JSON", () => {
  for (const input of ["PRIVATE123", "[]", '{"_ccr":{"defaultSha256":"PRIVATE123"}}']) {
    expect(() => parseManagedJsonArtifact(input)).toThrow();
    try {
      parseManagedJsonArtifact(input);
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      expect(error.message).not.toContain("PRIVATE123");
    }
  }
  expect(() => parseManagedJsonArtifact(" ".repeat(256_001))).toThrow(/limit/u);
  expect(() => serializeUpgradableJsonArtifact({ _ccr: {} })).toThrow(/reserved/u);
  expect(() => serializeUpgradableJsonArtifact({ value: "x".repeat(256_000) })).toThrow(/limit/u);
});
