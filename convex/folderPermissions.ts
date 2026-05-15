import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTeamAccess } from "./auth";

/**
 * Per-folder access grants for the team-shared mount. See the
 * `folderPermissions` table comment in schema.ts for the storage
 * model.
 *
 * Authorization model
 * - Reads: any team member can list their team's grants (so the
 *   desktop ACL panel can show "what the admin has set up").
 * - Writes (create / update / remove): owner-only, matching how
 *   teams configure their own access boundaries.
 * - checkAccess: any authenticated team member can evaluate a path;
 *   non-members get `allowed: false` without leaking grant rows.
 */

const VALID_ROLES = new Set(["owner", "admin", "member", "viewer"]);

function sanitizePrefix(raw: string): string {
  // Normalize to a path-like prefix that always ends in `/` (so
  // `projects/foo` cannot match `projects/foobar`). Strip leading
  // slashes and trim whitespace.
  const trimmed = raw.trim().replace(/^[/\\]+/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export const listForTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    try {
      await requireTeamAccess(ctx, args.teamId);
    } catch {
      return [];
    }
    return ctx.db
      .query("folderPermissions")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
  },
});

export const create = mutation({
  args: {
    teamId: v.id("teams"),
    pathPrefix: v.string(),
    allowedRoles: v.array(v.string()),
    allowedClerkIds: v.array(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireTeamAccess(ctx, args.teamId, "owner");
    const prefix = sanitizePrefix(args.pathPrefix);
    if (!prefix) throw new Error("Path prefix can't be empty.");
    const roles = args.allowedRoles.filter((r) => VALID_ROLES.has(r));
    return ctx.db.insert("folderPermissions", {
      teamId: args.teamId,
      pathPrefix: prefix,
      allowedRoles: roles,
      allowedClerkIds: args.allowedClerkIds,
      note: args.note,
      createdAt: Date.now(),
      createdByClerkId: user.subject,
    });
  },
});

export const update = mutation({
  args: {
    permissionId: v.id("folderPermissions"),
    pathPrefix: v.optional(v.string()),
    allowedRoles: v.optional(v.array(v.string())),
    allowedClerkIds: v.optional(v.array(v.string())),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.permissionId);
    if (!existing) throw new Error("Permission not found.");
    await requireTeamAccess(ctx, existing.teamId, "owner");

    const patch: Record<string, unknown> = {};
    if (args.pathPrefix !== undefined) {
      const prefix = sanitizePrefix(args.pathPrefix);
      if (!prefix) throw new Error("Path prefix can't be empty.");
      patch.pathPrefix = prefix;
    }
    if (args.allowedRoles !== undefined) {
      patch.allowedRoles = args.allowedRoles.filter((r) => VALID_ROLES.has(r));
    }
    if (args.allowedClerkIds !== undefined) patch.allowedClerkIds = args.allowedClerkIds;
    if (args.note !== undefined) patch.note = args.note;

    await ctx.db.patch(args.permissionId, patch);
    return args.permissionId;
  },
});

export const remove = mutation({
  args: { permissionId: v.id("folderPermissions") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.permissionId);
    if (!existing) return;
    await requireTeamAccess(ctx, existing.teamId, "owner");
    await ctx.db.delete(args.permissionId);
  },
});

/**
 * Evaluate whether the current user can access `path` under `teamId`.
 *
 * Logic:
 * - If there are zero grants for the team, access is open to all
 *   members (default-allow — folders aren't gated until an admin
 *   adds the first grant).
 * - If at least one grant exists, the longest-prefix match wins.
 *   Match = (path === prefix) or (path startsWith prefix). Within
 *   the matching grant, the user is allowed if their role is in
 *   allowedRoles OR their clerk subject is in allowedClerkIds.
 * - Non-members of the team get { allowed: false, reason: "not-member" }
 *   without leaking anything else about the team's grant config.
 */
export const checkAccess = query({
  args: { teamId: v.id("teams"), path: v.string() },
  handler: async (ctx, args) => {
    let membership;
    try {
      ({ membership } = await requireTeamAccess(ctx, args.teamId));
    } catch {
      return { allowed: false, reason: "not-member" as const };
    }

    const grants = await ctx.db
      .query("folderPermissions")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    if (grants.length === 0) {
      return { allowed: true, reason: "default-allow" as const };
    }

    const normalized = args.path.replace(/^[/\\]+/, "").replace(/\\/g, "/");
    // Longest-prefix match — most-specific grant wins.
    const matches = grants
      .filter(
        (g) =>
          normalized === g.pathPrefix.replace(/\/$/, "") ||
          normalized.startsWith(g.pathPrefix),
      )
      .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

    if (matches.length === 0) {
      return { allowed: false, reason: "no-matching-grant" as const };
    }

    const best = matches[0];
    const identity = await ctx.auth.getUserIdentity();
    const roleAllowed = best.allowedRoles.includes(membership.role);
    const userAllowed = Boolean(identity && best.allowedClerkIds.includes(identity.subject));
    if (roleAllowed || userAllowed) {
      return { allowed: true, reason: "grant-match" as const, grantId: best._id };
    }
    return { allowed: false, reason: "grant-denied" as const, grantId: best._id };
  },
});
