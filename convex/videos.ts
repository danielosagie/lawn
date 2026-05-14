import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, MutationCtx } from "./_generated/server";
import { identityName, requireProjectAccess, requireVideoAccess } from "./auth";
import { Doc, Id } from "./_generated/dataModel";
import { generateUniqueToken } from "./security";
import { resolveActiveShareGrant } from "./shareAccess";
import { assertTeamCanStoreBytes } from "./billingHelpers";

const workflowStatusValidator = v.union(
  v.literal("review"),
  v.literal("rework"),
  v.literal("done"),
);

const visibilityValidator = v.union(v.literal("public"), v.literal("private"));

type WorkflowStatus =
  | "review"
  | "rework"
  | "done";

function normalizeWorkflowStatus(status: WorkflowStatus | undefined): WorkflowStatus {
  return status ?? "review";
}

async function generatePublicId(ctx: MutationCtx) {
  return await generateUniqueToken(
    32,
    async (candidate) =>
      (await ctx.db
        .query("videos")
        .withIndex("by_public_id", (q) => q.eq("publicId", candidate))
        .unique()) !== null,
    5,
  );
}

async function deleteShareAccessGrantsForLink(
  ctx: MutationCtx,
  linkId: Id<"shareLinks">,
) {
  const grants = await ctx.db
    .query("shareAccessGrants")
    .withIndex("by_share_link", (q) => q.eq("shareLinkId", linkId))
    .collect();

  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }
}

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    contentType: v.optional(v.string()),
    // Optional destination folder. When set, the uploaded file appears
    // directly inside that folder instead of the project root.
    folderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    const { user, project } = await requireProjectAccess(ctx, args.projectId, "member");
    await assertTeamCanStoreBytes(ctx, project.teamId, args.fileSize ?? 0);
    const publicId = await generatePublicId(ctx);

    // Defensive: a stale folderId from another project would otherwise
    // silently land a file in the wrong tree. Reject it loudly here.
    if (args.folderId) {
      const folder = await ctx.db.get(args.folderId);
      if (!folder || folder.projectId !== args.projectId) {
        throw new Error("Target folder doesn't belong to this project.");
      }
    }

    const videoId = await ctx.db.insert("videos", {
      projectId: args.projectId,
      uploadedByClerkId: user.subject,
      uploaderName: identityName(user),
      title: args.title,
      description: args.description,
      fileSize: args.fileSize,
      contentType: args.contentType,
      status: "uploading",
      muxAssetStatus: "preparing",
      workflowStatus: "review",
      visibility: "public",
      publicId,
      folderId: args.folderId,
    });

    return videoId;
  },
});

export const list = query({
  args: {
    projectId: v.id("projects"),
    // Optional folder filter. `null` (or omitted) = items at the project
    // root (no folderId set). Passing a specific id filters to that folder.
    folderId: v.optional(v.union(v.id("folders"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const allInProject = await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    // Apply folder filter in-memory. The dual-key Convex index would
    // require an explicit by_project_and_folder index; for now the in-mem
    // filter is fine since per-project video count stays modest. If lists
    // grow large we'll add the index.
    const all =
      args.folderId === undefined
        ? allInProject
        : allInProject.filter((v) =>
            args.folderId === null
              ? !v.folderId
              : v.folderId === args.folderId,
          );

    // Frame.io-style stack collapse: only show the row marked as the
    // current version per lineage. Pre-lineage rows (no lineageId) are
    // their own single-version lineage so they pass through. Build a
    // per-lineage map and emit only the row that's current (or the
    // newest row if nothing's been explicitly marked yet — defensive).
    const byLineage = new Map<string, typeof all>();
    for (const v of all) {
      const key = (v.lineageId ?? v._id) as string;
      const arr = byLineage.get(key) ?? [];
      arr.push(v);
      byLineage.set(key, arr);
    }
    const visible: typeof all = [];
    for (const [, group] of byLineage) {
      const current = group.find((v) => v.isCurrentVersion === true);
      visible.push(current ?? group[0]);
    }
    // Preserve the descending creation-time order.
    visible.sort((a, b) => b._creationTime - a._creationTime);

    return await Promise.all(
      visible.map(async (video) => {
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_video", (q) => q.eq("videoId", video._id))
          .collect();

        // Per-lineage version count so the grid card can show "v3 of 3".
        const lineageKey = (video.lineageId ?? video._id) as string;
        const versionCount = (byLineage.get(lineageKey) ?? []).length;

        return {
          ...video,
          uploaderName: video.uploaderName ?? "Unknown",
          workflowStatus: normalizeWorkflowStatus(video.workflowStatus),
          commentCount: comments.length,
          versionCount,
        };
      }),
    );
  },
});

export const get = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video, membership } = await requireVideoAccess(ctx, args.videoId);
    return {
      ...video,
      uploaderName: video.uploaderName ?? "Unknown",
      workflowStatus: normalizeWorkflowStatus(video.workflowStatus),
      role: membership.role,
    };
  },
});

