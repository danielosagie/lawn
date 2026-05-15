import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * The desktop app polls `lsof` against its mount path and upserts the
 * current set of open files for its `clientId`. We key by clientId
 * (not userClerkId) so the same user running snip Desktop on a laptop
 * + a workstation shows up as two presences, not one merged row.
 */
export const upsertLocks = mutation({
  args: {
    clientId: v.string(),
    userName: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    teamId: v.optional(v.id("teams")),
    mountPath: v.string(),
    files: v.array(
      v.object({
        path: v.string(),
        process: v.optional(v.string()),
        pid: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    const existing = await ctx.db
      .query("desktopFileLocks")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();

    const payload = {
      clientId: args.clientId,
      userClerkId: identity.subject,
      userName: args.userName,
      projectId: args.projectId,
      teamId: args.teamId,
      mountPath: args.mountPath,
      files: args.files,
      lastSeen: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return ctx.db.insert("desktopFileLocks", payload);
  },
});

/**
 * Anyone authenticated to the project's team can read presence for it.
 * The 30s freshness cutoff matches the desktop's 5s push cadence with
 * generous slack for laptop sleep / transient network blips.
 */
export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const cutoff = Date.now() - 30_000;
    const rows = await ctx.db
      .query("desktopFileLocks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return rows.filter((r) => r.lastSeen > cutoff);
  },
});

export const clearLocks = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");
    const existing = await ctx.db
      .query("desktopFileLocks")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();
    if (existing && existing.userClerkId === identity.subject) {
      await ctx.db.delete(existing._id);
    }
  },
});
