"use client";

import { useEffect, useState } from "react";
import { CATALOG_PATH, parseCatalog, storageUrl } from "./logic";
import type { Catalog } from "./types";

/** The public URL of a file in the audiobooks bucket, in the browser. */
export function fileUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return storageUrl(supabaseUrl, path);
}

export type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: Catalog }
  | { status: "error"; message: string };

async function loadCatalog(): Promise<Catalog> {
  // "no-cache" revalidates, so a book just uploaded shows without waiting out the browser's cache.
  const response = await fetch(fileUrl(CATALOG_PATH), { cache: "no-cache" });
  if (!response.ok) throw new Error(`The catalog didn't load (HTTP ${String(response.status)})`);
  return parseCatalog(await response.json());
}

export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    loadCatalog().then(
      (catalog) => {
        if (live) setState({ status: "ready", catalog });
      },
      (error: unknown) => {
        console.error(error);
        if (live) setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
