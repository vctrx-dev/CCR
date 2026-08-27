import { describe, expect, it } from "vitest";
import {
  type AutomaticContextEvidenceBroker,
  buildAutomaticContextEvidencePacket,
} from "../../../src/context/automatic-context-evidence";

const COMMIT = "a".repeat(40);
const MAX_PATHS = 200;
const MAX_RETAINED_CHARACTERS = 200_000;
const MAX_PACKET_BYTES = 512_000;

function createSinglePageBroker(
  paths: string[],
  readFile: AutomaticContextEvidenceBroker["readFile"] = async () => "",
): AutomaticContextEvidenceBroker {
  return {
    async listPaths() {
      return { paths, excludedCount: 0, omittedCount: 0 };
    },
    readFile,
  };
}

function createContentForPacketByteLength(targetBytes: number, contentCharacters: number): string {
  const path = "x";
  const emptyPacket = `${JSON.stringify(
    {
      schemaVersion: 1,
      commit: COMMIT,
      excludedPathCount: 0,
      files: [{ path, content: "" }],
    },
    null,
    2,
  )}\n`;
  const extraBytes = targetBytes - Buffer.byteLength(emptyPacket, "utf8") - contentCharacters;
  const threeByteCharacters = Math.floor(extraBytes / 2);
  const twoByteCharacters = extraBytes % 2;
  const asciiCharacters = contentCharacters - threeByteCharacters - twoByteCharacters;
  if (extraBytes < 0 || asciiCharacters < 0) {
    throw new Error("Target byte length cannot be represented within the character limit.");
  }
  return `${"€".repeat(threeByteCharacters)}${"é".repeat(twoByteCharacters)}${"x".repeat(asciiCharacters)}`;
}

