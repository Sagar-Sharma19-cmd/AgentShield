import { DecisionIcon } from "@/components/checkpoint/decision-mark";
import {
  FINDING_CATEGORY_DECISION,
  FINDING_CATEGORY_LABELS,
  FINDINGS_EMPTY_COPY,
  FINDINGS_NOT_RECORDED_COPY,
  findingsState,
  findingTypeLabel,
  type InspectedSubject,
} from "@/lib/inspection/findings";
import type { ContentFinding } from "@/types/api";

/**
 * Redacted content findings (V13): category, type, location and preview, as recorded by the gateway. The raw value
 * is never stored, so it cannot be shown. A secret carries the DENY mark and the others the REVIEW mark, always
 * next to the category name, so colour never carries the meaning alone.
 */
export function ContentFindings({
  findings,
  subject = "arguments",
}: {
  findings: ContentFinding[] | null | undefined;
  subject?: InspectedSubject;
}) {
  const state = findingsState(findings);
  if (state.kind === "not-recorded") {
    return <p className="text-sm text-muted-foreground">{FINDINGS_NOT_RECORDED_COPY}</p>;
  }
  if (state.kind === "clean") {
    return <p className="text-sm text-muted-foreground">{FINDINGS_EMPTY_COPY[subject]}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2" aria-label="Content findings">
        {state.findings.map((finding, index) => (
          <li key={`${finding.location}-${finding.type}-${index}`} className="rounded-md border border-border px-3 py-2">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
              <DecisionIcon decision={FINDING_CATEGORY_DECISION[finding.category]} />
              <span className="font-medium">{FINDING_CATEGORY_LABELS[finding.category]}</span>
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
              <span>{findingTypeLabel(finding.type)}</span>
            </p>
            <dl className="mt-1.5 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Location</dt>
              <dd className="min-w-0 font-mono break-all">{finding.location}</dd>
              <dt className="text-muted-foreground">Preview</dt>
              <dd className="min-w-0 font-mono break-all">{finding.preview}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Previews are redacted by the gateway. The raw values are never stored, so they cannot be shown here.
      </p>
    </div>
  );
}
