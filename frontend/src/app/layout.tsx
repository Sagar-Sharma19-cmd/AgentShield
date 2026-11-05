import type { Metadata } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

/*
 * Fonts are self-hosted (src/app/fonts, SIL Open Font License, latin subset, variable weight),
 * so `next build` needs no network access. next/font/google downloads them at build time and
 * fails offline, for example in a demo room without internet.
 */

/** Headings. Used through the font-heading utility (globals.css maps it to --font-space-grotesk). */
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin-wght-normal.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});

/** Body text. Used through font-sans. */
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

/** Technical text: identifiers, keys, JSON and request IDs. Used through font-mono. */
const jetBrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgentShield",
  description: "Runtime security gateway for AI agents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html> before hydration.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          <TooltipProvider delayDuration={150}>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
