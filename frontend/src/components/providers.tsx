"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AdminKeyProvider } from "@/lib/auth/admin-key";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="agentshield-theme"
    >
      <QueryClientProvider client={queryClient}>
        <AdminKeyProvider>{children}</AdminKeyProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
