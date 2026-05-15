import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProjectAccess } from "./auth";

/**
 * The desktop app polls `lsof` against its mount path and upserts the
 * current set of open files for its `clientId`. We key by clientId
 * (not userClerkId) so the same user running snip Desktop on a laptop
 * + a workstation shows up as two presences, not one merged row.
 *
 * Authorization:
 * - Caller must be authenticated.
 * - If a projectId is supplied, the caller must have access to that
 *   project — otherwise a user could pollute a stranger's project
 *   presence by guessing its ID.
 * - Patching an existing row requires the caller to own it (matches
 *   on userClerkId). Defensive — clientId is 8 random bytes so
 *   collision is extremely unlikely, but stops one client from
 *   overwriting another's presence by reusing its clientId.
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
    if (args.projectId) {
      // Throws if the caller isn't a member of the project's team.
      await requireProjectAccess(ctx, args.projectId);
    }

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
      if (existing.userClerkId !== identity.subject) {
        throw new Error("Forbidden: clientId belongs to a different user.");
      }
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return ctx.db.insert("desktopFileLocks", payload);
  },
});

/**
 * Presence is sensitive (it leaks which files a teammate has open,
 * incl. unreleased contract drafts). Restrict reads to members of the
 * project's team — same gate as projects:get and friends.
 */
export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    try {
      // Throws "Project not found" or a 403-equivalent on miss.
      await requireProjectAccess(ctx, args.projectId);
    } catch {
      return [];
    }
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
