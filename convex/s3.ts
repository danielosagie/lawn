import { S3Client } from "@aws-sdk/client-s3";
import { env, getRailwayPublicUrl } from "./env";

export const BUCKET_NAME = env.RAILWAY_BUCKET_NAME;

function getBasePublicUrl(): string {
  return getRailwayPublicUrl();
}

export function buildPublicUrl(key: string): string {
  const includeBucket = env.RAILWAY_PUBLIC_URL_INCLUDE_BUCKET !== "false";
  const url = new URL(getBasePublicUrl());
  const basePath = url.pathname.endsWith("/")
    ? url.pathname.slice(0, -1)
    : url.pathname;
  const objectPath = includeBucket ? `${BUCKET_NAME}/${key}` : key;
  url.pathname = `${basePath}/${objectPath}`;
  return url.toString();
}

export function getS3Client(): S3Client {
  return new S3Client({
    region: env.RAILWAY_REGION,
    endpoint: env.RAILWAY_ENDPOINT,
    credentials: {
      accessKeyId: env.RAILWAY_ACCESS_KEY_ID,
      secretAccessKey: env.RAILWAY_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
}