export const getByPublicId = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique();

    if (!video || video.visibility !== "public" || video.status !== "ready") {
      return null;
    }

    return {
      video: {
        _id: video._id,
        title: video.title,
        description: video.description,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        muxAssetId: video.muxAssetId,
        muxPlaybackId: video.muxPlaybackId,
        contentType: video.contentType,
        s3Key: video.s3Key,
      },
    };
  },
});

export const getByPublicIdForDownload = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique();

    if (!video || video.visibility !== "public") {
      return null;
    }

    return {
      video: {
        _id: video._id,
        title: video.title,
        contentType: video.contentType,
        s3Key: video.s3Key,
        status: video.status,
      },
    };
  },
});

export const getPublicIdByVideoId = query({
  args: { videoId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const normalizedVideoId = ctx.db.normalizeId("videos", args.videoId);
    if (!normalizedVideoId) {
      return null;
    }

    const video = await ctx.db.get(normalizedVideoId);
    if (!video || video.visibility !== "public" || video.status !== "ready" || !video.publicId) {
      return null;
    }

    return video.publicId;
  },
});

export const getByShareGrant = query({
  args: { grantToken: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) {
      return null;
    }

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video || video.status !== "ready") {
      return null;
    }

    return {
      video: {
        _id: video._id,
        title: video.title,
        description: video.description,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        muxAssetId: video.muxAssetId,
        muxPlaybackId: video.muxPlaybackId,
        contentType: video.contentType,
        s3Key: video.s3Key,
      },
      grantExpiresAt: resolved.grant.expiresAt,
    };
  },
});

export const getByShareGrantForDownload = query({
  args: { grantToken: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) {
      return null;
    }

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video) {
      return null;
    }

    return {
      allowDownload: resolved.shareLink.allowDownload,
      grantExpiresAt: resolved.grant.expiresAt,
      grantPaidAt: resolved.grant.paidAt ?? null,
      paywall: resolved.shareLink.paywall ?? null,
      video: {
        _id: video._id,
        title: video.title,
        contentType: video.contentType,
        s3Key: video.s3Key,
        status: video.status,
      },
    };
  },
});

export const update = mutation({
  args: {
    videoId: v.id("videos"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId, "member");

    const updates: Partial<{ title: string; description: string }> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.videoId, updates);
  },
});

/**
 * Backfill helper — older video rows pre-date the lineage fields. When we
 * first touch a row's lineage, we patch it so it's self-rooted as v1 +
 * current. Idempotent and cheap.
 */
async function ensureLineageRoot(
  ctx: { db: MutationCtx["db"] },
  video: Doc<"videos">,
): Promise<Doc<"videos">> {
  if (video.lineageId !== undefined && video.versionNumber !== undefined) {
    return video;
  }
  await ctx.db.patch(video._id, {
    lineageId: video.lineageId ?? video._id,
    versionNumber: video.versionNumber ?? 1,
    isCurrentVersion: video.isCurrentVersion ?? true,
  });
  const refreshed = await ctx.db.get(video._id);
  return refreshed as Doc<"videos">;
}

