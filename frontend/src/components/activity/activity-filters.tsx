"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActivityFilters } from "@/lib/activity/filters";
import { AUTHORIZATION_LABELS, AUTHORIZATION_RESULTS, DECISION_LABELS, DECISION_TYPES } from "@/lib/labels";
import { toDateTimeLocalValue } from "@/lib/format";
import type { AuthorizationResult, DecisionType } from "@/types/api";

/** Radix Select cannot use an empty string as a value, so "any" is a sentinel. */
const ANY = "ANY";

interface ActivityFiltersProps {
  /** Filters currently applied in the URL. */
  applied: ActivityFilters;
  onApply: (filters: ActivityFilters) => void;
}

interface DraftFilters {
  agentId: string;
  decision: DecisionType | typeof ANY;
  authorizationResult: AuthorizationResult | typeof ANY;
  from: string;
  to: string;
}

function draftFrom(applied: ActivityFilters): DraftFilters {
  return {
    agentId: applied.agentId ?? "",
    decision: applied.decision ?? ANY,
    authorizationResult: applied.authorizationResult ?? ANY,
    from: applied.from ? toDateTimeLocalValue(applied.from) : "",
    to: applied.to ? toDateTimeLocalValue(applied.to) : "",
  };
}

/** datetime-local gives local wall-clock time; the backend expects an ISO-8601 instant. */
function toInstant(localValue: string): string | undefined {
  return localValue ? new Date(localValue).toISOString() : undefined;
}

/**
 * Filters are applied on submit, not on every keystroke, so typing an agent ID does not fire a
 * request per character. Every field maps 1:1 to a parameter of GET /api/v1/audit.
 */
export function ActivityFilters({ applied, onApply }: ActivityFiltersProps) {
  const id = useId();
  const [draft, setDraft] = useState<DraftFilters>(() => draftFrom(applied));
  const [rangeError, setRangeError] = useState<string | null>(null);

  function update<K extends keyof DraftFilters>(key: K, value: DraftFilters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setRangeError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && new Date(draft.from) > new Date(draft.to)) {
      setRangeError("The start of the range must be before the end.");
      return;
    }
    const agentId = draft.agentId.trim();
    onApply({
      agentId: agentId === "" ? undefined : agentId,
      decision: draft.decision === ANY ? undefined : draft.decision,
      authorizationResult: draft.authorizationResult === ANY ? undefined : draft.authorizationResult,
      from: toInstant(draft.from),
      to: toInstant(draft.to),
    });
  }

  function handleReset() {
    setDraft(draftFrom({}));
    setRangeError(null);
    onApply({});
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-label="Filter activity">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-agent`}>Agent ID</Label>
          <Input
            id={`${id}-agent`}
            value={draft.agentId}
            onChange={(event) => update("agentId", event.target.value)}
            placeholder="Exact match"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-decision`}>Decision</Label>
          <Select value={draft.decision} onValueChange={(value) => update("decision", value as DraftFilters["decision"])}>
            <SelectTrigger id={`${id}-decision`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any decision</SelectItem>
              {DECISION_TYPES.map((decision) => (
                <SelectItem key={decision} value={decision}>
                  {DECISION_LABELS[decision]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-authorization`}>Authorization</Label>
          <Select
            value={draft.authorizationResult}
            onValueChange={(value) => update("authorizationResult", value as DraftFilters["authorizationResult"])}
          >
            <SelectTrigger id={`${id}-authorization`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any result</SelectItem>
              {AUTHORIZATION_RESULTS.map((result) => (
                <SelectItem key={result} value={result}>
                  {AUTHORIZATION_LABELS[result]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-from`}>From</Label>
          <Input
            id={`${id}-from`}
            type="datetime-local"
            value={draft.from}
            onChange={(event) => update("from", event.target.value)}
            aria-invalid={rangeError !== null}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-to`}>To</Label>
          <Input
            id={`${id}-to`}
            type="datetime-local"
            value={draft.to}
            onChange={(event) => update("to", event.target.value)}
            aria-invalid={rangeError !== null}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="alert" className="min-h-5 text-sm text-danger-text">
          {rangeError}
        </p>
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
            Reset
          </Button>
          <Button type="submit" size="sm">
            Apply filters
          </Button>
        </div>
      </div>
    </form>
  );
}
