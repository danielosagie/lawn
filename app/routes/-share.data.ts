import { useQuery, type ConvexReactClient } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  makeRouteQuerySpec,
  prewarmSpecs,
} from "@/lib/convexRouteData";

export function getShareEssentialSpecs(params: { token: string }) {
  return [
    makeRouteQuerySpec(api.shareLinks.getByToken, {
      token: params.token,
    }),
  ];
}

export function useShareData(params: {
  token: string;
  grantToken?: string | null;
  itemVideoId?: Id<"videos"> | null;
}) {
  const shareInfo = useQuery(api.shareLinks.getByToken, {
    token: params.token,
  });

  // Top-level summary distinguishes single-video shares from bundle
  // (folder/selection) shares. Bundle item playback + comments are scoped
  // to the currently active item.
  const summary = useQuery(
    api.videos.getShareSummaryByGrant,
    params.grantToken ? { grantToken: params.grantToken } : "skip",
  );

  const isBundle = summary?.kind === "bundle";
  const videoArgs = params.grantToken
    ? isBundle
      ? params.itemVideoId
        ? { grantToken: params.grantToken, itemVideoId: params.itemVideoId }
        : null
      : { grantToken: params.grantToken }
    : null;

  const videoData = useQuery(
    api.videos.getByShareGrant,
    videoArgs ?? "skip",
  );

  const commentsArgs = params.grantToken
    ? isBundle
      ? params.itemVideoId
        ? { grantToken: params.grantToken, itemVideoId: params.itemVideoId }
        : null
      : { grantToken: params.grantToken }
    : null;

  const comments = useQuery(
    api.comments.getThreadedForShareGrant,
    commentsArgs ?? "skip",
  );

  return { shareInfo, summary, videoData, comments };
}

export async function prewarmShare(
  convex: ConvexReactClient,
  params: { token: string },
) {
  prewarmSpecs(convex, getShareEssentialSpecs(params));
}
