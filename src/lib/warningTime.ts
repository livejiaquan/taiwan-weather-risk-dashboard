/** Warning timestamps must identify an instant, never the browser's local zone. */
export function warningTimeMs(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return Number.NaN;
  }
  return Date.parse(value);
}

// The same bounded trust window applies to a loaded page and its cache.
export const WARNING_MAX_AGE_MS = 90 * 60 * 1000;
