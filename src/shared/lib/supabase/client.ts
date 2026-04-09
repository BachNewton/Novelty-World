import { createBrowserClient } from "@supabase/ssr";

// Allow tests to inject a mock client. Uses a factory function so the
// override doesn't widen the return type of createClient().
let overrideFactory: (() => ReturnType<typeof realClient>) | null = null;

function realClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/** Override the Supabase client for testing. Pass null to restore the real client. */
export function setClientOverride(client: unknown) {
  overrideFactory = client ? () => client as ReturnType<typeof realClient> : null;
}

export function createClient() {
  return overrideFactory ? overrideFactory() : realClient();
}
