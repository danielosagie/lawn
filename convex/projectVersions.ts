import { v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import { requireProjectAccess } from "./auth";
import { Doc, Id } from "./_generated/dataModel";

/**
 * Folder-as-version model for the desktop sync app.
 *
 * Each version is one row pointing at an S3 prefix that mirrors the project's
 * working tree at that point in time. The desktop app reads the row marked
 * `isLatest: true` to decide what to pull down. Push from desktop creates a
 * new row with `versionNumber + 1` and flips the latest pointer.
 */

async function unmarkLatestVersions(
  ctx: MutationCtx,
  projectId: Id<"projects">,
) {
  const current = await ctx.db
    .query("projectVersions")
    .withIndex("by_project_latest", (q) =>
      q.eq("projectId", projectId).eq("isLatest", true),
    )
    .collect();
  for (const row of current) {
    await ctx.db.patch(row._id, { isLatest: false });
  }
}

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const rows = await ctx.db
      .query("projectVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    return rows.map((row) => ({
      _id: row._id,
      _creationTime: row._creationTime,
      folderName: row.folderName ?? `v${row.versionNumber}`,
      versionNumber: row.versionNumber,
      label: row.label ?? null,
      notes: row.notes ?? null,
      s3Prefix: row.s3Prefix,
      sizeBytes: row.sizeBytes ?? null,
      fileCount: row.fileCount ?? null,
      createdByName: row.createdByName,
      isLatest: row.isLatest,
      deliveredShareLinkId: row.deliveredShareLinkId ?? null,
    }));
  },
});

export const getLatest = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const row = await ctx.db
      .query("projectVersions")
      .withIndex("by_project_latest", (q) =>
        q.eq("projectId", args.projectId).eq("isLatest", true),
      )
      .unique();
    if (!row) return null;
    return {
      _id: row._id,
      folderName: row.folderName ?? `v${row.versionNumber}`,
      versionNumber: row.versionNumber,
      label: row.label ?? null,
      notes: row.notes ?? null,
      s3Prefix: row.s3Prefix,
      sizeBytes: row.sizeBytes ?? null,
      fileCount: row.fileCount ?? null,
      createdByName: row.createdByName,
      isLatest: row.isLatest,
    };
  },
});

function sanitizeFolderName(input: string): string {
  // Filesystem-safe: keep letters/digits/dot/dash/underscore. Replace spaces
  // with underscores. No leading/trailing slashes. Cap length so S3 keys
  // stay sane.
  const cleaned = input
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  if (!cleaned) throw new Error("Folder name cannot be empty.");
  return cleaned;
}

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    // Editors name folders themselves (final_v12, color_pass_b, …). Server
    // sanitizes + uniques. s3Prefix is derived; callers do NOT pass it
    // anymore.
    folderName: v.string(),
    label: v.optional(v.string()),
    notes: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    fileCount: v.optional(v.number()),
    setAsLatest: v.optional(v.boolean()),
  },
  returns: v.object({
    _id: v.id("projectVersions"),
    versionNumber: v.number(),
    folderName: v.string(),
    s3Prefix: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    _id: Id<"projectVersions">;
    versionNumber: number;
    folderName: string;
    s3Prefix: string;
  }> => {
    const { user, project } = await requireProjectAccess(ctx, args.projectId, "member");
    const team = await ctx.db.get(project.teamId);
    if (!team) throw new Error("Team not found");

    let folderName = sanitizeFolderName(args.folderName);

    const all = await ctx.db
      .query("projectVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Disambiguate if folder name collides with an existing version.
    const taken = new Set(
      all.map((r) => r.folderName ?? `v${r.versionNumber}`),
    );
    if (taken.has(folderName)) {
      let suffix = 2;
      while (taken.has(`${folderName}_${suffix}`)) suffix++;
      folderName = `${folderName}_${suffix}`;
    }

    const nextVersion = all.reduce((max, row) => Math.max(max, row.versionNumber), 0) + 1;
    const s3Prefix = `projects/${team.slug}/${project._id}/${folderName}/`;

    const shouldBeLatest = args.setAsLatest ?? true;
    if (shouldBeLatest) {
      await unmarkLatestVersions(ctx, args.projectId);
    }

    const _id = await ctx.db.insert("projectVersions", {
      projectId: args.projectId,
      teamId: project.teamId,
      folderName,
      versionNumber: nextVersion,
      label: args.label?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      s3Prefix,
      sizeBytes: args.sizeBytes,
      fileCount: args.fileCount,
      createdByClerkId: user.subject,
      createdByName:
        (user as { name?: string; givenName?: string; email?: string }).name ??
        (user as { givenName?: string }).givenName ??
        (user as { email?: string }).email ??
        "Unknown",
      isLatest: shouldBeLatest,
    });

    return { _id, versionNumber: nextVersion, folderName, s3Prefix };
  },
});

