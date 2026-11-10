"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { AdminKeyProvider } from "@/lib/auth/admin-key";
import { durations, easings } from "@/lib/motion/tokens";

/**
 * Default transition for motion/react elements that do not set their own (src/lib/motion/tokens.ts).
 * The MotionConfig below also sets reducedMotion="user": when the OS asks for reduced motion,
 * motion/react skips transform and layout animation and keeps opacity and colour. The CSS guard in
 * globals.css covers Tailwind animations.
 */
const DEFAULT_TRANSITION = { duration: durations.base, ease: easings.standard } as const;

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
      <MotionConfig reducedMotion="user" transition={DEFAULT_TRANSITION}>
        <QueryClientProvider client={queryClient}>
          <AdminKeyProvider>{children}</AdminKeyProvider>
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
