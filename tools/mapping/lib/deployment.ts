// Which Convex deployment the tool is about to change, and whether it may.
// Production runs the nightly show: a session there switches the real lights
// into mapping mode, so the tool only changes a cloud deployment when told to
// with --prod, and never with a fake camera.

const localHosts = new Set([
  "127.0.0.1",
  "localhost",
  "[::1]",
  "::1",
  "0.0.0.0",
]);

export const isLocalUrl = (url: string) => {
  try {
    return localHosts.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

/**
 * Throws unless this command may change sessions on `url`. Returns the line
 * that says which deployment it is, for the command to print first.
 */
export const checkWrites = (
  url: string,
  opts: { prod?: boolean; fake?: string },
): string => {
  const local = isLocalUrl(url);
  if (!local && opts.fake)
    throw new Error(
      `The ${opts.fake} only runs against a local backend, not ${url}: it would put the real lights into mapping mode.`,
    );
  if (!local && !opts.prod)
    throw new Error(
      `${url} is a cloud deployment, and this changes its mapping session (the real lights switch to mapping mode). Pass --prod if that's what you mean.`,
    );
  return `Convex: ${url} (${local ? "local" : "CLOUD: the real lights"})`;
};
