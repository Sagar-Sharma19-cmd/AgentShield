"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminKeyProvider } from "@/lib/auth/admin-key";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AdminKeyProvider>{children}</AdminKeyProvider>
    </QueryClientProvider>
  );
}
