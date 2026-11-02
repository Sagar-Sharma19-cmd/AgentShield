import { AgentsWorkspace } from "@/components/agents/agents-workspace";
import { parseAgentParams } from "@/lib/agents/model";

/**
 * Parses the status filter and selected agent from the URL on the server. Data is fetched on the
 * client because the admin key lives in the browser session.
 */
export default async function AgentsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseAgentParams(await searchParamsPromise);
  return <AgentsWorkspace state={state} />;
}
