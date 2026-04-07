"use node";

import Mux from "@mux/mux-node";
import { env, getMuxPrivateKey, getMuxSigningKey } from "./env";

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function getMuxJwtCredentials(): { keyId: string; keySecret: string } {
  return {
    keyId: getMuxSigningKey(),
    keySecret: normalizePrivateKey(getMuxPrivateKey()),
  };
}

let cachedMux: Mux | null = null;

export function getMuxClient(): Mux {
  if (cachedMux) return cachedMux;

  cachedMux = new Mux({
    tokenId: env.MUX_TOKEN_ID,
    tokenSecret: env.MUX_TOKEN_SECRET,
  });

  return cachedMux;
}

export async function createMuxAssetFromInputUrl(videoId: string, inputUrl: string) {
  const mux = getMuxClient();
  return await mux.video.assets.create({
    inputs: [{ url: inputUrl }],
    playback_policies: ["public"],
    video_quality: "basic",
    // Mux currently supports 1080p as the lowest adaptive streaming max tier.
    max_resolution_tier: "1080p",
    mp4_support: "none",
    passthrough: videoId,
  });
}

export async function getMuxAsset(assetId: string) {
  const mux = getMuxClient();
  return await mux.video.assets.retrieve(assetId);
}

export async function deleteMuxAsset(assetId: string) {
  const mux = getMuxClient();
  await mux.video.assets.delete(assetId);
}

export async function createSignedPlaybackId(assetId: string) {
  const mux = getMuxClient();
  return await mux.video.assets.createPlaybackId(assetId, {
    policy: "signed",
  });
}

export async function createPublicPlaybackId(assetId: string) {
  const mux = getMuxClient();
  return await mux.video.assets.createPlaybackId(assetId, {
    policy: "public",
  });
}

export async function deletePlaybackId(assetId: string, playbackId: string) {
  const mux = getMuxClient();
  await mux.video.assets.deletePlaybackId(assetId, playbackId);
}

export function buildMuxPlaybackUrl(playbackId: string, token?: string): string {
  const url = new URL(`https://stream.mux.com/${playbackId}.m3u8`);
  // Force a single 720p delivery profile in the playback manifest.
  url.searchParams.set("min_resolution", "720p");
  url.searchParams.set("max_resolution", "720p");
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

export function buildMuxThumbnailUrl(playbackId: string, token?: string): string {
  const base = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`;
  if (!token) return base;
  return `${base}&token=${encodeURIComponent(token)}`;
}

export async function signPlaybackToken(playbackId: string, expiration = "1h") {
  const mux = getMuxClient();
  const credentials = getMuxJwtCredentials();
  return await mux.jwt.signPlaybackId(playbackId, {
    keyId: credentials.keyId,
    keySecret: credentials.keySecret,
    type: "video",
    expiration,
  });
}

export async function signThumbnailToken(playbackId: string, expiration = "1h") {
  const mux = getMuxClient();
  const credentials = getMuxJwtCredentials();
  return await mux.jwt.signPlaybackId(playbackId, {
    keyId: credentials.keyId,
    keySecret: credentials.keySecret,
    type: "thumbnail",
    expiration,
  });
}

export function verifyMuxWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) {
    throw new Error("Missing mux-signature header");
  }

  const mux = getMuxClient();
  mux.webhooks.verifySignature(rawBody, {
    "mux-signature": signature,
  }, env.MUX_WEBHOOK_SECRET);
}
