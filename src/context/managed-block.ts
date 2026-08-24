/**
 * Reusable exact-line marked-text operations for integration files. Marker recognition and
 * mutations are byte-bounded: content outside the block and its explicitly selected separator is
 * never normalized. Any new managed instruction span must use this module rather than string
 * replacement so user-owned text stays intact.
 */
export interface ManagedBlock {
  content: string;
  end: string;
  start: string;
}

interface TextLine {
  end: number;
  endWithNewline: number;
  start: number;
  text: string;
}

export type ManagedBlockInspection =
  | { status: "absent" }
  | { status: "conflict" }
  | { end: number; endWithNewline: number; start: number; status: "valid" };

/** Selects whether terminal cleanup owns the appended EOL or only a legacy blank separator. */
export interface ManagedBlockRemovalOptions {
  terminalSeparator?: "legacy-blank" | "owned" | "preserve";
}

/** Builds a block whose start and end markers are the first and last lines of the content. */
export function managedBlock(content: string): ManagedBlock {
  const lines = content.split("\n");
  return {
    content,
    end: lines.at(-1) ?? "",
    start: lines[0],
  };
}

function textLines(content: string): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  while (start < content.length) {
    const lf = content.indexOf("\n", start);
    const endWithNewline = lf < 0 ? content.length : lf + 1;
    const rawEnd = lf < 0 ? content.length : lf;
    const end = rawEnd > start && content[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
    lines.push({ start, end, endWithNewline, text: content.slice(start, end) });
    start = endWithNewline;
  }
  return lines;
}

/** Classifies exact standalone marker lines without treating inline examples as ownership. */
export function inspectManagedBlock(content: string, block: ManagedBlock): ManagedBlockInspection {
  const lines = textLines(content);
  const starts = lines.filter((line) => line.text === block.start);
  const ends = lines.filter((line) => line.text === block.end);
  if (starts.length === 0 && ends.length === 0) return { status: "absent" };
  if (starts.length !== 1 || ends.length !== 1 || starts[0].start >= ends[0].start) {
    return { status: "conflict" };
  }
  return {
    status: "valid",
    start: starts[0].start,
    end: ends[0].end,
    endWithNewline: ends[0].endWithNewline,
  };
}

function lineEnding(content: string): "\r\n" | "\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeBlock(content: string, newline: "\r\n" | "\n"): string {
  return content.replace(/\r?\n/g, newline);
}

function appendSeparator(content: string, newline: "\r\n" | "\n"): string {
  return content ? newline : "";
}

function conflict(relativePath: string): Error {
  return new Error(`CCR managed block conflict in ${relativePath}.`);
}

/** Upserts one exact-line block, adding exactly one owned line ending when appending to content. */
export function upsertManagedBlock(
  existing: string | undefined,
  block: ManagedBlock,
  relativePath: string,
): string {
  const current = existing ?? "";
  const inspection = inspectManagedBlock(current, block);
  if (inspection.status === "conflict") throw conflict(relativePath);
  const newline = lineEnding(current);
  const managedContent = normalizeBlock(block.content, newline);
  if (inspection.status === "valid") {
    return `${current.slice(0, inspection.start)}${managedContent}${current.slice(inspection.end)}`;
  }
  return `${current}${appendSeparator(current, newline)}${managedContent}${newline}`;
}

function precedingLineEndingStart(content: string, index: number): number | undefined {
  if (content.slice(index - 2, index) === "\r\n") return index - 2;
  if (content[index - 1] === "\n") return index - 1;
  return undefined;
}

/** Removes one validated marked span and its explicitly owned terminal separator. */
export function removeManagedBlock(
  content: string,
  block: ManagedBlock,
  relativePath = "managed file",
  options: ManagedBlockRemovalOptions = {},
): string {
  const inspection = inspectManagedBlock(content, block);
  if (inspection.status === "conflict") throw conflict(relativePath);
  if (inspection.status === "absent") return content;
  let ownedStart = inspection.start;
  if (inspection.endWithNewline === content.length) {
    const separatorStart = precedingLineEndingStart(content, ownedStart);
    const mode = options.terminalSeparator ?? "preserve";
    if (mode === "owned" && separatorStart !== undefined) ownedStart = separatorStart;
    if (
      mode === "legacy-blank" &&
      separatorStart !== undefined &&
      precedingLineEndingStart(content, separatorStart) !== undefined
    ) {
      ownedStart = separatorStart;
    }
  }
  return `${content.slice(0, ownedStart)}${content.slice(inspection.endWithNewline)}`;
}
