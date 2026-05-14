import { ConvexClient } from "convex/browser";
import { useEffect, useMemo, useState } from "react";

/**
 * "What changed" modal — visual per-clip diff between two saves.
 *
 * The clip-matching algorithm:
 *
 *   1. Group clips in each snapshot by a fuzzy identity key
 *      (name + ref + lane). Two clips with the same key are presumed to
 *      be the "same" clip across snapshots, even if their offset /
 *      duration drifted.
 *   2. For multi-match groups, pair greedily by closest timeline offset.
 *   3. Leftover clips in `from` only → removed. Leftover in `to` only →
 *      added. Pairs with non-trivial offset/duration delta → moved /
 *      resized / both.
 *
 * The visual treats each snapshot as a horizontal track, scaled to the
 * longer of the two so both share the same coordinate space. Lanes
 * stack vertically. Clips render as colored rectangles with the change
 * type and a small label.
 *
 * Non-cut domains (color / audio / effects / markers) still show
 * aggregate counts below — visual diffing those needs domain-specific
 * UIs we haven't designed yet.
 */

interface SnapshotPayload {
  _id: string;
  _creationTime: number;
  message: string;
  branch: string;
  createdByName: string;
  source: "resolve" | "premiere" | "manual";
  cuts: string;
  color: string;
  audio: string;
  effects: string;
  markers: string;
  metadata: string;
}

interface Props {
  client: ConvexClient;
  fromId: string;
  toId: string;
  onClose: () => void;
}

interface RawClip {
  tag?: string | null;
  name?: string | null;
  offset?: string | null;
  duration?: string | null;
  start?: string | null;
  ref?: string | null;
  lane?: string | null;
  audio_role?: string | null;
}

type ClipKind = "unchanged" | "moved" | "resized" | "both" | "added" | "removed";

interface NormalizedClip {
  name: string;
  ref: string;
  lane: number;
  offset: number;
  duration: number;
  start: number;
  audioRole: string;
}

interface ClipPair {
  from: NormalizedClip | null;
  to: NormalizedClip | null;
  kind: ClipKind;
  /** Lane to render in. For removed/added clips, comes from their only side. */
  lane: number;
}

