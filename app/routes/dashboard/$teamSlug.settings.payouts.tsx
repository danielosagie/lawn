import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, ExternalLink, RefreshCw } from "lucide-react";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/dashboard/$teamSlug/settings/payouts")({
  head: () =>
    seoHead({
      title: "Payouts",
      description: "Connect Stripe to collect client payments.",
      path: "/dashboard",
      noIndex: true,
    }),
  component: PayoutsSettings,
});

function PayoutsSettings() {
  const { teamSlug } = useParams({ strict: false }) as { teamSlug: string };

  const teams = useQuery(api.teams.list);
  const team = teams?.find((t) => t.slug === teamSlug);
  const featureStatus = useQuery(api.featureFlags.getFeatureStatus, {});
  const onboardingStatus = useQuery(
    api.stripeConnect.getOnboardingStatus,
    team ? { teamId: team._id as Id<"teams"> } : "skip",
  );

  const createAccount = useAction(api.stripeConnectActions.createConnectAccount);
  const createOnboardingLink = useAction(
    api.stripeConnectActions.createOnboardingLink,
  );
  const refreshStatus = useAction(api.stripeConnectActions.refreshAccountStatus);

  const [busy, setBusy] = useState<null | "create" | "link" | "refresh">(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-refresh once on mount so the status reflects any onboarding the
  // user just completed via Stripe-hosted page.
  useEffect(() => {
    if (!team || onboardingStatus?.stripeAccountId == null) return;
    void refreshStatus({ teamId: team._id as Id<"teams"> }).catch(() => {});
  }, [team, onboardingStatus?.stripeAccountId, refreshStatus]);

  if (!team || onboardingStatus === undefined || featureStatus === undefined) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center text-[#888]">
        Loading payouts settings…
      </div>
    );
  }

  const handleConnect = async () => {
    setError(null);
    setBusy("create");
    try {
      const result = await createAccount({ teamId: team._id as Id<"teams"> });
      if (result.status === "disabled") {
        setError(result.reason ?? "Stripe is not configured on this deployment.");
        return;
      }
      // Immediately push to onboarding.
      setBusy("link");
      const link = await createOnboardingLink({
        teamId: team._id as Id<"teams">,
        returnUrl: `${window.location.origin}/dashboard/${teamSlug}/settings/payouts?stripe=return`,
        refreshUrl: `${window.location.origin}/dashboard/${teamSlug}/settings/payouts?stripe=refresh`,
      });
      if (link.status === "ok" && link.url) {
        window.location.href = link.url;
        return;
      }
      setError(link.reason ?? "Could not start Stripe onboarding.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect Stripe.");
    } finally {
      setBusy(null);
    }
  };

  const handleContinue = async () => {
    setError(null);
    setBusy("link");
    try {
      const link = await createOnboardingLink({
        teamId: team._id as Id<"teams">,
        returnUrl: `${window.location.origin}/dashboard/${teamSlug}/settings/payouts?stripe=return`,
        refreshUrl: `${window.location.origin}/dashboard/${teamSlug}/settings/payouts?stripe=refresh`,
      });
      if (link.status === "ok" && link.url) {
        window.location.href = link.url;
        return;
      }
      setError(link.reason ?? "Could not continue onboarding.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleRefresh = async () => {
    setError(null);
    setBusy("refresh");
    try {
      const result = await refreshStatus({ teamId: team._id as Id<"teams"> });
      if (result.status === "disabled") {
        setError(result.reason ?? "Stripe not configured.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setBusy(null);
    }
  };

  const isStripeDisabled = !featureStatus.stripeConnect;
  const status = onboardingStatus.status;

  return (
    <div className="min-h-screen bg-[#f0f0e8]">
      <header className="border-b-2 border-[#1a1a1a] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link
            to="/dashboard"
            className="text-[#888] hover:text-[#1a1a1a] text-sm font-bold"
          >
            ← Dashboard
          </Link>
          <div className="font-black tracking-tight">{team.name}</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-4xl font-black text-[#1a1a1a]">Payouts</h1>
          <p className="text-[#888] mt-1">
            Connect Stripe to collect payments from clients on paywalled
            delivery links. Snip never touches the money — it goes straight
            to your Stripe account.
          </p>
        </div>

        {isStripeDisabled ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-[#dc2626]" />
                <CardTitle>Stripe not configured</CardTitle>
              </div>
              <CardDescription>
                Set <code className="bg-[#e8e8e0] px-1">STRIPE_SECRET_KEY</code>{" "}
                and{" "}
                <code className="bg-[#e8e8e0] px-1">STRIPE_WEBHOOK_SECRET</code>{" "}
                on this deployment and enable Stripe Connect in the Stripe
                Dashboard before agencies can collect client payments.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Stripe Connect</CardTitle>
                  <CardDescription>
                    Express account — Stripe handles compliance, payouts, and
                    onboarding for each agency.
                  </CardDescription>
                </div>
                {status === "active" ? (
                  <Badge variant="success">
                    <CheckCircle className="h-3 w-3 mr-1" /> Active
                  </Badge>
                ) : status === "pending" ? (
                  <Badge variant="secondary">Pending</Badge>
                ) : status === "restricted" ? (
                  <Badge variant="destructive">Restricted</Badge>
                ) : status === "disabled" ? (
                  <Badge variant="destructive">Disabled</Badge>
                ) : (
                  <Badge variant="secondary">Not connected</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-[#888]">Account ID</dt>
                <dd className="font-mono">
                  {onboardingStatus.stripeAccountId ?? "—"}
                </dd>
                <dt className="text-[#888]">Charges enabled</dt>
                <dd>{onboardingStatus.chargesEnabled ? "Yes" : "No"}</dd>
                <dt className="text-[#888]">Payouts enabled</dt>
                <dd>{onboardingStatus.payoutsEnabled ? "Yes" : "No"}</dd>
              </dl>

              {!onboardingStatus.stripeAccountId ? (
                <Button
                  onClick={() => void handleConnect()}
                  disabled={busy !== null || !onboardingStatus.canManageBilling}
                  className="w-full"
                >
                  {busy === "create" || busy === "link"
                    ? "Opening Stripe…"
                    : "Connect Stripe"}
                </Button>
              ) : status !== "active" ? (
                <div className="flex gap-2">
                  <Button
                    onClick={() => void handleContinue()}
                    disabled={busy !== null || !onboardingStatus.canManageBilling}
                    className="flex-1"
                  >
                    {busy === "link"
                      ? "Opening…"
                      : "Continue onboarding"}
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleRefresh()}
                    disabled={busy !== null}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {busy === "refresh" ? "…" : "Refresh"}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => void handleRefresh()}
                  disabled={busy !== null}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {busy === "refresh" ? "Refreshing…" : "Refresh status"}
                </Button>
              )}

              {!onboardingStatus.canManageBilling ? (
                <p className="text-xs text-[#888]">
                  Only the team owner can manage payout settings.
                </p>
              ) : null}

              {error ? (
                <div className="text-sm text-[#dc2626] border-l-2 border-[#dc2626] pl-2">
                  {error}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Paywall readiness</CardTitle>
            <CardDescription>
              All of these must be configured for paywalled deliveries to work.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <FeatureRow
                label="Stripe Connect"
                ok={featureStatus.stripeConnect && status === "active"}
              />
              <FeatureRow
                label="Stripe webhooks"
                ok={featureStatus.stripeWebhooks}
              />
              <FeatureRow
                label="Mux signed playback"
                ok={featureStatus.muxSignedPlayback}
              />
              <FeatureRow
                label="Mux webhooks"
                ok={featureStatus.muxWebhooks}
              />
              <FeatureRow
                label="Object storage (S3 / R2)"
                ok={featureStatus.objectStorage}
              />
              <FeatureRow
                label="Watermark pipeline"
                ok={featureStatus.watermarkPipeline}
              />
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function FeatureRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-[#ccc] py-1.5">
      <span>{label}</span>
      {ok ? (
        <Badge variant="success">
          <CheckCircle className="h-3 w-3 mr-1" /> Ready
        </Badge>
      ) : (
        <Badge variant="secondary">
          <AlertCircle className="h-3 w-3 mr-1" /> Not configured
        </Badge>
      )}
    </li>
  );
}