/**
 * Frame.io-style "upload a new version of this video." Creates a fresh
 * video row in the same lineage as `parentVideoId`, marks it as the
 * current version (and demotes the others). Returns the new videoId so
 * the client can kick off the regular upload pipeline against it.
 */
export const createNextVersion = mutation({
  args: {
    parentVideoId: v.id("videos"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    contentType: v.optional(v.string()),
    versionLabel: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"videos">> => {
    const { user, video: rawParent, project } = await requireVideoAccess(
      ctx,
      args.parentVideoId,
      "member",
    );
    await assertTeamCanStoreBytes(ctx, project.teamId, args.fileSize ?? 0);
    const parent = await ensureLineageRoot(ctx, rawParent);
    const lineageId = parent.lineageId ?? parent._id;

    // Demote all current rows in the lineage. Use a collect since the
    // lineage is normally small (< 50 versions).
    const siblings = await ctx.db
      .query("videos")
      .withIndex("by_lineage", (q) => q.eq("lineageId", lineageId))
      .collect();
    const maxVersion = siblings.reduce(
      (m, v) => Math.max(m, v.versionNumber ?? 1),
      parent.versionNumber ?? 1,
    );
    for (const s of siblings) {
      if (s.isCurrentVersion) {
        await ctx.db.patch(s._id, { isCurrentVersion: false });
      }
    }

    const publicId = await generatePublicId(ctx);
    const nextNumber = maxVersion + 1;
    const newTitle =
      args.title?.trim() ||
      parent.title.replace(/\s*\(v\d+\)\s*$/, "") + ` (v${nextNumber})`;

    const videoId = await ctx.db.insert("videos", {
      projectId: parent.projectId,
      uploadedByClerkId: user.subject,
      uploaderName: identityName(user),
      title: newTitle,
      description: args.description ?? parent.description,
      fileSize: args.fileSize,
      contentType: args.contentType,
      status: "uploading",
      muxAssetStatus: "preparing",
      workflowStatus: "review",
      visibility: parent.visibility,
      publicId,
      lineageId,
      versionNumber: nextNumber,
      isCurrentVersion: true,
      versionLabel: args.versionLabel?.trim() || undefined,
    });
    return videoId;
  },
});

export const setCurrentVersion = mutation({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video: rawVideo } = await requireVideoAccess(
      ctx,
      args.videoId,
      "member",
    );
    const video = await ensureLineageRoot(ctx, rawVideo);
    const lineageId = video.lineageId ?? video._id;
    const siblings = await ctx.db
      .query("videos")
      .withIndex("by_lineage", (q) => q.eq("lineageId", lineageId))
      .collect();
    for (const s of siblings) {
      const shouldBe = s._id === args.videoId;
      if (s.isCurrentVersion !== shouldBe) {
        await ctx.db.patch(s._id, { isCurrentVersion: shouldBe });
      }
    }
  },
});

export const renameVersion = mutation({
  args: {
    videoId: v.id("videos"),
    versionLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId, "member");
    await ctx.db.patch(args.videoId, {
      versionLabel: args.versionLabel?.trim() || undefined,
    });
  },
});

/**
 * Returns every version in the lineage `videoId` belongs to, ordered by
 * versionNumber descending (latest first). Falls back to "this video is
 * its own single-version lineage" for legacy rows.
 */
