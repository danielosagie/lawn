import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Link, useParams } from "@tanstack/react-router";
import { useUser } from "@clerk/tanstack-react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video-player/VideoPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { triggerDownload } from "@/lib/download";
import { formatDuration, formatTimestamp, formatRelativeTime } from "@/lib/utils";
import { useVideoPresence } from "@/lib/useVideoPresence";
import { VideoWatchers } from "@/components/presence/VideoWatchers";
import { Lock, Video, AlertCircle, MessageSquare, Clock, Download, ShieldCheck } from "lucide-react";
import { useShareData } from "./-share.data";
import {
  ShareWatermarkOverlay,
  useAntiPiracyDefenses,
} from "@/components/share/ShareWatermarkOverlay";

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export default function SharePage() {
  const params = useParams({ strict: false });
  const token = params.token as string;
  const { user, isLoaded: isUserLoaded } = useUser();

  const issueAccessGrant = useMutation(api.shareLinks.issueAccessGrant);
  const createComment = useMutation(api.comments.createForShareGrant);
  const getPaywalledPlayback = useAction(api.videoActions.getSharedPaywalledPlayback);
  const createCheckoutForGrant = useAction(
    api.paymentsActions.createCheckoutForGrant,
  );
  const simulatePayment = useMutation(api.demoSeed.simulatePaymentForGrant);
  const getDownloadUrl = useAction(api.videoActions.getSharedDownloadUrl);
  const demoStatus = useQuery(api.demoSeed.isDemoMode, {});

  const [grantToken, setGrantToken] = useState<string | null>(null);
  const [hasAttemptedAutoGrant, setHasAttemptedAutoGrant] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [isRequestingGrant, setIsRequestingGrant] = useState(false);
  const [playbackSession, setPlaybackSession] = useState<{
    url: string;
    posterUrl: string;
    mode: "public" | "preview" | "full";
    tokenExpiresAt: number | null;
  } | null>(null);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<{
    priceCents: number;
    currency: string;
    description?: string;
  } | null>(null);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const playerRef = useRef<VideoPlayerHandle | null>(null);

  // Live unlock-state subscription. Convex reactivity flips this from
  // paid:false to paid:true the instant the Stripe webhook fires, with no
  // polling.
  const unlockState = useQuery(
    api.payments.getGrantUnlockState,
    grantToken ? { grantToken } : "skip",
  );

  const isPaywalled = playbackSession?.mode === "preview" || playbackSession?.mode === "full";
  const { suspectAutomation } = useAntiPiracyDefenses(Boolean(isPaywalled));

  useEffect(() => {
    setIsDownloading(false);
    setDownloadError(null);
  }, [token]);

  const { shareInfo, videoData, comments } = useShareData({ token, grantToken });
  const canTrackPresence = Boolean(playbackSession?.url && videoData?.video?._id);
  const { watchers } = useVideoPresence({
    videoId: videoData?.video?._id,
    enabled: canTrackPresence,
    shareToken: token,
  });

  useEffect(() => {
    setGrantToken(null);
    setHasAttemptedAutoGrant(false);
  }, [token]);

  const acquireGrant = useCallback(
    async (password?: string) => {
      if (isRequestingGrant) return;
      setIsRequestingGrant(true);
      setPasswordError(false);

      try {
        const result = await issueAccessGrant({ token, password });
        if (result.ok && result.grantToken) {
          setGrantToken(result.grantToken);
          return true;
        }

        setPasswordError(Boolean(password));
        return false;
      } catch {
        setPasswordError(Boolean(password));
        return false;
      } finally {
        setIsRequestingGrant(false);
      }
    },
    [isRequestingGrant, issueAccessGrant, token],
  );

  useEffect(() => {
    if (!shareInfo || grantToken) return;
    if (shareInfo.status !== "ok" || hasAttemptedAutoGrant) return;

    setHasAttemptedAutoGrant(true);
    void acquireGrant();
  }, [acquireGrant, grantToken, hasAttemptedAutoGrant, shareInfo]);

  // Load (and re-load) the playback session. Re-runs when unlockState.paid
  // flips so payment immediately swaps preview → full-res. Also re-runs as
  // signed-token expiry approaches via the heartbeat below.
  const reloadCounter = useRef(0);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const paidFlag = Boolean(unlockState?.paid);

  useEffect(() => {
    if (!grantToken) {
      setPlaybackSession(null);
      setPlaybackError(null);
      setPaywall(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPlayback(true);
    setPlaybackError(null);

    void getPaywalledPlayback({ grantToken })
      .then((session) => {
        if (cancelled) return;
        setPlaybackSession({
          url: session.url,
          posterUrl: session.posterUrl,
          mode: session.mode,
          tokenExpiresAt: session.tokenExpiresAt,
        });
        setPaywall(session.paywall);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPlaybackError(
          err instanceof Error ? err.message : "Unable to load playback session.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingPlayback(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getPaywalledPlayback, grantToken, paidFlag, reloadTrigger]);

  // Heartbeat — refresh the signed Mux JWT before it expires. Token TTL is
  // 5 minutes; refresh at 4 minutes.
  useEffect(() => {
    if (!playbackSession?.tokenExpiresAt) return;
    const msUntilRefresh = Math.max(
      30_000,
      playbackSession.tokenExpiresAt - Date.now() - 60_000,
    );
    const timer = window.setTimeout(() => {
      reloadCounter.current += 1;
      setReloadTrigger((n) => n + 1);
    }, msUntilRefresh);
    return () => window.clearTimeout(timer);
  }, [playbackSession?.tokenExpiresAt]);

  const handlePay = useCallback(async () => {
    if (!grantToken || isCreatingCheckout) return;
    setIsCreatingCheckout(true);
    setCheckoutError(null);

    // Demo bypass: if Stripe isn't configured, simulate the payment on the
    // server (flip grant.paidAt directly). Lets you exercise the full
    // preview → paid swap without standing up Stripe.
    const stripeConfigured = demoStatus?.stripeConfigured ?? false;
    if (!stripeConfigured) {
      try {
        const result = await simulatePayment({ grantToken });
        if (result.status === "ok" || result.status === "alreadyPaid") {
          setReloadTrigger((n) => n + 1);
        } else if (result.status === "noPaywall") {
          setCheckoutError("This link is not paywalled.");
        } else if (result.status === "invalidGrant") {
          setCheckoutError("Session expired. Please reload.");
        } else if (result.status === "stripeIsConfigured") {
          // Should not happen because we checked above, but fall through.
        }
      } catch (err) {
        setCheckoutError(
          err instanceof Error ? err.message : "Demo payment failed.",
        );
      } finally {
        setIsCreatingCheckout(false);
      }
      return;
    }

    try {
      const result = await createCheckoutForGrant({
        grantToken,
        successUrl: `${window.location.origin}/share/${token}?paid=1`,
        cancelUrl: `${window.location.origin}/share/${token}`,
      });
      if (result.status === "ok" && result.url) {
        window.location.href = result.url;
        return;
      }
      const reasons: Record<typeof result.status, string> = {
        ok: "",
        disabled: "Payments aren't configured on this deployment.",
        noPaywall: "This link is not paywalled.",
        alreadyPaid: "Already unlocked — reloading…",
        teamNotConnected: "The agency hasn't connected Stripe yet.",
        invalidGrant: "Session expired. Please reload.",
      };
      setCheckoutError(result.reason ?? reasons[result.status]);
      if (result.status === "alreadyPaid") {
        setReloadTrigger((n) => n + 1);
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setIsCreatingCheckout(false);
    }
  }, [
    createCheckoutForGrant,
    demoStatus?.stripeConfigured,
    grantToken,
    isCreatingCheckout,
    simulatePayment,
    token,
  ]);

  const flattenedComments = useMemo(() => {
    if (!comments) return [] as Array<{ _id: string; timestampSeconds: number; resolved: boolean }>;

    const markers: Array<{ _id: string; timestampSeconds: number; resolved: boolean }> = [];
    for (const comment of comments) {
      markers.push({
        _id: comment._id,
        timestampSeconds: comment.timestampSeconds,
        resolved: comment.resolved,
      });
      for (const reply of comment.replies) {
        markers.push({
          _id: reply._id,
          timestampSeconds: reply.timestampSeconds,
          resolved: reply.resolved,
        });
      }
    }
    return markers;
  }, [comments]);

  const handleSubmitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!grantToken || !commentText.trim() || isSubmittingComment) return;

    setIsSubmittingComment(true);
    setCommentError(null);
    try {
      await createComment({
        grantToken,
        text: commentText.trim(),
        timestampSeconds: currentTime,
      });
      setCommentText("");
    } catch {
      setCommentError("Failed to post comment.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDownload = useCallback(async () => {
    if (!grantToken || isDownloading) return;

    setDownloadError(null);
    setIsDownloading(true);
    try {
      const result = await getDownloadUrl({ grantToken });
      triggerDownload(result.url, result.filename);
    } catch (error) {
      console.error("Failed to prepare shared download:", error);
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Unable to prepare this download right now.",
      );
    } finally {
      setIsDownloading(false);
    }
  }, [getDownloadUrl, grantToken, isDownloading]);

  const isBootstrappingShare =
    shareInfo === undefined ||
    (shareInfo?.status === "ok" &&
      ((!grantToken && (!hasAttemptedAutoGrant || isRequestingGrant)) ||
        (Boolean(grantToken) && videoData === undefined)));

  if (isBootstrappingShare) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center">
        <div className="text-[#888]">Opening shared video...</div>
      </div>
    );
  }

  if (shareInfo.status === "missing" || shareInfo.status === "expired") {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#dc2626]/10 flex items-center justify-center mb-4 border-2 border-[#dc2626]">
              <AlertCircle className="h-6 w-6 text-[#dc2626]" />
            </div>
            <CardTitle>Link expired or invalid</CardTitle>
            <CardDescription>
              This share link is no longer valid. Please ask the video owner for a new link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/" preload="intent" className="block">
              <Button variant="outline" className="w-full">
                Go to snip
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (shareInfo.status === "requiresPassword" && !grantToken) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#e8e8e0] flex items-center justify-center mb-4 border-2 border-[#1a1a1a]">
              <Lock className="h-6 w-6 text-[#888]" />
            </div>
            <CardTitle>Password required</CardTitle>
            <CardDescription>
              This video is password protected. Enter the password to view.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                await acquireGrant(passwordInput);
              }}
              className="space-y-4"
            >
              <Input
                type="password"
                placeholder="Enter password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-[#dc2626]">Incorrect password</p>
              )}
              <Button type="submit" className="w-full" disabled={!passwordInput || isRequestingGrant}>
                {isRequestingGrant ? "Verifying..." : "View video"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!videoData?.video) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#e8e8e0] flex items-center justify-center mb-4 border-2 border-[#1a1a1a]">
              <Video className="h-6 w-6 text-[#888]" />
            </div>
            <CardTitle>Video not available</CardTitle>
            <CardDescription>
              This video is not available or is still processing.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const video = videoData.video;
  const isPreviewMode = playbackSession?.mode === "preview";
  const isFullMode = playbackSession?.mode === "full";
  const isPaid = Boolean(unlockState?.paid);
  const downloadAllowed = !paywall || isPaid;

  if (suspectAutomation && (isPreviewMode || isFullMode)) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#dc2626]/10 flex items-center justify-center mb-4 border-2 border-[#dc2626]">
              <ShieldCheck className="h-6 w-6 text-[#dc2626]" />
            </div>
            <CardTitle>Automation blocked</CardTitle>
            <CardDescription>
              Paywalled deliveries cannot be opened from automated browsers.
              Open this link in a normal browser session.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f0e8]">
      <header className="bg-[#f0f0e8] border-b-2 border-[#1a1a1a] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            preload="intent"
            to="/"
            className="text-[#888] hover:text-[#1a1a1a] text-sm flex items-center gap-2 font-bold"
          >
            snip
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleDownload()}
            disabled={!grantToken || isDownloading || !downloadAllowed}
            title={!downloadAllowed ? "Pay to unlock download" : undefined}
          >
            <Download className="h-4 w-4" />
            {isDownloading ? "Preparing..." : "Download"}
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {downloadError ? (
          <div
            role="alert"
            className="border-2 border-[#dc2626] bg-[#dc2626]/10 px-4 py-3 text-sm text-[#7f1d1d]"
          >
            {downloadError}
          </div>
        ) : null}

        <div>
          <h1 className="text-2xl font-black text-[#1a1a1a]">{video.title}</h1>
          {video.description && (
            <p className="text-[#888] mt-1">{video.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-[#888]">
            {video.duration && <span className="font-mono">{formatDuration(video.duration)}</span>}
            {comments && <span>{comments.length} threads</span>}
            <VideoWatchers watchers={watchers} className="ml-auto" />
          </div>
        </div>

        {paywall && isPreviewMode ? (
          <section className="border-2 border-[#1a1a1a] bg-[#FF6600] text-[#f0f0e8] p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest opacity-80">
                {demoStatus && !demoStatus.stripeConfigured
                  ? "Demo mode — simulated payment"
                  : "Preview only — paywalled delivery"}
              </div>
              <div className="font-black text-2xl tracking-tight">
                {formatPrice(paywall.priceCents, paywall.currency)} to unlock full
                quality
              </div>
              {paywall.description ? (
                <div className="text-sm opacity-90 mt-1">{paywall.description}</div>
              ) : null}
            </div>
            <div className="flex flex-col items-stretch sm:items-end gap-2">
              <Button
                onClick={() => void handlePay()}
                disabled={isCreatingCheckout}
                className="bg-[#f0f0e8] text-[#1a1a1a] hover:bg-white"
              >
                {isCreatingCheckout
                  ? demoStatus && !demoStatus.stripeConfigured
                    ? "Unlocking…"
                    : "Opening checkout…"
                  : demoStatus && !demoStatus.stripeConfigured
                    ? `Simulate paying ${formatPrice(paywall.priceCents, paywall.currency)}`
                    : `Pay ${formatPrice(paywall.priceCents, paywall.currency)}`}
              </Button>
              {checkoutError ? (
                <div className="text-xs text-[#ffd1d1] max-w-xs text-right">
                  {checkoutError}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {paywall && isFullMode ? (
          <section className="border-2 border-[#1a1a1a] bg-[#FFB380] text-[#1a1a1a] px-5 py-3 flex items-center gap-2 font-bold">
            <ShieldCheck className="h-4 w-4" />
            Paid — full-resolution unlocked
          </section>
        ) : null}

        <div className="relative border-2 border-[#1a1a1a] overflow-hidden">
          {playbackSession?.url ? (
            <>
              <VideoPlayer
                ref={playerRef}
                src={playbackSession.url}
                poster={playbackSession.posterUrl}
                comments={flattenedComments}
                onTimeUpdate={setCurrentTime}
                allowDownload={false}
              />
              {isPaywalled ? (
                <ShareWatermarkOverlay
                  label={
                    shareInfo?.status === "ok"
                      ? `share/${token.slice(0, 8)}`
                      : "PREVIEW"
                  }
                  secondary={isPreviewMode ? "PREVIEW — DO NOT REDISTRIBUTE" : undefined}
                  active={isPreviewMode}
                />
              ) : null}
            </>
          ) : (
            <div className="relative aspect-video overflow-hidden rounded-xl border border-zinc-800/80 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
              {(playbackSession?.posterUrl || video.thumbnailUrl?.startsWith("http")) ? (
                <img
                  src={playbackSession?.posterUrl ?? video.thumbnailUrl}
                  alt={`${video.title} thumbnail`}
                  className="h-full w-full object-cover blur-[4px]"
                />
              ) : null}
              <div className="absolute inset-0 bg-black/45" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                <p className="text-sm font-medium text-white/85">
                  {playbackError ?? (isLoadingPlayback ? "Loading stream..." : "Preparing stream...")}
                </p>
              </div>
            </div>
          )}
        </div>

        <section className="border-2 border-[#1a1a1a] bg-[#e8e8e0] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-[#1a1a1a]">Comments</h2>
            <span className="text-xs text-[#888] font-mono">{formatTimestamp(currentTime)}</span>
          </div>

          {isUserLoaded && user ? (
            <form onSubmit={handleSubmitComment} className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#666]">
                <Clock className="h-3.5 w-3.5" />
                Comment at {formatTimestamp(currentTime)}
              </div>
              <Textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Leave a comment..."
                className="min-h-[90px]"
              />
              {commentError ? <p className="text-xs text-[#dc2626]">{commentError}</p> : null}
              <Button type="submit" disabled={!commentText.trim() || isSubmittingComment}>
                <MessageSquare className="mr-1.5 h-4 w-4" />
                {isSubmittingComment ? "Posting..." : "Post comment"}
              </Button>
            </form>
          ) : (
            <a
              href={`/sign-in?redirect_url=${encodeURIComponent(`/share/${token}`)}`}
              className="inline-flex"
            >
              <Button>
                <MessageSquare className="mr-1.5 h-4 w-4" />
                Sign in to comment
              </Button>
            </a>
          )}

          {comments === undefined ? (
            <p className="text-sm text-[#888]">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-[#888]">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <article key={comment._id} className="border-2 border-[#1a1a1a] bg-[#f0f0e8] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-[#1a1a1a]">{comment.userName}</div>
                    <button
                      type="button"
                      className="font-mono text-xs text-[#FF6600] hover:text-[#1a1a1a]"
                      onClick={() => playerRef.current?.seekTo(comment.timestampSeconds, { play: true })}
                    >
                      {formatTimestamp(comment.timestampSeconds)}
                    </button>
                  </div>
                  <p className="text-sm text-[#1a1a1a] mt-1 whitespace-pre-wrap">{comment.text}</p>
                  <p className="text-[11px] text-[#888] mt-1">{formatRelativeTime(comment._creationTime)}</p>

                  {comment.replies.length > 0 ? (
                    <div className="mt-3 ml-4 border-l-2 border-[#1a1a1a] pl-3 space-y-2">
                      {comment.replies.map((reply) => (
                        <div key={reply._id} className="text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#1a1a1a]">{reply.userName}</span>
                            <button
                              type="button"
                              className="font-mono text-xs text-[#FF6600] hover:text-[#1a1a1a]"
                              onClick={() => playerRef.current?.seekTo(reply.timestampSeconds, { play: true })}
                            >
                              {formatTimestamp(reply.timestampSeconds)}
                            </button>
                          </div>
                          <p className="text-[#1a1a1a] whitespace-pre-wrap">{reply.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t-2 border-[#1a1a1a] px-6 py-4 mt-8">
        <div className="max-w-6xl mx-auto text-center text-sm text-[#888]">
          Shared via{" "}
          <Link to="/" preload="intent" className="text-[#1a1a1a] hover:text-[#FF6600] font-bold">
            snip
          </Link>
        </div>
      </footer>
    </div>
  );
}
