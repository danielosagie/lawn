import { ConvexClient } from "convex/browser";
import { useEffect, useMemo, useState } from "react";

/**
 * Minimal Convex client wrapper for the desktop app. The user pastes their
 * Convex deployment URL + a Clerk session token (from the web app) and we
 * point this client at that deployment with that auth.
 *
 * For v1 the auth token is just a static string the user pastes. Future
 * improvement: deep-link from the web app's "Generate desktop token" page.
 */

export function useConvexClient(url: string, authToken: string) {
  const client = useMemo(() => {
    if (!url) return null;
    try {
      return new ConvexClient(url);
    } catch {
      return null;
    }
  }, [url]);

  useEffect(() => {
    if (!client) return;
    if (authToken) {
      client.setAuth(async () => authToken);
    } else {
      // No token configured yet — leave auth unset; queries will run as
      // anonymous and most will return empty results.
      client.setAuth(async () => null);
    }
    return () => {
      client.close();
    };
  }, [client, authToken]);

  return client;
}

/**
 * Lightweight reactive query — re-runs when args change, refreshes on
 * server updates via Convex subscriptions. Returns `undefined` while
 * loading.
 */
export function useConvexQuery<T>(
  client: ConvexClient | null,
  // Convex function reference as a path string, e.g. "teams:list".
  functionPath: string,
  args: Record<string, unknown> | "skip",
): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);

  useEffect(() => {
    if (!client || args === "skip") {
      setData(undefined);
      return;
    }
    const unsubscribe = client.onUpdate(
      // The TS types for ConvexClient.onUpdate accept FunctionReference, but
      // we pass a string path here for simplicity. Cast through unknown.
      functionPath as unknown as Parameters<typeof client.onUpdate>[0],
      args,
      (next) => setData(next as T),
    );
    return () => unsubscribe();
  }, [client, functionPath, JSON.stringify(args)]);

  return data;
}

export async function callAction<T>(
  client: ConvexClient | null,
  actionPath: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!client) throw new Error("Convex client not initialized");
  return (await client.action(
    actionPath as unknown as Parameters<typeof client.action>[0],
    args,
  )) as T;
}

export async function callMutation<T>(
  client: ConvexClient | null,
  mutationPath: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!client) throw new Error("Convex client not initialized");
  return (await client.mutation(
    mutationPath as unknown as Parameters<typeof client.mutation>[0],
    args,
  )) as T;
}