export const listVersions = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId);
    const lineageId = video.lineageId ?? video._id;
    const fromIndex = await ctx.db
      .query("videos")
      .withIndex("by_lineage", (q) => q.eq("lineageId", lineageId))
      .collect();
    // Pre-lineage row case: video itself isn't yet tagged, no siblings
    // exist. Synthesize a single-row response.
    const rows = fromIndex.length > 0 ? fromIndex : [video];
    return rows
      .map((v) => ({
        _id: v._id,
        title: v.title,
        versionNumber: v.versionNumber ?? 1,
        versionLabel: v.versionLabel ?? null,
        isCurrentVersion: v.isCurrentVersion ?? v._id === video._id,
        status: v.status,
        workflowStatus: v.workflowStatus,
        thumbnailUrl: v.thumbnailUrl ?? null,
        duration: v.duration ?? null,
        uploaderName: v.uploaderName,
        _creationTime: v._creationTime,
      }))
      .sort((a, b) => b.versionNumber - a.versionNumber);
  },
});

export const setVisibility = mutation({
  args: {
    videoId: v.id("videos"),
    visibility: visibilityValidator,
  },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId, "member");

    await ctx.db.patch(args.videoId, {
      visibility: args.visibility,
    });
  },
});

const paywallInputValidator = v.object({
  priceCents: v.number(),
  currency: v.optional(v.string()),
  description: v.optional(v.string()),
});

export const setPaywall = mutation({
  args: {
    videoId: v.id("videos"),
    paywall: v.union(paywallInputValidator, v.null()),
  },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId, "member");
    if (args.paywall === null) {
      await ctx.db.patch(args.videoId, { paywall: undefined });
      return;
    }
    if (!Number.isFinite(args.paywall.priceCents) || args.paywall.priceCents < 50) {
      throw new Error("Paywall price must be at least 50 cents.");
    }
    await ctx.db.patch(args.videoId, {
      paywall: {
        priceCents: Math.floor(args.paywall.priceCents),
        currency: (args.paywall.currency ?? "usd").toLowerCase(),
        description: args.paywall.description?.trim() || undefined,
      },
    });
  },
});

/**
 * "Has the viewer paid for this video?" — checks for a succeeded payment
 * matching either the caller's authenticated email or an explicit
 * clientEmail (used by anonymous share-page viewers). Used by the
 * Canva-style download button to decide whether to gate the click.
 */
export const getVideoUnlockState = query({
  args: {
    videoId: v.id("videos"),
    clientEmail: v.optional(v.string()),
  },
  returns: v.object({
    paywall: v.union(
      v.object({
        priceCents: v.number(),
        currency: v.string(),
        description: v.optional(v.string()),
      }),
      v.null(),
    ),
    paid: v.boolean(),
    paidBy: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const video = await ctx.db.get(args.videoId);
    if (!video) return { paywall: null, paid: false, paidBy: null };
    const paywall = video.paywall ?? null;
    if (!paywall) return { paywall: null, paid: true, paidBy: null };

    // Identity-based unlock: if caller is a member of the owning team,
    // they bypass the paywall.
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      const project = await ctx.db.get(video.projectId);
      if (project) {
        const membership = await ctx.db
          .query("teamMembers")
          .withIndex("by_team_and_user", (q) =>
            q.eq("teamId", project.teamId).eq("userClerkId", identity.subject),
          )
          .unique();
        if (membership) {
          return { paywall, paid: true, paidBy: "team-member" };
        }
      }
    }

    // Email-based unlock: any succeeded payment for this video + this
    // email counts. Fall back to the caller's identity email.
    const email =
      args.clientEmail?.trim().toLowerCase() ||
      (typeof identity?.email === "string"
        ? (identity.email as string).toLowerCase()
        : undefined);
    if (!email) return { paywall, paid: false, paidBy: null };

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();
    const paid = payments.find(
      (p) =>
        p.status === "succeeded" &&
        p.clientEmail &&
        p.clientEmail.toLowerCase() === email,
    );
    if (paid) return { paywall, paid: true, paidBy: email };
    return { paywall, paid: false, paidBy: null };
  },
});

export const updateWorkflowStatus = mutation({
  args: {
    videoId: v.id("videos"),
    workflowStatus: workflowStatusValidator,
  },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId, "member");

    await ctx.db.patch(args.videoId, {
      workflowStatus: args.workflowStatus,
    });
  },
});