export function DiffView({ client, fromId, toId, onClose }: Props) {
  const [from, setFrom] = useState<SnapshotPayload | null>(null);
  const [to, setTo] = useState<SnapshotPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [a, b] = (await Promise.all([
          client.query(
            "timelines:get" as unknown as Parameters<typeof client.query>[0],
            { snapshotId: fromId } as unknown as Parameters<typeof client.query>[1],
          ),
          client.query(
            "timelines:get" as unknown as Parameters<typeof client.query>[0],
            { snapshotId: toId } as unknown as Parameters<typeof client.query>[1],
          ),
        ])) as [SnapshotPayload | null, SnapshotPayload | null];
        if (cancelled) return;
        if (!a || !b) {
          setError("One of the saves disappeared. Close and try again.");
          return;
        }
        // Chronological order: older = "from", newer = "to".
        if (a._creationTime > b._creationTime) {
          setFrom(b);
          setTo(a);
        } else {
          setFrom(a);
          setTo(b);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load saves.");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [client, fromId, toId]);

  const diff = useMemo(() => {
    if (!from || !to) return null;
    return computeFullDiff(from, to);
  }, [from, to]);

  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,26,26,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#f0f0e8",
          border: "2px solid #1a1a1a",
          maxWidth: 980,
          width: "100%",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            padding: "10px 14px",
            background: "#1a1a1a",
            color: "#f0f0e8",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.7 }}>WHAT CHANGED</div>
            <div
              style={{
                fontWeight: 900,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {from && to
                ? `${truncate(from.message, 50)}  →  ${truncate(to.message, 50)}`
                : "Loading…"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: "#f0f0e8",
              border: "1px solid #f0f0e8",
              padding: "2px 8px",
              fontSize: 12,
              marginLeft: 12,
            }}
          >
            Close
          </button>
        </header>

        <div style={{ padding: 16, overflowY: "auto", fontSize: 13 }}>
          {error ? (
            <div style={{ color: "#7f1d1d" }}>{error}</div>
          ) : !from || !to || !diff ? (
            <div style={{ color: "#888" }}>Loading saves…</div>
          ) : (
            <>
              <SnapshotMeta from={from} to={to} />

              <VisualClipDiff diff={diff} />

              <DomainSummaryGrid
                color={diff.color}
                audio={diff.audio}
                effects={diff.effects}
                markers={diff.markers}
              />

              {diff.totalChanged === 0 ? (
                <div
                  style={{
                    background: "#dde6dd",
                    border: "2px solid #2d5a2d",
                    padding: 10,
                    color: "#2d5a2d",
                    marginTop: 12,
                  }}
                >
                  Identical timeline data — only the message / metadata
                  differs between these saves.
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Visual clip diff ─────────────────────────────────────────────────────

const KIND_COLORS: Record<ClipKind, string> = {
  unchanged: "#888",
  moved: "#b45309",
  resized: "#b45309",
  both: "#dc2626",
  added: "#2d5a2d",
  removed: "#7f1d1d",
};

const KIND_LABELS: Record<ClipKind, string> = {
  unchanged: "unchanged",
  moved: "moved",
  resized: "resized",
  both: "moved + resized",
  added: "new",
  removed: "removed",
};

function VisualClipDiff({
  diff,
}: {
  diff: FullDiff;
}) {
  const pairs = diff.clipPairs;
  if (pairs.length === 0) {
    return (
      <div
        style={{
          border: "2px solid #1a1a1a",
          padding: 14,
          marginBottom: 14,
          background: "#e8e8e0",
          fontSize: 12,
          color: "#666",
        }}
      >
        No clips on either timeline. (FCPXML data may not have been
        parsed for this source — Premiere ingest only stores the raw
        project file for now.)
      </div>
    );
  }

  // Compute the global time + lane bounds for the SVG coordinate space.
  let maxTime = 0;
  let maxLane = 0;
  for (const p of pairs) {
    const fromEnd =
      p.from != null ? p.from.offset + Math.max(p.from.duration, 0.001) : 0;
    const toEnd =
      p.to != null ? p.to.offset + Math.max(p.to.duration, 0.001) : 0;
    maxTime = Math.max(maxTime, fromEnd, toEnd);
    if (p.from) maxLane = Math.max(maxLane, p.from.lane);
    if (p.to) maxLane = Math.max(maxLane, p.to.lane);
  }
  // Pad
  maxTime = Math.max(maxTime, 1);
  const laneCount = maxLane + 1;

  return (
    <section style={{ border: "2px solid #1a1a1a", marginBottom: 12 }}>
      <header
        style={{
          padding: "4px 10px",
          background: "#1a1a1a",
          color: "#f0f0e8",
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: "0.05em",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>CUTS — PER-CLIP DIFF</span>
        <span style={{ opacity: 0.7, fontWeight: 600 }}>
          {diff.cutCounts.added > 0 ? `+${diff.cutCounts.added}  ` : ""}
          {diff.cutCounts.removed > 0 ? `−${diff.cutCounts.removed}  ` : ""}
          {diff.cutCounts.moved > 0 ? `↔${diff.cutCounts.moved}  ` : ""}
          {diff.cutCounts.resized > 0 ? `⇔${diff.cutCounts.resized}` : ""}
          {diff.cutCounts.added === 0 &&
          diff.cutCounts.removed === 0 &&
          diff.cutCounts.moved === 0 &&
          diff.cutCounts.resized === 0
            ? "no changes"
            : null}
        </span>
      </header>

      <div style={{ padding: 10 }}>
        <ClipTrackSvg
          label="Older"
          subtitle="(from)"
          pairs={pairs}
          maxTime={maxTime}
          laneCount={laneCount}
          side="from"
        />
        <div
          style={{
            marginTop: 4,
            marginBottom: 4,
            fontSize: 10,
            color: "#888",
            textAlign: "center",
            letterSpacing: "0.1em",
          }}
        >
          ▾
        </div>
        <ClipTrackSvg
          label="Newer"
          subtitle="(to)"
          pairs={pairs}
          maxTime={maxTime}
          laneCount={laneCount}
          side="to"
        />

        <Legend />
        <ChangedClipList pairs={pairs} />
      </div>
    </section>
  );
}

const TRACK_LANE_H = 22;
const TRACK_LANE_GAP = 2;

function ClipTrackSvg({
  label,
  subtitle,
  pairs,
  maxTime,
  laneCount,
  side,
}: {
  label: string;
  subtitle: string;
  pairs: ClipPair[];
  maxTime: number;
  laneCount: number;
  side: "from" | "to";
}) {
  const totalH = laneCount * (TRACK_LANE_H + TRACK_LANE_GAP);
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#1a1a1a",
          marginBottom: 4,
          display: "flex",
          gap: 6,
          alignItems: "baseline",
        }}
      >
        <span>{label}</span>
        <span
          style={{ color: "#888", fontWeight: 500, fontFamily: '"SF Mono", monospace' }}
        >
          {subtitle}
        </span>
      </div>
      <svg
        viewBox={`0 0 1000 ${totalH}`}
        preserveAspectRatio="none"
        style={{
          width: "100%",
          height: totalH,
          background: "#1a1a1a",
          border: "1px solid #1a1a1a",
          display: "block",
        }}
      >
        {/* Lane backgrounds */}
        {Array.from({ length: laneCount }).map((_, lane) => (
          <rect
            key={`bg-${lane}`}
            x={0}
            y={lane * (TRACK_LANE_H + TRACK_LANE_GAP)}
            width={1000}
            height={TRACK_LANE_H}
            fill={lane % 2 === 0 ? "#222" : "#1a1a1a"}
          />
        ))}
        {/* Clips */}
        {pairs.map((p, i) => {
          const clip = side === "from" ? p.from : p.to;
          if (!clip) return null;
          // For "added" clips we hide on the from side; "removed" hidden on to side.
          if (side === "from" && p.kind === "added") return null;
          if (side === "to" && p.kind === "removed") return null;
          const x = (clip.offset / maxTime) * 1000;
          const w = Math.max((clip.duration / maxTime) * 1000, 2);
          const y = clip.lane * (TRACK_LANE_H + TRACK_LANE_GAP);
          const fill = KIND_COLORS[p.kind];
          return (
            <g key={`${side}-${i}`}>
              <rect
                x={x}
                y={y}
                width={w}
                height={TRACK_LANE_H}
                fill={fill}
                stroke="#f0f0e8"
                strokeWidth={0.5}
                opacity={p.kind === "unchanged" ? 0.55 : 0.95}
              >
                <title>
                  {clipTitle(clip, p.kind)}
                </title>
              </rect>
              {w > 50 ? (
                <text
                  x={x + 4}
                  y={y + TRACK_LANE_H / 2 + 4}
                  fontSize={10}
                  fill="#f0f0e8"
                  fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                  fontWeight={600}
                  style={{ pointerEvents: "none" }}
                >
                  {truncate(clip.name || "(unnamed)", Math.max(4, Math.floor(w / 7)))}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function clipTitle(clip: NormalizedClip, kind: ClipKind): string {
  return (
    `${clip.name || "(unnamed)"}\n` +
    `lane ${clip.lane}\n` +
    `${clip.offset.toFixed(2)}s → ${(clip.offset + clip.duration).toFixed(2)}s\n` +
    `duration ${clip.duration.toFixed(2)}s\n` +
    `state: ${KIND_LABELS[kind]}`
  );
}

function Legend() {
  const items: Array<[ClipKind, string]> = [
    ["unchanged", "unchanged"],
    ["moved", "moved"],
    ["resized", "resized"],
    ["both", "moved + resized"],
    ["added", "new"],
    ["removed", "removed"],
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        marginTop: 8,
        fontSize: 11,
        color: "#444",
      }}
    >
      {items.map(([kind, label]) => (
        <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 10,
              height: 10,
              background: KIND_COLORS[kind],
              display: "inline-block",
              border: "1px solid #1a1a1a",
            }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

function ChangedClipList({ pairs }: { pairs: ClipPair[] }) {
  const interesting = pairs.filter((p) => p.kind !== "unchanged");
  if (interesting.length === 0) return null;
  return (
    <details style={{ marginTop: 10 }}>
      <summary
        style={{
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 700,
          color: "#1a1a1a",
          padding: "4px 0",
        }}
      >
        {interesting.length} clip{interesting.length === 1 ? "" : "s"} changed —
        details
      </summary>
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          fontFamily: '"SF Mono", monospace',
          color: "#1a1a1a",
        }}
      >
        {interesting.map((p, i) => (
          <div
            key={i}
            style={{
              padding: "3px 0",
              borderBottom: "1px solid #ddd",
              display: "flex",
              gap: 8,
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                color: "#f0f0e8",
                background: KIND_COLORS[p.kind],
                fontSize: 9,
                fontWeight: 700,
                padding: "1px 5px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                minWidth: 70,
                textAlign: "center",
              }}
            >
              {KIND_LABELS[p.kind]}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {p.from?.name || p.to?.name || "(unnamed)"}
              {p.from && p.to ? (
                <span style={{ color: "#666", marginLeft: 6 }}>
                  {p.from.offset.toFixed(2)}s→{p.to.offset.toFixed(2)}s ·{" "}
                  {p.from.duration.toFixed(2)}s→{p.to.duration.toFixed(2)}s
                </span>
              ) : p.from ? (
                <span style={{ color: "#666", marginLeft: 6 }}>
                  was {p.from.offset.toFixed(2)}s, {p.from.duration.toFixed(2)}s
                </span>
              ) : p.to ? (
                <span style={{ color: "#666", marginLeft: 6 }}>
                  now {p.to.offset.toFixed(2)}s, {p.to.duration.toFixed(2)}s
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

// ─── Domain summary grid for non-cut domains ──────────────────────────────

interface DomainDelta {
  added: number;
  removed: number;
  unchanged: number;
}

function DomainSummaryGrid({
  color,
  audio,
  effects,
  markers,
}: {
  color: DomainDelta;
  audio: DomainDelta;
  effects: DomainDelta;
  markers: DomainDelta;
}) {
  const rows: Array<{ title: string; delta: DomainDelta; verb: string }> = [
    { title: "Color", delta: color, verb: "corrections" },
    { title: "Audio", delta: audio, verb: "adjustments" },
    { title: "Effects", delta: effects, verb: "effects" },
    { title: "Markers", delta: markers, verb: "markers" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        marginTop: 6,
      }}
    >
      {rows.map((r) => {
        const total = r.delta.added + r.delta.removed;
        return (
          <div
            key={r.title}
            style={{
              border: "2px solid #1a1a1a",
              background: total === 0 ? "#e8e8e0" : "#f0f0e8",
            }}
          >
            <div
              style={{
                padding: "3px 8px",
                background: "#1a1a1a",
                color: "#f0f0e8",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.05em",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{r.title.toUpperCase()}</span>
              <span style={{ opacity: 0.7, fontWeight: 600 }}>
                {total === 0
                  ? "no changes"
                  : `${r.delta.added > 0 ? `+${r.delta.added}` : ""}${r.delta.removed > 0 ? ` −${r.delta.removed}` : ""}`}
              </span>
            </div>
            {total === 0 ? null : (
              <div style={{ padding: "4px 8px", fontSize: 12 }}>
                {r.delta.added > 0 ? (
                  <div style={{ color: "#2d5a2d" }}>+ {r.delta.added} {r.verb}</div>
                ) : null}
                {r.delta.removed > 0 ? (
                  <div style={{ color: "#b45309" }}>− {r.delta.removed} {r.verb}</div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SnapshotMeta({
  from,
  to,
}: {
  from: SnapshotPayload;
  to: SnapshotPayload;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        fontFamily: '"SF Mono", monospace',
        color: "#666",
        marginBottom: 12,
        lineHeight: 1.5,
      }}
    >
      <div>
        <strong style={{ color: "#888" }}>older</strong> · {from.branch} ·{" "}
        {from.createdByName} · {new Date(from._creationTime).toLocaleString()}{" "}
        · {from.source}
      </div>
      <div>
        <strong style={{ color: "#888" }}>newer</strong> · {to.branch} ·{" "}
        {to.createdByName} · {new Date(to._creationTime).toLocaleString()}{" "}
        · {to.source}
      </div>
    </div>
  );
}

// ─── Diff computation ─────────────────────────────────────────────────────

interface CutCounts {
  added: number;
  removed: number;
  moved: number;
  resized: number;
}

interface FullDiff {
  clipPairs: ClipPair[];
  cutCounts: CutCounts;
  color: DomainDelta;
  audio: DomainDelta;
  effects: DomainDelta;
  markers: DomainDelta;
  totalChanged: number;
}

function computeFullDiff(from: SnapshotPayload, to: SnapshotPayload): FullDiff {
  const fromClips = normalizeClips(parseDomain<{ clips: RawClip[] }>(from.cuts)?.clips ?? []);
  const toClips = normalizeClips(parseDomain<{ clips: RawClip[] }>(to.cuts)?.clips ?? []);
  const { pairs, cutCounts } = matchClips(fromClips, toClips);

  return {
    clipPairs: pairs,
    cutCounts,
    color: deltaForLists(
      parseDomain<{ corrections: unknown[] }>(from.color)?.corrections ?? [],
      parseDomain<{ corrections: unknown[] }>(to.color)?.corrections ?? [],
      (c) => JSON.stringify(c),
    ),
    audio: deltaForLists(
      parseDomain<{ adjustments: Array<{ kind?: string; amount?: string }> }>(from.audio)
        ?.adjustments ?? [],
      parseDomain<{ adjustments: Array<{ kind?: string; amount?: string }> }>(to.audio)
        ?.adjustments ?? [],
      (a) => `${a.kind ?? ""}|${a.amount ?? ""}`,
    ),
    effects: deltaForLists(
      parseDomain<{ items: Array<{ kind?: string; name?: string; duration?: string }> }>(from.effects)
        ?.items ?? [],
      parseDomain<{ items: Array<{ kind?: string; name?: string; duration?: string }> }>(to.effects)
        ?.items ?? [],
      (fx) => `${fx.kind ?? ""}|${fx.name ?? ""}|${fx.duration ?? ""}`,
    ),
    markers: deltaForLists(
      parseDomain<{ items: Array<{ start?: string; value?: string }> }>(from.markers)?.items ?? [],
      parseDomain<{ items: Array<{ start?: string; value?: string }> }>(to.markers)?.items ?? [],
      (m) => `${m.start ?? ""}|${m.value ?? ""}`,
    ),
    totalChanged:
      cutCounts.added + cutCounts.removed + cutCounts.moved + cutCounts.resized,
  };
}

function parseDomain<T>(jsonString: string): T | null {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return null;
  }
}

function deltaForLists<T>(
  fromList: T[],
  toList: T[],
  keyFn: (item: T) => string,
): DomainDelta {
  const fromKeys = new Set(fromList.map(keyFn));
  const toKeys = new Set(toList.map(keyFn));
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const k of toKeys) {
    if (fromKeys.has(k)) unchanged++;
    else added++;
  }
  for (const k of fromKeys) {
    if (!toKeys.has(k)) removed++;
  }
  return { added, removed, unchanged };
}

function normalizeClips(raw: RawClip[]): NormalizedClip[] {
  return raw.map((c) => ({
    name: c.name ?? "",
    ref: c.ref ?? "",
    lane: parseInt(c.lane ?? "0", 10) || 0,
    offset: fcpxmlTimeToSeconds(c.offset),
    duration: fcpxmlTimeToSeconds(c.duration),
    start: fcpxmlTimeToSeconds(c.start),
    audioRole: c.audio_role ?? "",
  }));
}

function fcpxmlTimeToSeconds(t: string | null | undefined): number {
  if (!t) return 0;
  // FCPXML rational time: "1234/30s" or "60s" or "0s".
  const m = t.match(/^([0-9.]+)(?:\/([0-9.]+))?s$/);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const den = m[2] ? parseFloat(m[2]) : 1;
  return den === 0 ? 0 : num / den;
}

function matchClips(
  fromClips: NormalizedClip[],
  toClips: NormalizedClip[],
): { pairs: ClipPair[]; cutCounts: CutCounts } {
  const keyOf = (c: NormalizedClip) =>
    `${c.name}|${c.ref}|${c.lane}|${c.audioRole}`;
  const fromByKey = new Map<string, NormalizedClip[]>();
  const toByKey = new Map<string, NormalizedClip[]>();
  for (const c of fromClips) {
    const arr = fromByKey.get(keyOf(c)) ?? [];
    arr.push(c);
    fromByKey.set(keyOf(c), arr);
  }
  for (const c of toClips) {
    const arr = toByKey.get(keyOf(c)) ?? [];
    arr.push(c);
    toByKey.set(keyOf(c), arr);
  }

  const usedFrom = new Set<NormalizedClip>();
  const usedTo = new Set<NormalizedClip>();
  const pairs: ClipPair[] = [];
  let moved = 0;
  let resized = 0;

  // Within each key bucket, pair by closest offset (handles duplicates).
  for (const [key, fromList] of fromByKey) {
    const toList = toByKey.get(key) ?? [];
    if (toList.length === 0) continue;
    // Sort both lists by offset and zip greedily.
    const fromSorted = [...fromList].sort((a, b) => a.offset - b.offset);
    const toSorted = [...toList].sort((a, b) => a.offset - b.offset);
    while (fromSorted.length && toSorted.length) {
      const fc = fromSorted.shift()!;
      // pick the to-clip closest to fc.offset that's not yet used
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < toSorted.length; i++) {
        const d = Math.abs(toSorted[i].offset - fc.offset);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const tc = toSorted.splice(bestIdx, 1)[0];
      usedFrom.add(fc);
      usedTo.add(tc);

      const wasMoved = Math.abs(fc.offset - tc.offset) > 0.0001;
      const wasResized = Math.abs(fc.duration - tc.duration) > 0.0001;
      let kind: ClipKind = "unchanged";
      if (wasMoved && wasResized) kind = "both";
      else if (wasMoved) kind = "moved";
      else if (wasResized) kind = "resized";

      if (wasMoved) moved++;
      if (wasResized) resized++;

      pairs.push({ from: fc, to: tc, kind, lane: tc.lane });
    }
  }

  // Removed: in from, not used
  let removed = 0;
  for (const fc of fromClips) {
    if (!usedFrom.has(fc)) {
      pairs.push({ from: fc, to: null, kind: "removed", lane: fc.lane });
      removed++;
    }
  }
  // Added: in to, not used
  let added = 0;
  for (const tc of toClips) {
    if (!usedTo.has(tc)) {
      pairs.push({ from: null, to: tc, kind: "added", lane: tc.lane });
      added++;
    }
  }

  return {
    pairs,
    cutCounts: { added, removed, moved, resized },
  };
}

function truncate(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
