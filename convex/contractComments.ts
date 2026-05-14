import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProjectAccess } from "./auth";

/**
 * Contract comments. Project-scoped (one stream per contract) so the
 * paywall + invite layer doesn't need to plumb a separate concept —
 * everyone who can see the contract sees the comments.
 *
 * No per-paragraph anchoring yet; we store an optional `anchorText`
 * the client captures from the editor selection at comment time.
 * That's enough to render "commented on: <quote>" above each thread
 * without needing a Tiptap mark.
 */

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const rows = await ctx.db
      .query("contractComments")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    return rows;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    body: v.string(),
    anchorText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireProjectAccess(ctx, args.projectId);
    const body = args.body.trim();
    if (!body) throw new Error("Comment body can't be empty.");

    const name =
      (user as { name?: string; email?: string }).name ??
      (user as { email?: string }).email ??
      "Someone";
    const avatarUrl =
      (user as { pictureUrl?: string }).pictureUrl ?? undefined;

    return await ctx.db.insert("contractComments", {
      projectId: args.projectId,
      authorClerkId: user.subject,
      authorName: name,
      authorAvatarUrl: avatarUrl,
      body,
      anchorText: args.anchorText,
    });
  },
});

export const resolve = mutation({
  args: { commentId: v.id("contractComments") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.commentId);
    if (!row) return;
    const { user } = await requireProjectAccess(ctx, row.projectId);
    if (row.resolvedAt) return;
    const name =
      (user as { name?: string; email?: string }).name ??
      (user as { email?: string }).email ??
      "Someone";
    await ctx.db.patch(row._id, {
      resolvedAt: Date.now(),
      resolvedByName: name,
    });
  },
});

export const reopen = mutation({
  args: { commentId: v.id("contractComments") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.commentId);
    if (!row) return;
    await requireProjectAccess(ctx, row.projectId);
    if (!row.resolvedAt) return;
    await ctx.db.patch(row._id, {
      resolvedAt: undefined,
      resolvedByName: undefined,
    });
  },
});

export const remove = mutation({
  args: { commentId: v.id("contractComments") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.commentId);
    if (!row) return;
    const { user } = await requireProjectAccess(ctx, row.projectId);
    // Author can delete their own; admin can delete anyone's.
    if (row.authorClerkId !== user.subject) {
      await requireProjectAccess(ctx, row.projectId, "admin");
    }
    await ctx.db.delete(row._id);
  },
});
