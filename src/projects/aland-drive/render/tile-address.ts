/*
 * The one place that says where tiles come from. Moving them to another host is
 * copying the files and changing `published` below. A page or tool can be pointed
 * at a local server with `?tiles=local:<port>`, as tests and measuring runs are.
 */

/** Names the built tiles' folder in the bucket: a rebuild goes up beside the old one, so nothing can be served stale. */
const TILES_VERSION = "faa9bf9313af";
const BUCKET = "aland-drive-tiles";

function published(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabase) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return `${supabase}/storage/v1/object/public/${BUCKET}/${TILES_VERSION}`;
}

export function tileBase(search: string): string {
  const override = new URLSearchParams(search).get("tiles");
  if (override === null) return published();
  const port = /^local:(\d+)$/.exec(override)?.[1];
  if (!port) throw new Error(`?tiles= takes local:<port>, not ${override}`);
  return `http://localhost:${port}`;
}
