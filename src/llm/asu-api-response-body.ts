/**
 * Bounded ASU AIML response-body reads. The transport layer owns retry policy; this module only
 * enforces byte ceilings and never exposes upstream response text in an error diagnostic. Any ASU
 * transport must reuse these readers instead of calling `Response.text()` on untrusted content.
 */

const MAX_ERROR_RESPONSE_BYTES = 4_096;
const MAX_SUCCESS_RESPONSE_BYTES = 1_048_576;
const RESPONSE_BODY_LIMIT_ERROR = `ASU AIML response body exceeds the ${MAX_SUCCESS_RESPONSE_BYTES}-byte limit.`;

interface BoundedResponseBody {
  content: string;
  isTruncated: boolean;
}

/** Identifies a successful provider response that exceeded the safe body-size boundary. */
export class AsuAimlResponseBodyLimitError extends Error {
  constructor() {
    super(RESPONSE_BODY_LIMIT_ERROR);
  }
}

/** Reads an external response stream under a byte ceiling without calling `Response.text()`. */
async function readBoundedResponseBody(
  response: Response,
  maximumBytes: number,
): Promise<BoundedResponseBody> {
  const reader = response.body?.getReader();
  if (!reader) return { content: "", isTruncated: false };

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let isTruncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const remainingBytes = maximumBytes - byteLength;
      if (value.byteLength > remainingBytes) {
        if (remainingBytes > 0) {
          chunks.push(value.slice(0, remainingBytes));
          byteLength += remainingBytes;
        }
        isTruncated = true;
        break;
      }

      chunks.push(value);
      byteLength += value.byteLength;
    }

    if (isTruncated) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the original HTTP failure if stream cancellation itself fails.
      }
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { content: new TextDecoder().decode(bytes), isTruncated };
}

/** Reads only the bounded error-response prefix needed for retry classification. */
export async function readAsuAimlErrorResponseBody(response: Response): Promise<string> {
  const { content } = await readBoundedResponseBody(response, MAX_ERROR_RESPONSE_BYTES);
  return content;
}

function hasOversizedDeclaredResponseBody(response: Response): boolean {
  const contentLength = response.headers.get("Content-Length")?.trim();
  if (!contentLength || !/^\d+$/.test(contentLength)) return false;
  const byteLength = Number(contentLength);
  return !Number.isSafeInteger(byteLength) || byteLength > MAX_SUCCESS_RESPONSE_BYTES;
}

/** Reads a complete successful response body or fails before retaining content over the byte ceiling. */
export async function readAsuAimlSuccessfulResponseBody(response: Response): Promise<string> {
  if (hasOversizedDeclaredResponseBody(response)) {
    try {
      await response.body?.cancel();
    } catch {
      // A failed cancellation must not replace the deterministic size-boundary diagnostic.
    }
    throw new AsuAimlResponseBodyLimitError();
  }

  const boundedBody = await readBoundedResponseBody(response, MAX_SUCCESS_RESPONSE_BYTES);
  if (boundedBody.isTruncated) throw new AsuAimlResponseBodyLimitError();
  return boundedBody.content;
}
