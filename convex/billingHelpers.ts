import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

export type TeamPlan = "basic" | "pro";

const GIBIBYTE = 1024 ** 3;
const TEBIBYTE = 1024 ** 4;

export const TEAM_PLAN_MONTHLY_PRICE_USD: Record<TeamPlan, number> = {
  basic: 5,
  pro: 25,
};

export const TEAM_PLAN_STORAGE_LIMIT_BYTES: Record<TeamPlan, number> = {
  basic: 100 * GIBIBYTE,
  pro: TEBIBYTE,
};

export const TEAM_PLAN_MAX_FILE_SIZE_BYTES: Record<TeamPlan, number> = {
  basic: 10 * GIBIBYTE,
  pro: 50 * GIBIBYTE,
};

function hasText(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function formatPlanLabel(plan: TeamPlan) {
  return plan === "basic" ? "Basic" : "Pro";
}

export function formatBytesForBilling(bytes: number) {
  const safeBytes = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (safeBytes >= TEBIBYTE) {
    const value = safeBytes / TEBIBYTE;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} TB`;
  }

  const value = safeBytes / GIBIBYTE;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} GB`;
}

export function normalizeStoredTeamPlan(plan: string): TeamPlan {
  if (plan === "pro" || plan === "team") return "pro";
  return "basic";
}

export function resolvePlanFromStripePriceId(
  stripePriceId: string | undefined | null,
): TeamPlan | null {
  if (!hasText(stripePriceId)) return null;

  const basicPriceId = process.env.STRIPE_PRICE_BASIC_MONTHLY;
  const proPriceId = process.env.STRIPE_PRICE_PRO_MONTHLY;

  if (hasText(basicPriceId) && stripePriceId === basicPriceId) return "basic";
  if (hasText(proPriceId) && stripePriceId === proPriceId) return "pro";
  return null;
}

export function getStripePriceIdForPlan(plan: TeamPlan): string {
  const variableName =
    plan === "basic" ? "STRIPE_PRICE_BASIC_MONTHLY" : "STRIPE_PRICE_PRO_MONTHLY";
  const value = process.env[variableName];
  if (!hasText(value)) {
    throw new Error(`${variableName} is not configured`);
  }
  return value;
}

export function hasActiveTeamSubscriptionStatus(
  status: string | undefined | null,
): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

type BillingCtx = QueryCtx | MutationCtx;

export async function getTeamSubscriptionByOrgId(
  ctx: BillingCtx,
  teamId: Id<"teams">,
) {
  return await ctx.runQuery(components.stripe.public.getSubscriptionByOrgId, {
    orgId: teamId,
  });
}

export async function getTeamSubscriptionState(
  ctx: BillingCtx,
  teamId: Id<"teams">,
) {
  const team = await ctx.db.get(teamId);
  if (!team) {
    throw new Error("Team not found");
  }

  const subscription = await getTeamSubscriptionByOrgId(ctx, teamId);
  const subscriptionPlan = resolvePlanFromStripePriceId(subscription?.priceId);
  const plan = subscriptionPlan ?? normalizeStoredTeamPlan(team.plan);
  const hasActiveSubscription = hasActiveTeamSubscriptionStatus(
    subscription?.status,
  );

  return { team, subscription, plan, hasActiveSubscription };
}

export async function getTeamStorageUsedBytes(
  ctx: BillingCtx,
  teamId: Id<"teams">,
) {
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();

  const videosByProject = await Promise.all(
    projects.map((project) =>
      ctx.db
        .query("videos")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect(),
    ),
  );

  let total = 0;
  for (const videos of videosByProject) {
    for (const video of videos) {
      if (video.status === "failed") continue;
      if (typeof video.fileSize === "number" && Number.isFinite(video.fileSize)) {
        total += video.fileSize;
      }
    }
  }

  return total;
}

export async function assertTeamHasActiveSubscription(
  ctx: BillingCtx,
  teamId: Id<"teams">,
) {
  const state = await getTeamSubscriptionState(ctx, teamId);
  if (!state.hasActiveSubscription) {
    throw new Error("An active Basic or Pro subscription is required.");
  }
  return state;
}

export async function assertTeamCanStoreBytes(
  ctx: BillingCtx,
  teamId: Id<"teams">,
  incomingBytes: number,
) {
  const state = await assertTeamHasActiveSubscription(ctx, teamId);
  const storageUsedBytes = await getTeamStorageUsedBytes(ctx, teamId);
  const storageLimitBytes = TEAM_PLAN_STORAGE_LIMIT_BYTES[state.plan];
  const requestedBytes = Number.isFinite(incomingBytes) ? Math.max(0, incomingBytes) : 0;

  if (storageUsedBytes + requestedBytes > storageLimitBytes) {
    const planLabel = formatPlanLabel(state.plan);
    const actionCopy =
      state.plan === "basic"
        ? "Upgrade to Pro or delete old videos to free up space."
        : "Delete old videos to free up space.";
    throw new Error(
      `This upload would exceed your team's ${planLabel} plan storage limit. You're using ${formatBytesForBilling(storageUsedBytes)} of ${formatBytesForBilling(storageLimitBytes)}, and this file is ${formatBytesForBilling(requestedBytes)}. ${actionCopy}`,
    );
  }

  return {
    ...state,
    storageUsedBytes,
    storageLimitBytes,
  };
}

export async function assertTeamCanUploadFileBytes(
  ctx: BillingCtx,
  teamId: Id<"teams">,
  fileSizeBytes: number,
) {
  const state = await assertTeamHasActiveSubscription(ctx, teamId);
  const requestedBytes = Number.isFinite(fileSizeBytes)
    ? Math.max(0, fileSizeBytes)
    : 0;
  const maxFileSizeBytes = TEAM_PLAN_MAX_FILE_SIZE_BYTES[state.plan];

  if (requestedBytes > maxFileSizeBytes) {
    const planLabel = formatPlanLabel(state.plan);
    const maxFileSizeLabel = formatBytesForBilling(maxFileSizeBytes);
    const upgradeCopy =
      state.plan === "basic"
        ? " Upgrade to Pro for files up to 50 GB."
        : "";

    throw new Error(
      `This file is too large for the ${planLabel} plan. ${planLabel} supports files up to ${maxFileSizeLabel}.${upgradeCopy}`,
    );
  }

  return {
    ...state,
    maxFileSizeBytes,
  };
}
