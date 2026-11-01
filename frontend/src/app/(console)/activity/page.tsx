import { ActivityExplorer } from "@/components/activity/activity-explorer";
import { parseActivityParams } from "@/lib/activity/filters";

/**
 * Parses the URL on the server and hands the typed state to the client explorer. Data is fetched
 * on the client because the admin key lives in the browser session, not on the server.
 */
export default async function ActivityPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await searchParamsPromise;
  return <ActivityExplorer state={parseActivityParams(searchParams)} />;
}
