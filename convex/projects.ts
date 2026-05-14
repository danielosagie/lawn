import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getUser, requireTeamAccess, requireProjectAccess } from "./auth";
import { assertTeamHasActiveSubscription } from "./billingHelpers";

export const create = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireTeamAccess(ctx, args.teamId, "member");
    await assertTeamHasActiveSubscription(ctx, args.teamId);

    return await ctx.db.insert("projects", {
      teamId: args.teamId,
      name: args.name,
      description: args.description,
    });
  },
});

export const list = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireTeamAccess(ctx, args.teamId);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    // Get video counts for each project. Soft-deleted projects are
    // filtered out — they're only visible in the trash listing.
    const live = projects.filter((p) => !p.deletedAt);
    const projectsWithCounts = await Promise.all(
      live.map(async (project) => {
        const videos = await ctx.db
          .query("videos")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        return {
          ...project,
          videoCount: videos.length,
        };
      })
    );

    return projectsWithCounts;
  },
});

export const listUploadTargets = query({
  args: {
    teamSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) return [];

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userClerkId", user.subject))
      .collect();

    const uploadableMemberships = memberships.filter(
      (membership) => membership.role !== "viewer",
    );

    const targets = await Promise.all(
      uploadableMemberships.map(async (membership) => {
        const team = await ctx.db.get(membership.teamId);
        if (!team) return [];
        if (args.teamSlug && team.slug !== args.teamSlug) return [];

        const projects = await ctx.db
          .query("projects")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .collect();

        return projects.map((project) => ({
          projectId: project._id,
          projectName: project.name,
          teamId: team._id,
          teamName: team.name,
          teamSlug: team.slug,
          role: membership.role,
        }));
      }),
    );

    return targets
      .flat()
      .sort((a, b) =>
        a.teamName.localeCompare(b.teamName) ||
        a.projectName.localeCompare(b.projectName),
      );
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project, membership } = await requireProjectAccess(ctx, args.projectId);
    return { ...project, role: membership.role };
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "member");

    const updates: Partial<{ name: string; description: string }> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.projectId, updates);
  },
});

const contractInputValidator = v.object({
  contentHtml: v.string(),
  scope: v.optional(v.string()),
  deliverablesSummary: v.optional(v.string()),
  priceCents: v.optional(v.number()),
  currency: v.optional(v.string()),
  revisionsAllowed: v.optional(v.number()),
  deadline: v.optional(v.string()),
  clientName: v.optional(v.string()),
  clientEmail: v.optional(v.string()),
  originalFilename: v.optional(v.string()),
});

export const upsertContract = mutation({
  args: {
    projectId: v.id("projects"),
    contract: contractInputValidator,
  },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId, "member");
    const existing = project.contract;
    if (existing?.signedAt) {
      throw new Error("Contract is signed. Clear it before editing.");
    }
    await ctx.db.patch(args.projectId, {
      contract: {
        ...args.contract,
        // Preserve fields we don't accept on input.
        docxS3Key: existing?.docxS3Key,
        sentForSignatureAt: existing?.sentForSignatureAt,
        signedAt: existing?.signedAt,
        signedByName: existing?.signedByName,
        lastSavedAt: Date.now(),
      },
    });
  },
});

export const linkContractDocxFile = mutation({
  args: {
    projectId: v.id("projects"),
    docxS3Key: v.string(),
  },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId, "member");
    if (!project.contract) throw new Error("No contract drafted.");
    if (project.contract.signedAt) throw new Error("Contract already signed.");
    await ctx.db.patch(args.projectId, {
      contract: { ...project.contract, docxS3Key: args.docxS3Key },
    });
  },
});

export const sendContractForSignature = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId, "member");
    if (!project.contract) throw new Error("No contract drafted yet.");
    if (project.contract.signedAt) throw new Error("Contract already signed.");
    await ctx.db.patch(args.projectId, {
      contract: { ...project.contract, sentForSignatureAt: Date.now() },
    });
  },
});

export const signContractDemo = mutation({
  args: {
    projectId: v.id("projects"),
    signedByName: v.string(),
  },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId, "member");
    if (!project.contract) throw new Error("No contract.");
    if (project.contract.signedAt) throw new Error("Already signed.");
    await ctx.db.patch(args.projectId, {
      contract: {
        ...project.contract,
        signedAt: Date.now(),
        signedByName: args.signedByName,
      },
    });
  },
});

export const clearContract = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "admin");
    await ctx.db.patch(args.projectId, { contract: undefined });
  },
});

/**
 * Soft-delete the project — sets `deletedAt` so the project disappears
 * from team listings but the row + all its videos / folders / etc.
 * stay intact for restore. Use `purge` to actually wipe everything.
 */
export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { user } = await requireProjectAccess(ctx, args.projectId, "admin");
    const name =
      (user as { name?: string; email?: string }).name ??
      (user as { email?: string }).email ??
      "Someone";
    await ctx.db.patch(args.projectId, {
      deletedAt: Date.now(),
      deletedByName: name,
    });
  },
});

/**
 * Lift a project out of the trash. Clears the soft-delete markers so
 * it shows up in regular listings again.
 */
export const restore = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "admin");
    await ctx.db.patch(args.projectId, {
      deletedAt: undefined,
      deletedByName: undefined,
    });
  },
});

/**
 * Hard-delete a project and every video/folder/contract it owns.
 * Only available from the trash UI — regular delete soft-deletes.
 */
export const purge = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "admin");
    const project = await ctx.db.get(args.projectId);
    if (!project?.deletedAt) {
      throw new Error("Move the project to the trash first.");
    }

    const videos = await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const video of videos) {
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_video", (q) => q.eq("videoId", video._id))
        .collect();
      for (const comment of comments) {
        await ctx.db.delete(comment._id);
      }

      const shareLinks = await ctx.db
        .query("shareLinks")
        .withIndex("by_video", (q) => q.eq("videoId", video._id))
        .collect();
      for (const link of shareLinks) {
        const grants = await ctx.db
          .query("shareAccessGrants")
          .withIndex("by_share_link", (q) => q.eq("shareLinkId", link._id))
          .collect();
        for (const grant of grants) {
          await ctx.db.delete(grant._id);
        }
        await ctx.db.delete(link._id);
      }

      await ctx.db.delete(video._id);
    }

    // Folders + clauses-related rows.
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const f of folders) await ctx.db.delete(f._id);

    await ctx.db.delete(args.projectId);
  },
});

/**
 * Trash listing for the current user — every soft-deleted project
 * across every team they belong to. Sorted by deletedAt desc so the
 * most-recently-trashed appears first.
 */
export const listDeleted = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userClerkId", user.subject))
      .collect();

    const all: Array<{
      _id: Id<"projects">;
      name: string;
      teamId: Id<"teams">;
      teamName: string;
      teamSlug: string;
      deletedAt: number;
      deletedByName?: string;
    }> = [];

    for (const m of memberships) {
      const team = await ctx.db.get(m.teamId);
      if (!team) continue;
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_team", (q) => q.eq("teamId", m.teamId))
        .collect();
      for (const p of projects) {
        if (typeof p.deletedAt !== "number") continue;
        all.push({
          _id: p._id,
          name: p.name,
          teamId: team._id,
          teamName: team.name,
          teamSlug: team.slug,
          deletedAt: p.deletedAt,
          deletedByName: p.deletedByName,
        });
      }
    }

    all.sort((a, b) => b.deletedAt - a.deletedAt);
    return all;
  },
});
