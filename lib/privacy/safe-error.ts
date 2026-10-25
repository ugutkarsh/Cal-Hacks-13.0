/**
 * Map internal/DB errors to generic client messages — never echo schema text.
 */

export function publicApiError(
  fallback: string,
  err?: { message?: string } | null,
): string {
  const msg = err?.message ?? "";
  if (/duplicate key|unique constraint/i.test(msg)) {
    return "That action was already recorded";
  }
  if (/foreign key|violates foreign/i.test(msg)) {
    return "Related record is unavailable";
  }
  if (/row-level security|permission denied|policy/i.test(msg)) {
    return "Not allowed";
  }
  if (/not authenticated|JWT/i.test(msg)) {
    return "Sign in required";
  }
  // Never return raw Postgres / PostgREST messages to the client.
  void msg;
  return fallback;
}
