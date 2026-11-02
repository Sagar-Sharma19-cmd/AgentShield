"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Which alerts the operator has not yet acknowledged in this console session. Mounted inside the
 * admin-gated shell, so it resets on lock. Holds requestIds only, never event contents.
 */
interface SecurityAlertsState {
  readonly unreadIds: ReadonlySet<string>;
  markUnread: (requestIds: readonly string[]) => void;
  markAllRead: () => void;
}

const NO_OP_STATE: SecurityAlertsState = {
  unreadIds: new Set(),
  markUnread: () => undefined,
  markAllRead: () => undefined,
};

const SecurityAlertsContext = createContext<SecurityAlertsState>(NO_OP_STATE);

export function SecurityAlertsProvider({ children }: { children: React.ReactNode }) {
  const [unreadIds, setUnreadIds] = useState<ReadonlySet<string>>(() => new Set());

  const markUnread = useCallback((requestIds: readonly string[]) => {
    setUnreadIds((previous) => {
      const next = new Set(previous);
      for (const requestId of requestIds) next.add(requestId);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => setUnreadIds(new Set()), []);

  const value = useMemo(() => ({ unreadIds, markUnread, markAllRead }), [unreadIds, markUnread, markAllRead]);

  return <SecurityAlertsContext.Provider value={value}>{children}</SecurityAlertsContext.Provider>;
}

export function useSecurityAlerts(): SecurityAlertsState {
  return useContext(SecurityAlertsContext);
}
