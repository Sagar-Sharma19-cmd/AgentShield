"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { auditApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { useAdminKey } from "@/lib/auth/admin-key";
import type { AuditSearchParams } from "@/types/api";

/** Query keys carry no secrets. The admin key is read from context at fetch time. */
export const auditKeys = {
  all: ["audit"] as const,
  list: (params: AuditSearchParams) => [...auditKeys.all, "list", params] as const,
  detail: (requestId: string) => [...auditKeys.all, "detail", requestId] as const,
};

/** Auth failures are not retried (they will not succeed on retry). Network and 5xx errors are. */
function retryTransientFailures(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 2;
}

export function useAuditList(params: AuditSearchParams) {
  const { adminKey } = useAdminKey();

  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      return auditApi.search(params, { adminKey });
    },
    enabled: adminKey !== null,
    placeholderData: keepPreviousData,
    retry: retryTransientFailures,
  });
}

export function useAuditEvent(requestId: string | undefined) {
  const { adminKey } = useAdminKey();

  return useQuery({
    queryKey: auditKeys.detail(requestId ?? ""),
    queryFn: () => {
      if (adminKey === null || requestId === undefined) throw new Error("No event selected.");
      return auditApi.getByRequestId(requestId, { adminKey });
    },
    enabled: adminKey !== null && requestId !== undefined,
    retry: retryTransientFailures,
  });
}