describe("buildAutomaticContextEvidencePacket", () => {
  it("should paginate approved paths and retain only brokered immutable evidence", async () => {
    const broker: AutomaticContextEvidenceBroker = {
      async listPaths(_root, _commit, after) {
        return after === undefined
          ? {
              paths: ["safe-one.ts"],
              excludedCount: 1,
              omittedCount: 1,
              nextCursor: "safe-one.ts",
            }
          : { paths: ["safe-two.ts"], excludedCount: 1, omittedCount: 0 };
      },
      async readFile(_root, _commit, file) {
        return `approved:${file}`;
      },
    };

    const content = await buildAutomaticContextEvidencePacket("C:/repository", COMMIT, broker);

    expect(content).toContain('"excludedPathCount": 1');
    expect(content).toContain("approved:safe-one.ts");
    expect(content).toContain("approved:safe-two.ts");
    expect(content).not.toContain("excluded-secret");
  });

  it("should fail closed when the approved commit contains too many paths", async () => {
    const broker: AutomaticContextEvidenceBroker = {
      async listPaths() {
        return {
          paths: Array.from({ length: 201 }, (_, index) => `file-${index}.ts`),
          excludedCount: 0,
          omittedCount: 0,
        };
      },
      async readFile() {
        return "content";
      },
    };

    await expect(
      buildAutomaticContextEvidencePacket("C:/repository", COMMIT, broker),
    ).rejects.toThrow("Automatic context evidence exceeds its path limit.");
  });

  it("should accept exactly the approved path limit", async () => {
    const paths = Array.from({ length: MAX_PATHS }, (_, index) => `file-${index}.ts`);

    const content = await buildAutomaticContextEvidencePacket(
      "C:/repository",
      COMMIT,
      createSinglePageBroker(paths),
    );

    expect(JSON.parse(content)).toMatchObject({
      files: paths.map((path) => ({ path, content: "" })),
    });
  });

  it.each([
    {
      name: "within one page",
      listPaths: async () => ({
        paths: ["duplicate.ts", "duplicate.ts"],
        excludedCount: 0,
        omittedCount: 0,
      }),
    },
    {
      name: "across pages",
      listPaths: async (_root: string, _commit: string, after?: string) =>
        after === undefined
          ? {
              paths: ["duplicate.ts"],
              excludedCount: 0,
              omittedCount: 1,
              nextCursor: "duplicate.ts",
            }
          : { paths: ["duplicate.ts"], excludedCount: 0, omittedCount: 0 },
    },
  ])("should reject duplicate approved paths $name before reading blobs", async ({ listPaths }) => {
    let readCount = 0;
    const broker: AutomaticContextEvidenceBroker = {
      listPaths,
      async readFile() {
        readCount += 1;
        return "content";
      },
    };

    await expect(
      buildAutomaticContextEvidencePacket("C:/repository", COMMIT, broker),
    ).rejects.toThrow("Automatic context evidence pagination repeated a path.");
    expect(readCount).toBe(0);
  });

  it("should reject an exclusion-count change before reading blobs", async () => {
    let readCount = 0;
    const broker: AutomaticContextEvidenceBroker = {
      async listPaths(_root, _commit, after) {
        return after === undefined
          ? {
              paths: ["first.ts"],
              excludedCount: 1,
              omittedCount: 1,
              nextCursor: "first.ts",
            }
          : { paths: ["second.ts"], excludedCount: 2, omittedCount: 0 };
      },
      async readFile() {
        readCount += 1;
        return "content";
      },
    };

    await expect(
      buildAutomaticContextEvidencePacket("C:/repository", COMMIT, broker),
    ).rejects.toThrow("Automatic context evidence changed during pagination.");
    expect(readCount).toBe(0);
  });

  it.each([
    {
      name: "missing cursor",
      listPaths: async () => ({ paths: ["first.ts"], excludedCount: 0, omittedCount: 1 }),
      message: "Automatic context evidence pagination is incomplete.",
    },
    {
      name: "non-advancing cursor",
      listPaths: async (_root: string, _commit: string, after?: string) =>
        after === undefined
          ? {
              paths: ["first.ts"],
              excludedCount: 0,
              omittedCount: 1,
              nextCursor: "first.ts",
            }
          : {
              paths: ["second.ts"],
              excludedCount: 0,
              omittedCount: 1,
              nextCursor: "first.ts",
            },
      message: "Automatic context evidence pagination is incomplete.",
    },
    {
      name: "unexpected terminal cursor",
      listPaths: async () => ({
        paths: ["only.ts"],
        excludedCount: 0,
        omittedCount: 0,
        nextCursor: "only.ts",
      }),
      message: "Automatic context evidence pagination is invalid.",
    },
  ])("should reject pagination with a $name", async ({ listPaths, message }) => {
    const broker: AutomaticContextEvidenceBroker = {
      listPaths,
      async readFile() {
        return "content";
      },
    };

    await expect(
      buildAutomaticContextEvidencePacket("C:/repository", COMMIT, broker),
    ).rejects.toThrow(message);
  });

  it("should accept exactly the retained-character limit", async () => {
    const path = "x";
    const fileContent = "x".repeat(MAX_RETAINED_CHARACTERS - path.length);

    const content = await buildAutomaticContextEvidencePacket(
      "C:/repository",
      COMMIT,
      createSinglePageBroker([path], async () => fileContent),
    );

    const parsed = JSON.parse(content);
    expect(parsed.files[0].content).toHaveLength(MAX_RETAINED_CHARACTERS - path.length);
  });

  it("should reject one character above the retained-character limit", async () => {
    const path = "x";
    const fileContent = "x".repeat(MAX_RETAINED_CHARACTERS - path.length + 1);

    await expect(
      buildAutomaticContextEvidencePacket(
        "C:/repository",
        COMMIT,
        createSinglePageBroker([path], async () => fileContent),
      ),
    ).rejects.toThrow("Automatic context evidence exceeds its content limit.");
  });

  it("should accept a multibyte packet at exactly the final byte ceiling", async () => {
    const path = "x";
    const fileContent = createContentForPacketByteLength(
      MAX_PACKET_BYTES,
      MAX_RETAINED_CHARACTERS - path.length,
    );

    const packet = await buildAutomaticContextEvidencePacket(
      "C:/repository",
      COMMIT,
      createSinglePageBroker([path], async () => fileContent),
    );

    expect(Buffer.byteLength(packet, "utf8")).toBe(MAX_PACKET_BYTES);
  });

  it("should reject a multibyte packet one byte above the final byte ceiling", async () => {
    const path = "x";
    const fileContent = createContentForPacketByteLength(
      MAX_PACKET_BYTES + 1,
      MAX_RETAINED_CHARACTERS - path.length,
    );

    await expect(
      buildAutomaticContextEvidencePacket(
        "C:/repository",
        COMMIT,
        createSinglePageBroker([path], async () => fileContent),
      ),
    ).rejects.toThrow("Automatic context evidence exceeds its content limit.");
  });

  it("should fail closed before retaining an oversized evidence packet", async () => {
    const broker: AutomaticContextEvidenceBroker = {
      async listPaths() {
        return { paths: ["large.txt"], excludedCount: 0, omittedCount: 0 };
      },
      async readFile() {
        return "x".repeat(1_000_000);
      },
    };

    await expect(
      buildAutomaticContextEvidencePacket("C:/repository", COMMIT, broker),
    ).rejects.toThrow("Automatic context evidence exceeds its content limit.");
  });
});
