export function getConvexDeploymentName(
  raw = import.meta.env.VITE_CONVEX_URL as string | undefined,
): string | null {
  if (!raw || typeof raw !== "string") return null;

  const trimmed = raw.trim();
  const withoutAtPrefix = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  let parsed: URL;
  try {
    const urlString = withoutAtPrefix.includes("://")
      ? withoutAtPrefix
      : `https://${withoutAtPrefix}`;
    parsed = new URL(urlString);
  } catch {
    return null;
  }

  const hostname = parsed.hostname; // e.g. blessed-meadowlark-989.convex.cloud
  const match = hostname.match(/^([a-z0-9-]+)\.convex\.cloud$/i);
  if (!match) return null;

  return match[1];
}

