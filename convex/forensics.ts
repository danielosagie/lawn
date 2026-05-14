import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireProjectAccess, requireVideoAccess } from "./auth";

/**
 * Leak-attribution surface. Given a hint observed in a leaked screenshot or
 * recording (the burned-in label, a fragment of the share token, or a
 * client email), return the set of grants + their forensic capture that
 * could have produced the leak. Read-only and access-checked — only
 * members of the originating team can run lookups.
 *
 * The burned-in watermark contains the share link's clientEmail (preferred)
 * or clientLabel (fallback). When that label uniquely identifies a single
 * link, the grant set under that link is the candidate pool for the leak.
 * Multiple grants under the same link = multiple viewers; the viewerEmail /
 * viewerClerkId / viewerIpHash captured at grant issuance is what
 * differentiates them.
 */

type MatchedGrant = {
  _id: Id<"shareAccessGrants">;
  _creationTime: number;
  createdAt: number;
  expiresAt: number;
  paidAt: number | null;
  viewerClerkId: string | null;
  viewerEmail: string | null;
  viewerIpHash: string | null;
  viewerUserAgent: string | null;
  viewerReferrer: string | null;
};

type MatchedShareLink = {
  _id: Id<"shareLinks">;
  token: string;
  createdAt: number;
  createdByName: string;
  clientEmail: string | null;
  clientLabel: string | null;
  videoId: Id<"videos"> | null;
  bundleId: Id<"shareBundles"> | null;
  viewCount: number;
  grants: MatchedGrant[];
};

function publicGrant(grant: Doc<"shareAccessGrants">): MatchedGrant {
  return {
    _id: grant._id,
    _creationTime: grant._creationTime,
    createdAt: grant.createdAt,
    expiresAt: grant.expiresAt,
    paidAt: grant.paidAt ?? null,
    viewerClerkId: grant.viewerClerkId ?? null,
    viewerEmail: grant.viewerEmail ?? null,
    viewerIpHash: grant.viewerIpHash ?? null,
    viewerUserAgent: grant.viewerUserAgent ?? null,
    viewerReferrer: grant.viewerReferrer ?? null,
  };
}

function publicShareLink(
  link: Doc<"shareLinks">,
  grants: Doc<"shareAccessGrants">[],
): MatchedShareLink {
  return {
    _id: link._id,
    token: link.token,
    createdAt: link._creationTime,
    createdByName: link.createdByName,
    clientEmail: link.clientEmail ?? null,
    clientLabel: link.clientLabel ?? null,
    videoId: link.videoId ?? null,
    bundleId: link.bundleId ?? null,
    viewCount: link.viewCount,
    grants: grants
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(publicGrant),
  };
}

/**
 * Search all share links for a given video. Returns each link with the
 * grants that have ever been issued under it — when a video leaks, this is
 * the candidate set. Access-gated to team members.
 */
export const lookupForVideo = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId);

    const links = await ctx.db
      .query("shareLinks")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();

    // Bundle links may also reference this video. Resolve every bundle the
    // team owns that contains this id (folder bundles resolve live).
    const projectVideo = await ctx.db.get(args.videoId);
    const bundleLinks: Doc<"shareLinks">[] = [];
    if (projectVideo) {
      const projectBundles = await ctx.db
        .query("shareBundles")
        .withIndex("by_project", (q) => q.eq("projectId", projectVideo.projectId))
        .collect();
      for (const bundle of projectBundles) {
        let contains = false;
        if (bundle.kind === "folder") {
          contains = projectVideo.folderId === bundle.folderId;
        } else if (bundle.kind === "selection") {
          contains = (bundle.videoIds ?? []).includes(args.videoId);
        }
        if (!contains) continue;
        const bundleScopedLinks = await ctx.db
          .query("shareLinks")
          .withIndex("by_bundle", (q) => q.eq("bundleId", bundle._id))
          .collect();
        bundleLinks.push(...bundleScopedLinks);
      }
    }

    const allLinks = [...links, ...bundleLinks];
    const results: MatchedShareLink[] = [];
    for (const link of allLinks) {
      const grants = await ctx.db
        .query("shareAccessGrants")
        .withIndex("by_share_link", (q) => q.eq("shareLinkId", link._id))
        .collect();
      results.push(publicShareLink(link, grants));
    }
    return results;
  },
});

/**
 * Search by burned-in label fragment — handles the most common forensic
 * starting point: the team has a screenshot of a leaked frame and only the
 * watermark to go on. Matches clientEmail OR clientLabel substring, scoped
 * to a project (the team can run a separate search per project they own).
 */
export const lookupByLabel = query({
  args: {
    projectId: v.id("projects"),
    labelFragment: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const fragment = args.labelFragment.trim().toLowerCase();
    if (!fragment) return [];

    // Walk every video in the project, collect their share links, then
    // filter by label fragment. With Convex indexes we'd want a search
    // index for substring; for now N is small (videos per project) so
    // a collect+filter is fine.
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const allLinks: Doc<"shareLinks">[] = [];
    for (const video of videos) {
      const links = await ctx.db
        .query("shareLinks")
        .withIndex("by_video", (q) => q.eq("videoId", video._id))
        .collect();
      allLinks.push(...links);
    }
    const bundles = await ctx.db
      .query("shareBundles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const bundle of bundles) {
      const links = await ctx.db
        .query("shareLinks")
        .withIndex("by_bundle", (q) => q.eq("bundleId", bundle._id))
        .collect();
      allLinks.push(...links);
    }

    const matched = allLinks.filter((link) => {
      const email = (link.clientEmail ?? "").toLowerCase();
      const label = (link.clientLabel ?? "").toLowerCase();
      const tokenPrefix = link.token.toLowerCase().slice(0, 8);
      return (
        email.includes(fragment) ||
        label.includes(fragment) ||
        tokenPrefix.includes(fragment) ||
        fragment.includes(tokenPrefix)
      );
    });

    const results: MatchedShareLink[] = [];
    for (const link of matched) {
      const grants = await ctx.db
        .query("shareAccessGrants")
        .withIndex("by_share_link", (q) => q.eq("shareLinkId", link._id))
        .collect();
      results.push(publicShareLink(link, grants));
    }
    return results;
  },
});

/**
 * Search by viewer email — useful when the team suspects a specific
 * recipient. Returns every grant ever issued to that viewer (across links
 * + videos), grouped by share link, with the link's project ownership
 * verified.
 */
export const lookupByViewerEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email) return [];

    const grants = await ctx.db
      .query("shareAccessGrants")
      .withIndex("by_viewer_email", (q) => q.eq("viewerEmail", email))
      .collect();

    const byLink = new Map<Id<"shareLinks">, Doc<"shareAccessGrants">[]>();
    for (const grant of grants) {
      const bucket = byLink.get(grant.shareLinkId) ?? [];
      bucket.push(grant);
      byLink.set(grant.shareLinkId, bucket);
    }

    const results: MatchedShareLink[] = [];
    for (const [linkId, linkGrants] of byLink) {
      const link = await ctx.db.get(linkId);
      if (!link) continue;
      // Permission check: the caller must be on the team that owns the
      // link's project. We look up via the link's video (or bundle's project).
      const projectId = link.videoId
        ? (await ctx.db.get(link.videoId))?.projectId
        : link.bundleId
          ? (await ctx.db.get(link.bundleId))?.projectId
          : null;
      if (!projectId) continue;
      try {
        await requireProjectAccess(ctx, projectId);
      } catch {
        // Caller can't see this project — silently drop the result rather
        // than leak ownership.
        continue;
      }
      results.push(publicShareLink(link, linkGrants));
    }
    return results;
  },
});
