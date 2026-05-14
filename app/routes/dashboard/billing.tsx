import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Users,
  Receipt,
  Check,
  AlertCircle,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/dashboard/billing")({
  head: () =>
    seoHead({
      title: "Billing & usage",
      description: "Manage your workspace subscription.",
      path: "/dashboard/billing",
      noIndex: true,
    }),
  component: BillingRoute,
});

/**
 * Account-level billing page.
 *
 * Pricing shape (flat base + per-seat overage) is sourced from
 * api.workspaceBilling.getMySubscription. The seat count is computed
 * live across every team the user participates in, so adding a
 * collaborator anywhere updates the monthly total without any
 * action here.
 *
 * The CTA flips between "Activate" (no subscription yet),
 * "Subscribed" (active), or "Reactivate" (canceled). In demo mode
 * the buttons hit simulate* mutations; real Stripe Checkout swaps in
 * later.
 */
function BillingRoute() {
  const subscription = useQuery(api.workspaceBilling.getMySubscription, {});
  const tiers = useQuery(api.workspaceBilling.listTiers, {});
  const demoStatus = useQuery(api.demoSeed.isDemoMode, {});
  const simulateActivate = useMutation(api.workspaceBilling.simulateActivate);
  const cancel = useMutation(api.workspaceBilling.simulateCancel);
  const createCheckout = useAction(
    api.workspaceBillingActions.createCheckout,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [activationNote, setActivationNote] = useState<string | null>(null);

  const isLoading = subscription === undefined;
  const isAuthed = subscription !== null;

  const handleActivate = async (plan: string) => {
    setBusy(`activate:${plan}`);
    setActivationNote(null);
    try {
      // Ask the server: real Stripe Checkout, or demo simulate?
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const result = await createCheckout({
        plan,
        successUrl: `${origin}/dashboard/billing?checkout=success`,
        cancelUrl: `${origin}/dashboard/billing?checkout=cancel`,
      });
      if (result.kind === "redirect") {
        if (typeof window !== "undefined") {
          window.location.assign(result.url);
        }
        return;
      }
      // Fallback path — Stripe isn't fully configured. Activate
      // locally so the user can still test the rest of the app.
      await simulateActivate({ plan });
      setActivationNote(result.reason);
    } finally {
      setBusy(null);
    }
  };
  const handleCancel = async () => {
    if (!confirm("Cancel your workspace subscription at the end of the period?")) {
      return;
    }
    setBusy("cancel");
    try {
      await cancel({});
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <DashboardHeader paths={[{ label: "Billing & usage" }]} />

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-black tracking-tight text-[#1a1a1a]">
            Billing &amp; usage
          </h1>
          <p className="text-sm text-[#666] mt-1 max-w-prose">
            One subscription covers all your teams. You pay a flat monthly
            fee plus a small per-seat amount for each collaborator beyond
            the included seats.
          </p>

          {isLoading || !isAuthed ? (
            <div className="mt-8 text-sm text-[#888]">Loading…</div>
          ) : (
            <>
              <PricingCard
                plan={subscription.plan}
                status={subscription.status}
                baseCents={subscription.baseCents}
                perSeatCents={subscription.perSeatCents}
                includedSeats={subscription.includedSeats}
                seatCount={subscription.seatCount}
                overageSeats={subscription.overageSeats}
                monthlyCents={subscription.monthlyCents}
                currency={subscription.currency}
                currentPeriodEnd={subscription.currentPeriodEnd}
              />

              {/* Tier picker. Active sub shows a Cancel button; otherwise
                  each tier card has its own Activate CTA. */}
              <div className="mt-8">
                <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#888] mb-3">
                  {subscription.status === "active" ||
                  subscription.status === "trialing"
                    ? "Change plan"
                    : "Choose a plan"}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(tiers ?? []).map((tier) => {
                    const isCurrent =
                      (subscription.status === "active" ||
                        subscription.status === "trialing") &&
                      subscription.plan === tier.plan;
                    return (
                      <TierCard
                        key={tier.plan}
                        plan={tier.plan}
                        label={tier.label}
                        baseCents={tier.baseCents}
                        perSeatCents={tier.perSeatCents}
                        includedSeats={tier.includedSeats}
                        storageBytes={tier.storageBytes}
                        currency={tier.currency}
                        features={tier.features}
                        isCurrent={isCurrent}
                        busy={busy === `activate:${tier.plan}`}
                        disabled={busy !== null}
                        onActivate={() => void handleActivate(tier.plan)}
                      />
                    );
                  })}
                </div>
                {(subscription.status === "active" ||
                  subscription.status === "trialing") && (
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      onClick={() => void handleCancel()}
                      disabled={busy !== null}
                    >
                      {busy === "cancel"
                        ? "Cancelling…"
                        : "Cancel subscription"}
                    </Button>
                  </div>
                )}
              </div>

              {activationNote ? (
                <div className="mt-4 inline-flex items-start gap-2 border-2 border-[#b45309] bg-[#fdf6e3] px-3 py-2 text-xs max-w-2xl">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#b45309]" />
                  <div>
                    <strong>Activated in demo mode.</strong> {activationNote}
                  </div>
                </div>
              ) : demoStatus?.enabled ? (
                <div className="mt-4 inline-flex items-start gap-2 border-2 border-[#1a1a1a] bg-[#e8e8e0] px-3 py-2 text-xs">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Demo mode.</strong> No Stripe keys are
                    configured, so activation is simulated locally — no
                    card is charged. Set STRIPE_SECRET_KEY +
                    STRIPE_PRICE_WORKSPACE_STUDIO +
                    STRIPE_PRICE_WORKSPACE_PRO in Convex to enable real
                    Checkout.
                  </div>
                </div>
              ) : null}

              <SeatBreakdown
                seatCount={subscription.seatCount}
                includedSeats={subscription.includedSeats}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TierCard({
  plan,
  label,
  baseCents,
  perSeatCents,
  includedSeats,
  storageBytes,
  currency,
  features,
  isCurrent,
  busy,
  disabled,
  onActivate,
}: {
  plan: string;
  label: string;
  baseCents: number;
  perSeatCents: number;
  includedSeats: number;
  storageBytes: number;
  currency: string;
  features: string[];
  isCurrent: boolean;
  busy: boolean;
  disabled: boolean;
  onActivate: () => void;
}) {
  // The "current" card flips to the forest-green inverted treatment
  // (used elsewhere for active/badge states). This keeps text legible
  // in both light and dark themes — the cream-on-cream variant the
  // previous version used became invisible after the theme tokens
  // remapped #1a1a1a.
  return (
    <div
      className={cn(
        "border-2 p-5 flex flex-col gap-3",
        isCurrent
          ? "border-[#FF6600] bg-[#FF6600] text-[#f0f0e8]"
          : "border-[#1a1a1a] bg-[#f0f0e8]",
      )}
    >
      <div className="flex items-baseline gap-2 justify-between">
        <div
          className={cn(
            "font-black text-lg tracking-tight",
            isCurrent ? "text-[#f0f0e8]" : "text-[#1a1a1a]",
          )}
        >
          {label}
        </div>
        {isCurrent ? (
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-[#f0f0e8] text-[#FF6600] font-bold">
            current
          </span>
        ) : (
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#888]">
            {plan}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-mono font-black text-3xl",
            isCurrent ? "text-[#f0f0e8]" : "text-[#1a1a1a]",
          )}
        >
          {formatMoney(baseCents, currency)}
        </span>
        <span
          className={cn(
            "text-xs",
            isCurrent ? "text-[#FFB380]" : "text-[#666]",
          )}
        >
          / month
        </span>
      </div>
      <div
        className={cn(
          "text-xs font-mono",
          isCurrent ? "text-[#c8e0c8]" : "text-[#888]",
        )}
      >
        {includedSeats} seats included · {formatMoney(perSeatCents, currency)} /
        additional seat
      </div>
      <div
        className={cn(
          "text-xs font-mono flex items-center gap-1.5",
          isCurrent ? "text-[#c8e0c8]" : "text-[#888]",
        )}
      >
        <HardDrive className="h-3 w-3" />
        {formatStorage(storageBytes)} storage
      </div>
      <ul
        className={cn(
          "text-sm space-y-1 mt-1",
          isCurrent ? "text-[#f0f0e8]" : "text-[#1a1a1a]",
        )}
      >
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check
              className={cn(
                "h-3.5 w-3.5 mt-0.5 flex-shrink-0",
                isCurrent ? "text-[#FFB380]" : "text-[#FF6600]",
              )}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button
        onClick={onActivate}
        disabled={isCurrent || disabled}
        variant={isCurrent ? "outline" : "default"}
        className={cn(
          "mt-auto",
          isCurrent
            ? "bg-transparent border-[#f0f0e8] text-[#f0f0e8] hover:bg-[#f0f0e8] hover:text-[#FF6600]"
            : "bg-[#FF6600] hover:bg-[#FF7A1F]",
        )}
      >
        <CreditCard className="h-4 w-4 mr-1.5" />
        {isCurrent
          ? "Current plan"
          : busy
            ? "Activating…"
            : "Switch to this plan"}
      </Button>
    </div>
  );
}

const GIBIBYTE = 1024 ** 3;
const TEBIBYTE = 1024 ** 4;

function formatStorage(bytes: number): string {
  if (bytes >= TEBIBYTE) return `${(bytes / TEBIBYTE).toFixed(0)} TB`;
  return `${Math.round(bytes / GIBIBYTE)} GB`;
}

function PricingCard({
  plan,
  status,
  baseCents,
  perSeatCents,
  includedSeats,
  seatCount,
  overageSeats,
  monthlyCents,
  currency,
  currentPeriodEnd,
}: {
  plan: string;
  status: string;
  baseCents: number;
  perSeatCents: number;
  includedSeats: number;
  seatCount: number;
  overageSeats: number;
  monthlyCents: number;
  currency: string;
  currentPeriodEnd: number | undefined;
}) {
  const isActive = status === "active" || status === "trialing";
  return (
    <div className="mt-6 border-2 border-[#1a1a1a] bg-[#f0f0e8]">
      <div className="px-5 py-4 border-b-2 border-[#1a1a1a] flex items-center gap-2 flex-wrap">
        <div className="font-black text-sm uppercase tracking-tight">
          {plan === "studio_v1" ? "Studio plan" : plan}
        </div>
        <Badge variant={isActive ? "success" : "secondary"}>
          {status === "active"
            ? "Active"
            : status === "trialing"
              ? "Trial"
              : status === "canceled"
                ? "Canceled"
                : status === "past_due"
                  ? "Past due"
                  : "Not subscribed"}
        </Badge>
        {currentPeriodEnd && isActive ? (
          <span className="text-xs font-mono text-[#888] ml-auto">
            renews {new Date(currentPeriodEnd).toLocaleDateString()}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y-2 sm:divide-y-0 sm:divide-x-2 divide-[#1a1a1a]">
        <PricingRow
          label="Base"
          help={`Includes ${includedSeats} seats.`}
          amountCents={baseCents}
          currency={currency}
        />
        <PricingRow
          label="Per additional seat"
          help={`${overageSeats} extra seat${overageSeats === 1 ? "" : "s"} this period.`}
          amountCents={perSeatCents}
          currency={currency}
          accent={overageSeats > 0}
        />
      </div>

      <div
        className={cn(
          "px-5 py-4 border-t-2 border-[#1a1a1a] flex items-center justify-between gap-2",
          isActive ? "bg-[#1a1a1a] text-[#f0f0e8]" : "bg-[#e8e8e0]",
        )}
      >
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          <span className="font-black text-sm uppercase tracking-tight">
            Total per month
          </span>
        </div>
        <div className="font-mono font-black text-xl">
          {formatMoney(monthlyCents, currency)}
        </div>
      </div>

      <div className="px-5 py-2 text-[10px] font-mono text-[#888] uppercase tracking-wider border-t border-[#ccc]">
        {seatCount} seat{seatCount === 1 ? "" : "s"} ·{" "}
        {overageSeats > 0
          ? `${overageSeats} over included`
          : `${includedSeats - seatCount} seat${
              includedSeats - seatCount === 1 ? "" : "s"
            } left in plan`}
      </div>
    </div>
  );
}

function PricingRow({
  label,
  help,
  amountCents,
  currency,
  accent,
}: {
  label: string;
  help?: string;
  amountCents: number;
  currency: string;
  accent?: boolean;
}) {
  return (
    <div className="px-5 py-4 flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 border-2 border-[#1a1a1a] flex items-center justify-center bg-[#e8e8e0]">
        {accent ? (
          <Users className="h-4 w-4 text-[#FF6600]" />
        ) : (
          <Check className="h-4 w-4 text-[#888]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm uppercase tracking-wider">
          {label}
        </div>
        {help ? (
          <div className="text-xs text-[#666] mt-0.5">{help}</div>
        ) : null}
      </div>
      <div className="font-mono font-bold text-base text-[#1a1a1a]">
        {formatMoney(amountCents, currency)}
      </div>
    </div>
  );
}

function SeatBreakdown({
  seatCount,
  includedSeats,
}: {
  seatCount: number;
  includedSeats: number;
}) {
  return (
    <section className="mt-10 border-2 border-[#1a1a1a] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4" />
        <h2 className="font-black text-sm uppercase tracking-tight">
          Seat usage
        </h2>
      </div>
      <div className="h-3 border-2 border-[#1a1a1a] bg-[#f0f0e8] relative">
        <div
          className={cn(
            "absolute inset-y-0 left-0",
            seatCount > includedSeats ? "bg-[#b45309]" : "bg-[#FF6600]",
          )}
          style={{
            width: `${Math.min(100, (seatCount / Math.max(includedSeats, 1)) * 100)}%`,
          }}
        />
      </div>
      <div className="mt-2 text-xs font-mono text-[#666] flex items-center justify-between">
        <span>
          {seatCount} / {includedSeats} included
        </span>
        {seatCount > includedSeats ? (
          <span className="text-[#b45309]">
            +{seatCount - includedSeats} overage
          </span>
        ) : null}
      </div>
      <p className="text-xs text-[#666] mt-3 max-w-prose">
        A seat is any unique person across your teams — owners, members,
        and viewers all count. Invite or remove collaborators from each
        team's settings page.
      </p>
    </section>
  );
}

function formatMoney(cents: number, currency: string) {
  const amount = cents / 100;
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  });
}