export const remove = mutation({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId, "admin");

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    const shareLinks = await ctx.db
      .query("shareLinks")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();
    for (const link of shareLinks) {
      await deleteShareAccessGrantsForLink(ctx, link._id);
      await ctx.db.delete(link._id);
    }

    await ctx.db.delete(args.videoId);
  },
});

export const setUploadInfo = internalMutation({
  args: {
    videoId: v.id("videos"),
    s3Key: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      s3Key: args.s3Key,
      muxUploadId: undefined,
      muxAssetId: undefined,
      muxPlaybackId: undefined,
      muxAssetStatus: "preparing",
      thumbnailUrl: undefined,
      duration: undefined,
      uploadError: undefined,
      fileSize: args.fileSize,
      contentType: args.contentType,
      status: "uploading",
    });
  },
});

export const reconcileUploadedObjectMetadata = internalMutation({
  args: {
    videoId: v.id("videos"),
    fileSize: v.number(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db.get(args.videoId);
    if (!video) {
      throw new Error("Video not found");
    }

    const project = await ctx.db.get(video.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const declaredSize =
      typeof video.fileSize === "number" && Number.isFinite(video.fileSize)
        ? Math.max(0, video.fileSize)
        : 0;
    const actualSize = Number.isFinite(args.fileSize) ? Math.max(0, args.fileSize) : 0;
    const sizeDelta = actualSize - declaredSize;

    if (sizeDelta > 0) {
      await assertTeamCanStoreBytes(ctx, project.teamId, sizeDelta);
    }

    await ctx.db.patch(args.videoId, {
      fileSize: actualSize,
      contentType: args.contentType,
    });
  },
});

export const markAsProcessing = internalMutation({
  args: {
    videoId: v.id("videos"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      status: "processing",
      muxAssetStatus: "preparing",
      uploadError: undefined,
    });
  },
});

/**
 * Non-video upload completion. Marks the row "ready" with no Mux fields,
 * so the row represents a plain file (doc/image/audio/source). The grid
 * + share view detect the missing playback ID and render a file tile +
 * download button instead of a player.
 */
export const markAsReadyAsFile = internalMutation({
  args: {
    videoId: v.id("videos"),
    fileSize: v.number(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      status: "ready",
      muxAssetStatus: undefined,
      muxAssetId: undefined,
      muxPlaybackId: undefined,
      muxSignedPlaybackId: undefined,
      muxPreviewAssetId: undefined,
      muxPreviewPlaybackId: undefined,
      muxPreviewAssetStatus: undefined,
      thumbnailUrl: undefined,
      duration: undefined,
      fileSize: args.fileSize,
      contentType: args.contentType,
      uploadError: undefined,
    });
  },
});

export const markAsReady = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxAssetId: v.string(),
    muxPlaybackId: v.string(),
    duration: v.optional(v.number()),
    thumbnailUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxAssetId: args.muxAssetId,
      muxPlaybackId: args.muxPlaybackId,
      muxAssetStatus: "ready",
      duration: args.duration,
      thumbnailUrl: args.thumbnailUrl,
      uploadError: undefined,
      status: "ready",
    });
  },
});

export const markAsFailed = internalMutation({
  args: {
    videoId: v.id("videos"),
    uploadError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxAssetStatus: "errored",
      uploadError: args.uploadError,
      status: "failed",
    });
  },
});

export const setMuxAssetReference = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxAssetId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxAssetId: args.muxAssetId,
      muxAssetStatus: "preparing",
      status: "processing",
    });
  },
});

export const setMuxPlaybackId = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxPlaybackId: v.string(),
    thumbnailUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxPlaybackId: args.muxPlaybackId,
      thumbnailUrl: args.thumbnailUrl,
    });
  },
});

export const setMuxSignedPlaybackId = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxSignedPlaybackId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxSignedPlaybackId: args.muxSignedPlaybackId,
    });
  },
});

