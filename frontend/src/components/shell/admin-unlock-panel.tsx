"use client";

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import { auditApi } from "@/lib/api/endpoints";
import { useAdminKey } from "@/lib/auth/admin-key";
import { auditKeys } from "@/lib/queries/audit";

/**
 * Admin key entry. The key is checked against the backend (a one-row audit read) before it is
 * stored, so a mistyped key is reported here rather than as failures on every page.
 */
export function AdminUnlockPanel() {
  const inputId = useId();
  const errorId = useId();
  const { setAdminKey } = useAdminKey();
  const queryClient = useQueryClient();
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
      queryClient.removeQueries({ queryKey: auditKeys.all });
      setAdminKey(candidate);
      setValue("");
    } catch (err) {
      setError(describeUnlockError(err));
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <KeyRound aria-hidden="true" className="size-4" />
          </div>
          {/* Rendered as the page's top-level heading. Classes match CardTitle with text-lg, so the look is unchanged. */}
          <h1 className="font-heading text-lg leading-snug font-medium">Unlock the console</h1>
          <CardDescription>
            Enter the admin API key to view runtime activity. Development access: the key is kept
            in this browser tab only and is cleared when the tab closes.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                className="font-mono"
              />
              {error && (
                <p id={errorId} role="alert" className="text-sm text-danger-text">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" disabled={isChecking} className="w-full">
              {isChecking && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
              {isChecking ? "Checking key" : "Unlock"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function describeUnlockError(err: unknown): string {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return "AgentShield rejected this admin key.";
  }
  if (err instanceof ApiError) {
    return err.message;
  }
  return "Could not reach the AgentShield backend. Check that it is running and that BACKEND_URL points to it.";
}
