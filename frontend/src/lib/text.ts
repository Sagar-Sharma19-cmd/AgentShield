/**
 * Line-break help for long identifiers (paths, image names, hosts). Pure; tested in text.test.ts.
 *
 * Splits a resource after every "/" and "-", and after a "." that follows a name character (so a leading dot,
 * as in ".env", stays with its name). The caller puts a <wbr> between the parts: the browser then wraps only at
 * those characters, and overflow-wrap:anywhere stays a last resort for a part that is still too long. Joining
 * the parts gives back the input exactly. Used by the landing scenarios and the CI/CD step cards.
 */
export function breakableParts(resource: string): string[] {
  const parts = resource.split(/(?<=[/-]|[^/.-]\.)/);
  return parts.filter((part) => part !== "");
}
