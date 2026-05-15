import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Effective rclone --filter-from rules for the calling user.
 *
 * snip Desktop fetches this at mount time (when features.acls is on),
 * writes the result to a temp file, and passes `--filter-from <path>`
 * to the rclone mount. The FUSE layer then transparently hides files
 * the user isn't entitled to — Finder, Premiere, and Resolve all see
 * a filtered view of the bucket.
 *
 * How the rule list is computed
 * - For every team the user belongs to, fetch all folderPermissions.
 * - Each grant becomes either a `+` (include) or `-` (exclude) rule,
 *   depending on whether the user qualifies (role match OR explicit
 *   clerkId match). Longest path prefix wins, so more-specific
 *   sub-prefix denials are listed before broader allow rules.
 * - Teams with zero grants contribute no rules — paths under them
 *   stay default-allow, matching the checkAccess semantics.
 *
 * Note on the security model
 * - This is FUSE-level enforcement. The filter is honored by rclone,
 *   which is what the editor reads through. A user editing the
 *   filter file by hand could bypass it; storage-side enforcement
 *   (scoped STS / R2 tokens vended per session) requires admin
 *   credentials configured in the Convex deployment env — that's
 *   the next iteration. For most teams the filter-from layer is the
 *   meaningful guardrail because the editors themselves aren't
 *   trying to break in.
 */
export const getEffectiveFilters = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Every team the user is a member of.
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userClerkId", identity.subject))
      .collect();

    type Rule = { action: "+" | "-"; pattern: string };
    const rules: Rule[] = [];

    for (const m of memberships) {
      const grants = await ctx.db
        .query("folderPermissions")
        .withIndex("by_team", (q) => q.eq("teamId", m.teamId))
        .collect();
      for (const g of grants) {
        // Glob the prefix to match everything under it. rclone uses
        // shell-style patterns; `**` matches across directories.
        const pattern = `${g.pathPrefix}**`;
        const roleAllowed = g.allowedRoles.includes(m.role);
        const userAllowed = g.allowedClerkIds.includes(identity.subject);
        rules.push({
          action: roleAllowed || userAllowed ? "+" : "-",
          pattern,
        });
      }
    }

    // Order: longest prefix first. rclone takes the first match, so
    // more-specific deny rules need to win over broader allow rules
    // sitting above them.
    rules.sort((a, b) => b.pattern.length - a.pattern.length);
    return rules;
  },
});
