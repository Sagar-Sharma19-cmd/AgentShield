import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "AgentShield · Runtime security for AI agents",
  description: "Every tool call your AI agent makes passes a checkpoint first: identity, permission, policy, risk, trajectory and human review.",
};

/**
 * Public landing page. It sits outside the (console) route group, so it has no AppShell and no admin-key
 * gate. The 3D scene inside is loaded on the client only (see components/landing/landing-page.tsx).
 */
export default function WelcomePage() {
  return <LandingPage />;
}
