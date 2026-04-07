import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const requiredString = z.string().min(1);

const server = {
  CLERK_JWT_ISSUER_DOMAIN: requiredString,
  MUX_TOKEN_ID: requiredString,
  MUX_TOKEN_SECRET: requiredString,
  MUX_WEBHOOK_SECRET: requiredString,
  MUX_SIGNING_KEY: requiredString.optional(),
  MUX_PRIVATE_KEY: requiredString.optional(),
  MUX_SIGNING_KEY_ID: requiredString.optional(),
  MUX_SIGNING_PRIVATE_KEY: requiredString.optional(),
  RAILWAY_ACCESS_KEY_ID: requiredString,
  RAILWAY_SECRET_ACCESS_KEY: requiredString,
  RAILWAY_ENDPOINT: requiredString.url(),
  RAILWAY_PUBLIC_URL: requiredString.url().optional(),
  RAILWAY_PUBLIC_URL_INCLUDE_BUCKET: z.enum(["true", "false"]).default("true"),
  RAILWAY_BUCKET_NAME: requiredString.default("videos"),
  RAILWAY_REGION: requiredString.default("us-east-1"),
  STRIPE_PRICE_BASIC_MONTHLY: requiredString,
  STRIPE_PRICE_PRO_MONTHLY: requiredString,
};

function requireEnvValue(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireFirstEnvValue(
  primaryName: string,
  primaryValue: string | undefined,
  legacyName: string,
  legacyValue: string | undefined,
) {
  if (primaryValue) return primaryValue;
  if (legacyValue) return legacyValue;
  throw new Error(
    `Missing required environment variable: ${primaryName} (or legacy ${legacyName})`,
  );
}

export const env = createEnv<undefined, typeof server>({
  server,
  runtimeEnvStrict: {
    CLERK_JWT_ISSUER_DOMAIN: process.env.CLERK_JWT_ISSUER_DOMAIN,
    MUX_TOKEN_ID: process.env.MUX_TOKEN_ID,
    MUX_TOKEN_SECRET: process.env.MUX_TOKEN_SECRET,
    MUX_WEBHOOK_SECRET: process.env.MUX_WEBHOOK_SECRET,
    MUX_SIGNING_KEY: process.env.MUX_SIGNING_KEY,
    MUX_PRIVATE_KEY: process.env.MUX_PRIVATE_KEY,
    MUX_SIGNING_KEY_ID: process.env.MUX_SIGNING_KEY_ID,
    MUX_SIGNING_PRIVATE_KEY: process.env.MUX_SIGNING_PRIVATE_KEY,
    RAILWAY_ACCESS_KEY_ID: process.env.RAILWAY_ACCESS_KEY_ID,
    RAILWAY_SECRET_ACCESS_KEY: process.env.RAILWAY_SECRET_ACCESS_KEY,
    RAILWAY_ENDPOINT: process.env.RAILWAY_ENDPOINT,
    RAILWAY_PUBLIC_URL: process.env.RAILWAY_PUBLIC_URL,
    RAILWAY_PUBLIC_URL_INCLUDE_BUCKET:
      process.env.RAILWAY_PUBLIC_URL_INCLUDE_BUCKET,
    RAILWAY_BUCKET_NAME: process.env.RAILWAY_BUCKET_NAME,
    RAILWAY_REGION: process.env.RAILWAY_REGION,
    STRIPE_PRICE_BASIC_MONTHLY: process.env.STRIPE_PRICE_BASIC_MONTHLY,
    STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
  },
  emptyStringAsUndefined: true,
});

export function getMuxSigningKey() {
  return requireFirstEnvValue(
    "MUX_SIGNING_KEY",
    env.MUX_SIGNING_KEY,
    "MUX_SIGNING_KEY_ID",
    env.MUX_SIGNING_KEY_ID,
  );
}

export function getMuxPrivateKey() {
  return requireFirstEnvValue(
    "MUX_PRIVATE_KEY",
    env.MUX_PRIVATE_KEY,
    "MUX_SIGNING_PRIVATE_KEY",
    env.MUX_SIGNING_PRIVATE_KEY,
  );
}

export function getRailwayPublicUrl() {
  return env.RAILWAY_PUBLIC_URL ?? env.RAILWAY_ENDPOINT;
}

export function getStripePriceIdForEnvVar(
  variableName: "STRIPE_PRICE_BASIC_MONTHLY" | "STRIPE_PRICE_PRO_MONTHLY",
) {
  return requireEnvValue(variableName, env[variableName]);
}
