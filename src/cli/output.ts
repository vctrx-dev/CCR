import { z } from "zod";

const ANSI_BOLD_GREEN = "\u001b[1;32m";
const ANSI_RESET = "\u001b[0m";

/** Converts boundary failures into compact messages suitable for a terminal. */
export function formatCliError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length ? issue.path.map(String).join(".") : "value";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
  }
  return error instanceof Error ? error.message : "Unknown CCR error";
}

/** Formats a human-facing success message without adding color to redirected output. */
export function formatSuccess(message: string, isColorEnabled = false): string {
  const line = `✔ ${message}`;
  return isColorEnabled ? `${ANSI_BOLD_GREEN}${line}${ANSI_RESET}` : line;
}
