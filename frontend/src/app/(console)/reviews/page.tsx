import { ReviewsWorkspace } from "@/components/reviews/reviews-workspace";
import { parseReviewParams } from "@/lib/reviews/model";

/**
 * Parses the status filter and selected review from the URL on the server. Data is fetched on the
 * client because the admin key lives in the browser session.
 */
export default async function ReviewsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseReviewParams(await searchParamsPromise);
  return <ReviewsWorkspace state={state} />;
}
