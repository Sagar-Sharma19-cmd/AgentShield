import { ReviewsWorkspace } from "@/components/reviews/reviews-workspace";
import { parseWorkspaceParams } from "@/lib/reviews/tabs";

/**
 * Parses the tab and selected review from the URL on the server (`?tab=`, or a legacy `?status=` link
 * from the Overview triage). Data is fetched on the client because the admin key lives in the browser
 * session.
 */
export default async function ReviewsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseWorkspaceParams(await searchParamsPromise);
  return <ReviewsWorkspace state={state} />;
}
