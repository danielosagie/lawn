"use node";

import { v } from "convex/values";
import {
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { action } from "./_generated/server";
import {
  BUCKET_NAME,
  getS3Client,
  isStorageConfigured,
  projectContractKey,
} from "./s3";
import { isFeatureEnabled } from "./featureFlags";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Contract .docx file storage. Optional layer on top of the HTML-in-DB
 * representation — when S3/R2 is configured, agencies can persist the
 * generated .docx so it can be wired into e-sign flows (Dropbox Sign /
 * Docusign) without re-generating from HTML each time.
 *
 * In demo mode (no storage configured), these actions return
 * `{ status: "disabled" }` and the client just downloads the .docx
 * directly without persisting.
 */

export const getContractDocxUploadUrl = action({
  args: {
    projectId: v.id("projects"),
    contentType: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("ok"), v.literal("disabled")),
    url: v.union(v.string(), v.null()),
    s3Key: v.union(v.string(), v.null()),
    reason: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    status: "ok" | "disabled";
    url: string | null;
    s3Key: string | null;
    reason?: string;
  }> => {
    if (!isFeatureEnabled("objectStorage") || !isStorageConfigured()) {
      return {
        status: "disabled",
        url: null,
        s3Key: null,
        reason: "Object storage not configured — using ad-hoc download instead.",
      };
    }

    // Confirm caller has project access. requireProjectAccess lives in
    // queries/mutations only, so we route through projects.get which has
    // its own access check.
    const project = await ctx.runQuery(api.projects.get, {
      projectId: args.projectId as Id<"projects">,
    });
    if (!project) throw new Error("Project not found");
    const team = await ctx.runQuery(api.teams.get, { teamId: project.teamId });
    if (!team) throw new Error("Team not found");

    // Single canonical key at the project root so it lives next to version
    // folders and shows up in the desktop sync mirror as ./contract.docx.
    // Each save overwrites in place — no version history of the contract
    // itself (the signing flow + signedAt is the audit trail).
    const key = projectContractKey(team.slug, args.projectId);
    const s3 = getS3Client();
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType:
        args.contentType ||
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return { status: "ok", url, s3Key: key };
  },
});

export const getContractDocxDownloadUrl = action({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.object({
    status: v.union(v.literal("ok"), v.literal("none")),
    url: v.union(v.string(), v.null()),
    filename: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "ok" | "none"; url: string | null; filename: string | null }> => {
    const project = await ctx.runQuery(api.projects.get, {
      projectId: args.projectId as Id<"projects">,
    });
    if (!project?.contract?.docxS3Key) {
      return { status: "none", url: null, filename: null };
    }
    if (!isFeatureEnabled("objectStorage") || !isStorageConfigured()) {
      return { status: "none", url: null, filename: null };
    }
    const s3 = getS3Client();
    const safeName = (project.name ?? "contract")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_");
    const filename = `${safeName}-contract.docx`;
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: project.contract.docxS3Key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 600 });
    return { status: "ok", url, filename };
  },
});
