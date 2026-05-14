import { useEffect, useRef, useState } from "react";
import { api, DesktopSettings, MountPrereqs, MountState } from "./api";

interface Props {
  settings: DesktopSettings;
}

/**
 * One-click mount UI. Wraps the rclone subprocess managed by the Electron
 * main process and surfaces its lifecycle as Mount / Unmount with a live
 * log tail. The same drive layout you'd get from the manual rclone
 * recipe in docs/MOUNTING.md — minus the Terminal commands.
 */
export function MountView({ settings }: Props) {
  const [state, setState] = useState<MountState | null>(null);
  const [prereqs, setPrereqs] = useState<MountPrereqs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    void api.mount.status().then(setState);
    void api.mount.prereqs().then(setPrereqs);
    return api.mount.onStatus((next) => setState(next));
  }, []);

  useEffect(() => {
    // Auto-scroll log to bottom.
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state?.log]);

  const status = state?.status ?? "unmounted";
  const mountPath = state?.mountPath ?? settings.rootDir;
  const isActive = status === "mounted" || status === "mounting";
  const hasPrereqs = Boolean(prereqs?.rclone && prereqs?.fuse);
  const canMount = hasPrereqs && Boolean(
    settings.storage.bucket &&
      settings.storage.accessKeyId &&
      settings.storage.secretAccessKey &&
      settings.storage.endpoint,
  );

  const handleMount = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.mount.start({ mountPath });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mount failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleUnmount = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.mount.stop();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unmount failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenInFinder = async () => {
    if (mountPath) await api.shell.openFolder(mountPath);
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <header style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            color: "#888",
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}
        >
          MOUNT AS DRIVE
        </div>
        <h2
          style={{
            margin: "2px 0 4px",
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: "-0.02em",
          }}
        >
          {labelForStatus(status)}
        </h2>
        <p style={{ margin: 0, color: "#666", fontSize: 13 }}>
          Streams your S3 / R2 bucket as a real Mac volume so Finder,
          Premiere, and Resolve see project files natively — no manual pull.
          One mount per machine.
        </p>
      </header>

      <PrereqPanel prereqs={prereqs} />

      <section
        style={{
          border: "2px solid #1a1a1a",
          background: isActive ? "#dde6dd" : "#e8e8e0",
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <StatusDot status={status} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {state?.mountPath ?? "Not mounted"}
            </div>
            <div
              style={{
                fontFamily: '"SF Mono", Menlo, monospace',
                fontSize: 11,
                color: "#666",
                marginTop: 2,
              }}
            >
              {settings.storage.provider}:{settings.storage.bucket || "(no bucket)"}/projects
              {state?.pid ? ` · pid ${state.pid}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {status === "mounted" || status === "mounting" ? (
              <button onClick={() => void handleUnmount()} disabled={busy}>
                {status === "mounting" ? "Cancel" : "Unmount"}
              </button>
            ) : (
              <button
                onClick={() => void handleMount()}
                disabled={busy || !canMount}
                title={
                  !canMount
                    ? hasPrereqs
                      ? "Configure storage credentials first"
                      : "Install rclone + FUSE driver first"
                    : undefined
                }
              >
                {busy ? "Mounting…" : "Mount"}
              </button>
            )}
            {status === "mounted" ? (
              <button className="ghost" onClick={() => void handleOpenInFinder()}>
                Open in Finder
              </button>
            ) : null}
          </div>
        </div>

        {error || state?.lastError ? (
          <div
            style={{
              marginTop: 10,
              padding: 8,
              border: "1px solid #dc2626",
              color: "#7f1d1d",
              fontSize: 12,
              background: "#fff",
            }}
          >
            {error || state?.lastError}
          </div>
        ) : null}
      </section>

      <section style={{ border: "2px solid #1a1a1a" }}>
        <header
          style={{
            background: "#1a1a1a",
            color: "#f0f0e8",
            padding: "6px 12px",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.05em",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>RCLONE LOG</span>
          <span style={{ fontFamily: "monospace", fontWeight: 600, opacity: 0.6 }}>
            tail -30
          </span>
        </header>
        <pre
          ref={logRef}
          style={{
            margin: 0,
            padding: 10,
            fontSize: 11,
            fontFamily: '"SF Mono", Menlo, monospace',
            background: "#f0f0e8",
            color: "#1a1a1a",
            maxHeight: 220,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {state?.log?.length
            ? state.log.join("\n")
            : "(no log yet — click Mount to start)"}
        </pre>
      </section>

      <p style={{ fontSize: 11, color: "#888", marginTop: 14 }}>
        See <code>docs/MOUNTING.md</code> for performance tuning + alternatives
        (Mountpoint for S3, LucidLink). Mounts use FUSE under the hood — same
        caveats as any FUSE volume: no file locking across machines, random
        seek perf depends on local cache.
      </p>
    </div>
  );
}

function labelForStatus(s: MountState["status"]): string {
  switch (s) {
    case "mounted":
      return "Drive is mounted.";
    case "mounting":
      return "Mounting…";
    case "unmounting":
      return "Unmounting…";
    case "error":
      return "Mount error.";
    case "unmounted":
    default:
      return "Not mounted.";
  }
}

function StatusDot({ status }: { status: MountState["status"] }) {
  const color =
    status === "mounted"
      ? "#2d5a2d"
      : status === "mounting" || status === "unmounting"
        ? "#b45309"
        : status === "error"
          ? "#dc2626"
          : "#888";
  return (
    <div
      style={{
        width: 16,
        height: 16,
        background: color,
        border: "2px solid #1a1a1a",
        flexShrink: 0,
      }}
    />
  );
}

function PrereqPanel({ prereqs }: { prereqs: MountPrereqs | null }) {
  if (!prereqs) {
    return null;
  }
  if (prereqs.rclone && prereqs.fuse) {
    return (
      <section
        style={{
          border: "2px solid #2d5a2d",
          background: "#dde6dd",
          padding: 8,
          marginBottom: 14,
          fontSize: 12,
        }}
      >
        ✓ Prerequisites installed (rclone + FUSE).
      </section>
    );
  }
  return (
    <section
      style={{
        border: "2px solid #b45309",
        background: "#f5e9d8",
        padding: 12,
        marginBottom: 14,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
        Install these once before mounting:
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
        <li style={{ color: prereqs.rclone ? "#2d5a2d" : "#7f1d1d" }}>
          {prereqs.rclone ? "✓" : "✗"} rclone
        </li>
        <li style={{ color: prereqs.fuse ? "#2d5a2d" : "#7f1d1d" }}>
          {prereqs.fuse ? "✓" : "✗"}{" "}
          {prereqs.platform === "darwin"
            ? "macFUSE (requires kernel-extension approval after install)"
            : prereqs.platform === "win32"
              ? "WinFsp"
              : "FUSE"}
        </li>
      </ul>
      <pre
        style={{
          background: "#1a1a1a",
          color: "#f0f0e8",
          fontFamily: '"SF Mono", Menlo, monospace',
          fontSize: 11,
          padding: 8,
          marginTop: 8,
          marginBottom: 0,
          border: "2px solid #1a1a1a",
        }}
      >
        {prereqs.installHint}
      </pre>
    </section>
  );
}
