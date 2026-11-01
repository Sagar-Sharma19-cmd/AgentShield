import { z } from "zod";
import type { AuditSearchParams } from "@/types/api";
import { AUTHORIZATION_RESULTS, DECISION_TYPES } from "@/lib/labels";

/** Rows per page. Must stay within the backend's AuditController limits (1..100). */
export const ACTIVITY_PAGE_SIZE = 20;

/** Unparseable or out-of-range URL values are dropped rather than sent to the backend. */
const isoInstant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Must be an ISO-8601 instant");

const activityUrlStateSchema = z.object({
  agentId: z.string().trim().min(1).max(200).optional().catch(undefined),
  decision: z.enum(DECISION_TYPES).optional().catch(undefined),
  authorizationResult: z.enum(AUTHORIZATION_RESULTS).optional().catch(undefined),
  from: isoInstant.optional().catch(undefined),
  to: isoInstant.optional().catch(undefined),
  page: z.coerce.number().int().min(0).optional().catch(undefined),
  request: z.uuid().optional().catch(undefined),
});

/** Everything the Activity page keeps in its URL. Filters and paging are shareable links. */
export type ActivityUrlState = z.infer<typeof activityUrlStateSchema>;

/** Filter fields only (no paging, no selection). */
export type ActivityFilters = Pick<
  ActivityUrlState,
  "agentId" | "decision" | "authorizationResult" | "from" | "to"
>;

type RawSearchParams = Record<string, string | string[] | undefined>;

/** Next.js passes repeated params as arrays; the Activity page only reads the first value. */
export function parseActivityParams(raw: RawSearchParams): ActivityUrlState {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  const parsed = activityUrlStateSchema.safeParse(flat);
  return parsed.success ? parsed.data : {};
}

export function hasActiveFilters(filters: ActivityFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

export function toAuditSearchParams(state: ActivityUrlState): AuditSearchParams {
  return {
    agentId: state.agentId,
    decision: state.decision,
    authorizationResult: state.authorizationResult,
    from: state.from,
    to: state.to,
    page: state.page ?? 0,
    size: ACTIVITY_PAGE_SIZE,
  };
}

/** Builds the /activity href for a state. Empty and default values are left out of the URL. */
export function buildActivityHref(state: ActivityUrlState): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value === undefined || value === "" || (key === "page" && value === 0)) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/activity?${query}` : "/activity";
}
