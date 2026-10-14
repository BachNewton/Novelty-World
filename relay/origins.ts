const VERCEL = ".vercel.app";

/** The site, its Vercel previews, and dev servers on this computer or its home network. */
export function allowOrigin(origin: string | undefined): boolean {
  if (origin === undefined || !URL.canParse(origin)) return false;
  const url = new URL(origin);
  if (url.origin !== origin) return false;
  const host = url.hostname;
  if (url.protocol === "https:") {
    if (!host.endsWith(VERCEL)) return false;
    const project = host.slice(0, -VERCEL.length);
    return project === "novelty-world" || (project.startsWith("novelty-world-") && !project.includes("."));
  }
  return url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168."));
}
