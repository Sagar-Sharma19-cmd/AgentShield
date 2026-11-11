"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Clock, KeyRound, LoaderCircle, ServerCog, ShieldCheck } from "lucide-react";
import { SlideUp } from "@/components/motion/slide-up";
import { LogoTile } from "@/components/shell/logo-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import { auditApi } from "@/lib/api/endpoints";
import { useAdminKey } from "@/lib/auth/admin-key";

/**
 * Admin key entry. The key is checked against the backend (a one-row audit read) before it is
 * stored, so a mistyped key is reported here rather than as failures on every page.
 */
export function AdminUnlockPanel() {
  const inputId = useId();
  const errorId = useId();
  const { setAdminKey } = useAdminKey();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = value.trim();
    if (candidate.length === 0) {
      setError("Enter the admin API key.");
      return;
    }

    setIsChecking(true);
    setError(null);
    try {
      await auditApi.search({ size: 1 }, { adminKey: candidate });
      setAdminKey(candidate);
      setValue("");
    } catch (err) {
      setError(describeUnlockError(err));
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4 py-10">
      {/* SlideUp transforms only this wrapper, which holds no sticky or fixed content. */}
      <SlideUp className="w-full max-w-md">
        <Card className="gap-5 py-6 shadow-sm">
          <CardHeader className="gap-3 px-6">
            <div className="flex items-center gap-3">
              <LogoTile size="lg" />
              <div className="leading-tight">
                <p className="font-heading text-sm font-semibold tracking-tight">AgentShield</p>
                <p className="text-xs text-muted-foreground">Runtime security gateway</p>
              </div>
            </div>
            {/* The page's top-level heading. */}
            <h1 className="font-heading text-xl leading-snug font-semibold tracking-tight">Unlock the console</h1>
            <CardDescription>
              The console reads gateway decisions, audit records, reviews and agent registrations. Those are
              admin endpoints, so AgentShield needs the admin API key before it shows anything.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor={inputId}>Admin API key</Label>
                <Input
                  id={inputId}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  aria-invalid={error !== null}
                  aria-describedby={error ? errorId : undefined}
                  disabled={isChecking}
                  className="h-9 font-mono"
                />
                {error && (
                  <p id={errorId} role="alert" className="text-sm text-danger-text">
                    {error}
                  </p>
                )}
              </div>
              <Button type="submit" size="lg" disabled={isChecking} className="w-full">
                {isChecking ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <KeyRound aria-hidden="true" />
                )}
                {isChecking ? "Checking key" : "Unlock"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex-col items-start gap-3 border-t px-6 py-4">
            <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
              <KeyFact icon={ServerCog}>Checked against the backend with one audit read before it is used.</KeyFact>
              <KeyFact icon={Clock}>Kept in this browser tab only and cleared when the tab closes.</KeyFact>
              <KeyFact icon={ShieldCheck}>Development access: every request is still authorised by the backend.</KeyFact>
            </ul>
            <Link
              href="/welcome"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
            >
              New here? See how AgentShield works
            </Link>
          </CardFooter>
        </Card>
      </SlideUp>
    </div>
  );
}

function KeyFact({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function describeUnlockError(err: unknown): string {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return "AgentShield rejected this admin key.";
  }
  if (err instanceof ApiError) {
    return err.message;
  }
  return "Could not reach AgentShield. Check that the service is running, then try again.";
}
