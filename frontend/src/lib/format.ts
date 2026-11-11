import { format, isValid, parseISO } from "date-fns";

/** Local-time display for an ISO-8601 instant from the backend. Falls back to the raw value. */
export function formatTimestamp(iso: string): string {
  const date = parseISO(iso);
  return isValid(date) ? format(date, "MMM d, yyyy HH:mm:ss") : iso;
}

/** Converts an ISO-8601 instant into the `yyyy-MM-ddTHH:mm` value a datetime-local input expects. */
export function toDateTimeLocalValue(iso: string): string {
  const date = parseISO(iso);
  return isValid(date) ? format(date, "yyyy-MM-dd'T'HH:mm") : "";
}

/** Short prefix of an identifier for dense tables. The full value is always shown in detail. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Local date only, for dense lists. The full timestamp belongs in a title or the detail view. */
export function formatDate(iso: string): string {
  const date = parseISO(iso);
  return isValid(date) ? format(date, "MMM d, yyyy") : iso;
}
