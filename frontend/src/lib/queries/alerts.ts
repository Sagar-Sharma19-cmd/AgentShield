"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditApi } from "@/lib/api/endpoints";
import { useAdminKey } from "@/lib/auth/admin-key";
import { retryTransientFailures } from "@/lib/queries/audit";
import { ALERT_DECISIONS, ALERT_FEED_LIMIT, ALERT_PAGE_SIZE, type SecurityAlert, mergeAlertPages, toAlerts } from "@/lib/alerts/model";
import { ALERT_POLL_MS, nextPollDelay } from "@/lib/alerts/tracker";

/** Query keys carry no secrets. The admin key is read from context at fetch time. */
export const alertKeys = {
  all: ["alerts"] as const,
  feed: () => [...alertKeys.all, "feed"] as const,
};

/**
 * One poll: the newest DENY rows and the newest REVIEW rows, from the existing audit list
 * endpoint. Filtering on the server keeps routine ALLOW traffic from pushing alerts off the page.
 */
export async function fetchAlertFeed(adminKey: string): Promise<SecurityAlert[]> {
  const auth = { adminKey };
  const [deny, review] = await Promise.all(
    ALERT_DECISIONS.map((decision) => auditApi.search({ decision, page: 0, size: ALERT_PAGE_SIZE }, auth)),
  );
  return mergeAlertPages([toAlerts(deny?.content), toAlerts(review?.content)], ALERT_FEED_LIMIT);
}

/**
 * The alert feed query. With `poll: true` it also schedules the next poll after each one
 * finishes, so polls can never overlap. Only one component should pass `poll: true`. Other
 * readers share the cache without starting a second timer.
 *
 * Why not `refetchInterval`: React Query's interval cancels an in-flight fetch when the next tick
 * fires (cancelRefetch defaults to true). A slow poll would then be cancelled and restarted
 * forever. Chaining the timer after each settled request avoids that.
 */
export function useSecurityAlertFeed({ poll = false }: { poll?: boolean } = {}) {
  const { adminKey } = useAdminKey();

  const query = useQuery({
    queryKey: alertKeys.feed(),
    queryFn: () => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      return fetchAlertFeed(adminKey);
    },
    enabled: adminKey !== null,
    retry: retryTransientFailures,
    refetchInterval: false,
  });

  const refetchRef = useRef(query.refetch);
  useEffect(() => {
    refetchRef.current = query.refetch;
  }, [query.refetch]);

  const polling = poll && adminKey !== null;

  useEffect(() => {
    if (!polling) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = (delay: number) => {
      timer = setTimeout(() => void tick(), delay);
    };

    const tick = async () => {
      const result = await refetchRef.current({ cancelRefetch: false });
      if (!active) return;
      const delay = nextPollDelay(result.error);
      if (delay !== null) scheduleNext(delay);
    };

    scheduleNext(ALERT_POLL_MS);

    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [polling]);

  return query;
}
