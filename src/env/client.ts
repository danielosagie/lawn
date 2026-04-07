import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const requiredString = z.string().min(1);

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CONVEX_URL: requiredString.url(),
    VITE_CONVEX_SITE_URL: requiredString.url().optional(),
    VITE_CLERK_PUBLISHABLE_KEY: requiredString,
  },
  runtimeEnvStrict: {
    VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
    VITE_CONVEX_SITE_URL: import.meta.env.VITE_CONVEX_SITE_URL,
    VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  },
  emptyStringAsUndefined: true,
});
