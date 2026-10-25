export type SyncErrorCode =
  | "CANCELED"
  | "USER_CHANGED"
  | "NOT_READY"
  | "NETWORK"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "UNKNOWN"
  | (string & {});

export type NormalizedSyncError = Error & { code: SyncErrorCode };

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  data?: { code?: unknown };
  shape?: { data?: { code?: unknown } };
  cause?: unknown;
};

function asErrorLike(value: unknown): ErrorLike | null {
  return typeof value === "object" && value !== null
    ? (value as ErrorLike)
    : null;
}

function extractedCode(error: unknown): string | null {
  const value = asErrorLike(error);
  if (!value) return null;
  const candidates = [value.data?.code, value.shape?.data?.code, value.code];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim())
      return candidate
        .trim()
        .replace(/[\s-]+/g, "_")
        .toUpperCase();
  }
  return null;
}

function textOf(error: unknown): string {
  const value = asErrorLike(error);
  if (typeof value?.message === "string") return value.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) || "sync_failed";
  } catch {
    return "sync_failed";
  }
}

function inferCode(error: unknown): SyncErrorCode {
  const explicit = extractedCode(error);
  if (explicit) {
    if (explicit === "ABORT_ERR" || explicit === "ABORTED") return "CANCELED";
    return explicit;
  }

  const value = asErrorLike(error);
  const name = typeof value?.name === "string" ? value.name : "";
  const message = textOf(error).toLowerCase();
  if (
    name === "AbortError" ||
    /(?:^|[_\s-])(abort(?:ed)?|cancel(?:ed|led)?)(?:$|[_\s-])/.test(message)
  )
    return "CANCELED";
  if (/transport[_ -]?lock[_ -]?lost/.test(message))
    return "TRANSPORT_LOCK_LOST";
  if (
    /user[_ -]?changed|account[_ -]?changed|scope[_ -]?changed|owner[_ -]?changed|stale[_ -]?session/.test(
      message
    )
  )
    return "USER_CHANGED";
  if (/not[_ -]?ready|not_authenticated|not[_ -]?available/.test(message))
    return "NOT_READY";
  if (/forbidden|permission|access denied/.test(message)) return "FORBIDDEN";
  if (
    /unauthorized|unauthenticated|login required|session expired/.test(message)
  )
    return "UNAUTHORIZED";
  if (/conflict|version[_ -]?mismatch|stale[_ -]?version/.test(message))
    return "CONFLICT";
  if (/network|fetch|timeout|offline|failed to load/.test(message))
    return "NETWORK";
  return "UNKNOWN";
}

/**
 * Converts any transport or mutation failure to one stable, coordinator-visible
 * error. TRPC's data.code wins over localized messages, and the original error
 * is retained as cause whenever the runtime permits it.
 */
export function normalizeSyncError(error: unknown): NormalizedSyncError {
  const code = inferCode(error);
  const detail = textOf(error).trim() || code;
  const normalized = new Error(`${code}: ${detail}`) as NormalizedSyncError;
  normalized.name = "SyncError";
  normalized.code = code;
  try {
    Object.defineProperty(normalized, "cause", {
      configurable: true,
      enumerable: false,
      value: error,
      writable: false,
    });
  } catch {
    // Error.cause is optional on older runtimes; the normalized message remains stable.
  }
  return normalized;
}

export function syncErrorCode(error: unknown): SyncErrorCode {
  return inferCode(error);
}

export function isNonFailureSyncOutcome(error: unknown): boolean {
  const code = syncErrorCode(error);
  return code === "CANCELED" || code === "USER_CHANGED" || code === "NOT_READY";
}

export function isNetworkSyncError(error: unknown): boolean {
  return syncErrorCode(error) === "NETWORK";
}

export function isAuthorizationSyncError(error: unknown): boolean {
  const code = syncErrorCode(error);
  return code === "FORBIDDEN" || code === "UNAUTHORIZED";
}

export function isReviewSyncError(error: unknown): boolean {
  const code = syncErrorCode(error);
  return code === "CONFLICT" || isAuthorizationSyncError(error);
}