export const setMuxPreviewAssetReference = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxPreviewAssetId: v.string(),
    watermarkOverlayKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxPreviewAssetId: args.muxPreviewAssetId,
      muxPreviewAssetStatus: "preparing",
      watermarkOverlayKey: args.watermarkOverlayKey,
    });
  },
});

export const setMuxPreviewPlaybackId = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxPreviewPlaybackId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      muxPreviewPlaybackId: args.muxPreviewPlaybackId,
      muxPreviewAssetStatus: "ready",
    });
  },
});

export const getVideoByMuxPreviewAssetId = internalQuery({
  args: { muxPreviewAssetId: v.string() },
  returns: v.union(
    v.object({
      videoId: v.id("videos"),
    }),
    v.null(),
  ),
  handler: async (ctx, args): Promise<{ videoId: Id<"videos"> } | null> => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_mux_preview_asset_id", (q) =>
        q.eq("muxPreviewAssetId", args.muxPreviewAssetId),
      )
      .unique();
    if (!video) return null;
    return { videoId: video._id };
  },
});

/** Lightweight read used by ensurePreviewAssetForShareLink before triggering ingest. */
export const getForPreviewGen = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const video = await ctx.db.get(args.videoId);
    if (!video) return null;
    return {
      _id: video._id,
      s3Key: video.s3Key,
      contentType: video.contentType,
      muxPreviewAssetId: video.muxPreviewAssetId,
      muxPreviewPlaybackId: video.muxPreviewPlaybackId,
      title: video.title,
    };
  },
});

/** Resolves a share-grant token to the underlying video + paywall state. */
export const getByShareGrantWithPaywall = query({
  args: { grantToken: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) return null;
    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video) return null;
    return {
      grant: {
        _id: resolved.grant._id,
        paidAt: resolved.grant.paidAt ?? null,
        expiresAt: resolved.grant.expiresAt,
      },
      shareLink: {
        _id: resolved.shareLink._id,
        paywall: resolved.shareLink.paywall ?? null,
        clientEmail: resolved.shareLink.clientEmail ?? null,
        clientLabel: resolved.shareLink.clientLabel ?? null,
        allowDownload: resolved.shareLink.allowDownload,
      },
      video: {
        _id: video._id,
        title: video.title,
        status: video.status,
        contentType: video.contentType,
        s3Key: video.s3Key,
        muxAssetId: video.muxAssetId,
        muxPlaybackId: video.muxPlaybackId,
        muxSignedPlaybackId: video.muxSignedPlaybackId,
        muxPreviewAssetId: video.muxPreviewAssetId,
        muxPreviewPlaybackId: video.muxPreviewPlaybackId,
        muxPreviewAssetStatus: video.muxPreviewAssetStatus,
      },
    };
  },
});

export const getVideoByMuxUploadId = internalQuery({
  args: {
    muxUploadId: v.string(),
  },
  returns: v.union(
    v.object({
      videoId: v.id("videos"),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<{ videoId: Id<"videos"> } | null> => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_mux_upload_id", (q) => q.eq("muxUploadId", args.muxUploadId))
      .unique();

    if (!video) return null;
    return { videoId: video._id };
  },
});

export const getVideoByMuxAssetId = internalQuery({
  args: {
    muxAssetId: v.string(),
  },
  returns: v.union(
    v.object({
      videoId: v.id("videos"),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<{ videoId: Id<"videos"> } | null> => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_mux_asset_id", (q) => q.eq("muxAssetId", args.muxAssetId))
      .unique();

    if (!video) return null;
    return { videoId: video._id };
  },
});

export const getVideoForPlayback = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId, "viewer");
    return video;
  },
});

export const incrementViewCount = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const shareLink = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (shareLink) {
      await ctx.db.patch(shareLink._id, {
        viewCount: shareLink.viewCount + 1,
      });
    }
  },
});

export const updateDuration = mutation({
  args: {
    videoId: v.id("videos"),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId, "member");
    await ctx.db.patch(args.videoId, { duration: args.duration });
  },
});
