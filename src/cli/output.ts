import { z } from "zod";

const ANSI_BOLD_GREEN = "\u001b[1;32m";
const ANSI_BOLD_CYAN = "\u001b[1;36m";
const ANSI_BOLD_YELLOW = "\u001b[1;33m";
const ANSI_BOLD_RED = "\u001b[1;31m";
const ANSI_DIM = "\u001b[2m";
const ANSI_RESET = "\u001b[0m";

type OutputTone = "success" | "info" | "warning" | "error" | "muted";

function toneCode(tone: OutputTone): string {
  switch (tone) {
    case "success":
      return ANSI_BOLD_GREEN;
    case "info":
      return ANSI_BOLD_CYAN;
    case "warning":
      return ANSI_BOLD_YELLOW;
    case "error":
      return ANSI_BOLD_RED;
    case "muted":
      return ANSI_DIM;
    default: {
      const exhaustiveTone: never = tone;
      return exhaustiveTone;
    }
  }
}

/** Styles a terminal fragment while leaving redirected output plain and searchable. */
export function formatTone(text: string, tone: OutputTone, isColorEnabled = false): string {
  return isColorEnabled ? `${toneCode(tone)}${text}${ANSI_RESET}` : text;
}

/** Formats a compact section heading for command output. */
export function formatHeading(title: string, isColorEnabled = false): string {
  return formatTone(`━━ ${title} ━━`, "info", isColorEnabled);
}

/** Formats the action column used by setup and uninstall previews. */
export function formatAction(action: string, isColorEnabled = false): string {
  const normalizedAction = action.trim();
  const tone: OutputTone =
    normalizedAction === "create" || normalizedAction === "created"
      ? "success"
      : normalizedAction === "modify" || normalizedAction === "updated"
        ? "warning"
        : normalizedAction === "remove" || normalizedAction === "removed"
          ? "error"
          : "muted";
  return formatTone(action, tone, isColorEnabled);
}

/** Formats known status words consistently across context and hook commands. */
export function formatStatus(status: string, isColorEnabled = false): string {
  const tone: OutputTone =
    status === "current" ||
    status === "valid" ||
    status === "enabled" ||
    status === "created" ||
    status === "yes"
      ? "success"
      : status === "stale" || status === "preserve" || status === "shareable"
        ? "warning"
        : status === "malformed" ||
            status === "unsafe" ||
            status === "unavailable" ||
            status === "invalid"
          ? "error"
          : status === "not-installed" ||
              status === "disabled" ||
              status === "local" ||
              status === "no"
            ? "muted"
            : "info";
  return formatTone(status, tone, isColorEnabled);
}

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