export const rename = mutation({
  args: {
    versionId: v.id("projectVersions"),
    folderName: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.versionId);
    if (!row) throw new Error("Version not found");
    await requireProjectAccess(ctx, row.projectId, "member");
    const team = await ctx.db.get(row.teamId);
    if (!team) throw new Error("Team not found");

    let folderName = sanitizeFolderName(args.folderName);
    if (folderName !== (row.folderName ?? `v${row.versionNumber}`)) {
      const taken = (
        await ctx.db
          .query("projectVersions")
          .withIndex("by_project", (q) => q.eq("projectId", row.projectId))
          .collect()
      )
        .filter((r) => r._id !== row._id)
        .map((r) => r.folderName ?? `v${r.versionNumber}`);
      const takenSet = new Set(taken);
      if (takenSet.has(folderName)) {
        let suffix = 2;
        while (takenSet.has(`${folderName}_${suffix}`)) suffix++;
        folderName = `${folderName}_${suffix}`;
      }
    }
    const s3Prefix = `projects/${team.slug}/${row.projectId}/${folderName}/`;
    await ctx.db.patch(row._id, { folderName, s3Prefix });
  },
});

export const markLatest = mutation({
  args: { versionId: v.id("projectVersions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.versionId);
    if (!row) throw new Error("Version not found");
    await requireProjectAccess(ctx, row.projectId, "member");
    await unmarkLatestVersions(ctx, row.projectId);
    await ctx.db.patch(row._id, { isLatest: true });
  },
});

export const updateMetadata = mutation({
  args: {
    versionId: v.id("projectVersions"),
    label: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.versionId);
    if (!row) throw new Error("Version not found");
    await requireProjectAccess(ctx, row.projectId, "member");
    const updates: Partial<Doc<"projectVersions">> = {};
    if (args.label !== undefined) updates.label = args.label.trim() || undefined;
    if (args.notes !== undefined) updates.notes = args.notes.trim() || undefined;
    await ctx.db.patch(row._id, updates);
  },
});

export const attachDelivery = mutation({
  args: {
    versionId: v.id("projectVersions"),
    shareLinkId: v.id("shareLinks"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.versionId);
    if (!row) throw new Error("Version not found");
    await requireProjectAccess(ctx, row.projectId, "member");
    await ctx.db.patch(row._id, { deliveredShareLinkId: args.shareLinkId });
  },
});

export const remove = mutation({
  args: { versionId: v.id("projectVersions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.versionId);
    if (!row) throw new Error("Version not found");
    await requireProjectAccess(ctx, row.projectId, "admin");
    if (row.isLatest) {
      throw new Error(
        "Cannot delete the latest version. Mark a different version as latest first.",
      );
    }
    await ctx.db.delete(row._id);
  },
});

/**
 * Desktop-app helper. Returns everything a sync client needs to mirror a
 * project locally: the project ROOT prefix (so contract.docx + every
 * version subfolder syncs in one pull), plus the latest version pointer
 * and full version history.
 */
export const desktopSnapshotForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    project: v.object({
      _id: v.id("projects"),
      name: v.string(),
      teamId: v.id("teams"),
      teamSlug: v.string(),
      rootS3Prefix: v.string(),
      hasContract: v.boolean(),
    }),
    latest: v.union(
      v.object({
        _id: v.id("projectVersions"),
        folderName: v.string(),
        versionNumber: v.number(),
        s3Prefix: v.string(),
        label: v.union(v.string(), v.null()),
      }),
      v.null(),
    ),
    versions: v.array(
      v.object({
        _id: v.id("projectVersions"),
        folderName: v.string(),
        versionNumber: v.number(),
        label: v.union(v.string(), v.null()),
        s3Prefix: v.string(),
        isLatest: v.boolean(),
        sizeBytes: v.union(v.number(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId);
    const team = await ctx.db.get(project.teamId);
    if (!team) throw new Error("Team not found");
    const rows = await ctx.db
      .query("projectVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    const latest = rows.find((r) => r.isLatest) ?? null;
    const rootS3Prefix = `projects/${team.slug}/${project._id}/`;
    return {
      project: {
        _id: project._id,
        name: project.name,
        teamId: project.teamId,
        teamSlug: team.slug,
        rootS3Prefix,
        hasContract: Boolean(project.contract?.docxS3Key),
      },
      latest: latest
        ? {
            _id: latest._id,
            folderName: latest.folderName ?? `v${latest.versionNumber}`,
            versionNumber: latest.versionNumber,
            s3Prefix: latest.s3Prefix,
            label: latest.label ?? null,
          }
        : null,
      versions: rows.map((r) => ({
        _id: r._id,
        folderName: r.folderName ?? `v${r.versionNumber}`,
        versionNumber: r.versionNumber,
        label: r.label ?? null,
        s3Prefix: r.s3Prefix,
        isLatest: r.isLatest,
        sizeBytes: r.sizeBytes ?? null,
      })),
    };
  },
});
