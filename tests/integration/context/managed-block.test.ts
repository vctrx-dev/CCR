import { describe, expect, it } from "vitest";
import {
  managedBlock,
  removeManagedBlock,
  upsertManagedBlock,
} from "../../../src/context/managed-block";

const BLOCK = "# ccr:start\nmanaged\n# ccr:end";

describe("managed text blocks", () => {
  it("should append, replace, and remove one managed block", () => {
    const block = managedBlock(BLOCK);
    const appended = upsertManagedBlock("user\n", block, "notes.md");
    const replaced = upsertManagedBlock("user\n\n# ccr:start\nold\n# ccr:end\n", block, "notes.md");

    expect(appended).toBe("user\n\n# ccr:start\nmanaged\n# ccr:end\n");
    expect(replaced).toBe("user\n\n# ccr:start\nmanaged\n# ccr:end\n");
    expect(removeManagedBlock(replaced, block)).toBe("user\n\n");
  });

  it("should reject malformed or duplicate blocks", () => {
    const block = managedBlock(BLOCK);

    expect(() => upsertManagedBlock("# ccr:start\nmanaged\n", block, "notes.md")).toThrow(
      "managed block conflict",
    );
    expect(() => upsertManagedBlock(`${BLOCK}\n${BLOCK}\n`, block, "notes.md")).toThrow(
      "managed block conflict",
    );
  });

  it("should preserve every byte outside the exact managed lines", () => {
    const block = managedBlock(BLOCK);
    const existing = "user  \r\n\r\n# ccr:start\r\nold\r\n# ccr:end\r\n    indented\t";

    const replaced = upsertManagedBlock(existing, block, "notes.md");

    expect(replaced).toBe("user  \r\n\r\n# ccr:start\r\nmanaged\r\n# ccr:end\r\n    indented\t");
    expect(removeManagedBlock(existing, block)).toBe("user  \r\n\r\n    indented\t");
  });

  it("should ignore inline marker prose and append a standalone managed block", () => {
    const block = managedBlock(BLOCK);
    const prose = "Example: # ccr:start then # ccr:end stays user-authored.";

    const updated = upsertManagedBlock(prose, block, "notes.md");

    expect(updated).toBe(`${prose}\n\n${BLOCK}\n`);
    expect(removeManagedBlock(prose, block)).toBe(prose);
  });

  it("should reject duplicate and malformed standalone markers during removal", () => {
    const block = managedBlock(BLOCK);

    expect(() => removeManagedBlock(`${BLOCK}\n${BLOCK}\n`, block, "notes.md")).toThrow(
      "managed block conflict",
    );
    expect(() => removeManagedBlock("# ccr:start\nuser\n", block, "notes.md")).toThrow(
      "managed block conflict",
    );
  });
});
