import { ConvexClient } from "convex/browser";
import { useEffect, useState } from "react";
import { api, SyncProgress } from "./api";
import { callMutation, useConvexQuery } from "./useConvex";
import { TimelinesView } from "./TimelinesView";

interface Snapshot {
  project: {
    _id: string;
    name: string;
    teamId: string;
    teamSlug: string;
    rootS3Prefix: string;
    hasContract: boolean;
  };
  latest: {
    _id: string;
    folderName: string;
    versionNumber: number;
    s3Prefix: string;
    label: string | null;
  } | null;
  versions: Array<{
    _id: string;
    folderName: string;
    versionNumber: number;
    label: string | null;
    s3Prefix: string;
    isLatest: boolean;
    sizeBytes: number | null;
  }>;
}

interface Props {
  client: ConvexClient | null;
  projectId: string;
  rootDir: string;
  onBack: () => void;
}

function joinPath(...parts: string[]): string {
  return parts
    .map((p, i) => (i === 0 ? p.replace(/\/+$/, "") : p.replace(/^\/+|\/+$/g, "")))
    .filter((p) => p.length > 0)
    .join("/");
}

export function ProjectDetail({ client, projectId, rootDir, onBack }: Props) {
  const snapshot = useConvexQuery<Snapshot | null>(
    client,
    "projectVersions:desktopSnapshotForProject",
    { projectId },
  );

  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [busy, setBusy] = useState<null | "pull" | "push">(null);
  const [error, setError] = useState<string | null>(null);
  const [pushLabel, setPushLabel] = useState("");
  const [pushFolderName, setPushFolderName] = useState("");

  useEffect(() => {
    return api.sync.onProgress((p) => setProgress(p));
  }, []);

  if (snapshot === undefined) {
    return <div style={{ color: "#888" }}>Loading project…</div>;
  }
  if (snapshot === null) {
    return (
      <div>
        <button className="ghost" onClick={onBack} style={{ marginBottom: 12 }}>
          ← Back
        </button>
        <div style={{ color: "#888" }}>Project not found.</div>
      </div>
    );
  }

  const localFolder = joinPath(rootDir, snapshot.project.name);
  const latest = snapshot.latest;

  const handlePull = async (target: {
    s3Prefix: string;
    folderName?: string;
    isRoot?: boolean;
  }) => {
    setBusy("pull");
    setError(null);
    setProgress(null);
    try {
      // Root pulls land directly in <projectName>/ so contract.docx +
      // every folder sit side-by-side. Folder pulls go into <folderName>/.
      const local = target.isRoot
        ? localFolder
        : joinPath(localFolder, target.folderName ?? "version");
      await api.sync.pull({ s3Prefix: target.s3Prefix, localPath: local });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pull failed.");
    } finally {
      setBusy(null);
    }
  };

  const handlePush = async () => {
    if (!client) return;
    const folderRaw =
      pushFolderName.trim() || `final_v${(latest?.versionNumber ?? 0) + 1}`;
    const localPath = joinPath(localFolder, folderRaw);

    setBusy("push");
    setError(null);
    setProgress(null);
    try {
      // Create the version row FIRST so the server can sanitize the folder
      // name and tell us where to upload. Avoids race conditions on naming.
      const created = await callMutation<{
        _id: string;
        versionNumber: number;
        folderName: string;
        s3Prefix: string;
      }>(client, "projectVersions:create", {
        projectId,
        folderName: folderRaw,
        label: pushLabel.trim() || undefined,
        setAsLatest: true,
      });
      const result = await api.sync.push({
        s3Prefix: created.s3Prefix,
        localPath,
      });
      // Patch the row with the measured sizes (no separate mutation yet,
      // so for now we just leave them — could add a `recordSize` mutation
      // later). The size displays show null until that's wired.
      void result;
      setPushFolderName("");
      setPushLabel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Push failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleMarkLatest = async (versionId: string) => {
    if (!client) return;
    setError(null);
    try {
      await callMutation(client, "projectVersions:markLatest", { versionId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark latest.");
    }
  };

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button className="ghost" onClick={onBack}>
          ← Back
        </button>
        <h2 style={{ margin: 0, fontWeight: 900, letterSpacing: "-0.02em" }}>
          {snapshot.project.name}
        </h2>
      </div>

      <section style={{ border: "2px solid #1a1a1a", padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>
              PROJECT FOLDER
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>
              {snapshot.project.name}
              {snapshot.project.hasContract ? (
                <span
                  style={{
                    color: "#2d5a2d",
                    fontSize: 11,
                    fontWeight: 800,
                    marginLeft: 8,
                    border: "2px solid #2d5a2d",
                    padding: "1px 5px",
                    verticalAlign: "middle",
                  }}
                >
                  CONTRACT
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
              Latest: {latest ? `v${latest.versionNumber}` : "—"}
              {latest?.label ? (
                <span style={{ marginLeft: 6 }}>· {latest.label}</span>
              ) : null}
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
              Mirrors to: <code>{localFolder}/</code>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <button
              onClick={() =>
                void handlePull({
                  s3Prefix: snapshot.project.rootS3Prefix,
                  isRoot: true,
                })
              }
              disabled={busy !== null}
              title="Pull contract.docx and every version subfolder"
            >
              {busy === "pull" ? "Pulling…" : "Pull project (all)"}
            </button>
            <button
              className="ghost"
              onClick={() =>
                latest &&
                void handlePull({
                  s3Prefix: latest.s3Prefix,
                  folderName: latest.folderName,
                })
              }
              disabled={!latest || busy !== null}
              title="Pull just the latest folder"
            >
              {latest ? `Pull ${latest.folderName}` : "No latest"}
            </button>
            <button
              className="ghost"
              onClick={() => void api.shell.openFolder(localFolder)}
            >
              Open folder
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid #ccc",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>
            PUSH A NEW VERSION FOLDER
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              placeholder={`final_v${(latest?.versionNumber ?? 0) + 1}`}
              value={pushFolderName}
              onChange={(e) => setPushFolderName(e.target.value)}
              style={{ flex: 1 }}
              title="Folder name (letters / digits / . _ -). Spaces become underscores."
            />
            <input
              placeholder="Label (optional)"
              value={pushLabel}
              onChange={(e) => setPushLabel(e.target.value)}
              style={{ flex: 1 }}
            />
            <button onClick={() => void handlePush()} disabled={busy !== null}>
              {busy === "push" ? "Pushing…" : "Push"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#888" }}>
            Files in <code>{localFolder}/{pushFolderName || `final_v${(latest?.versionNumber ?? 0) + 1}`}/</code> upload to that folder and become the latest version.
          </div>
        </div>

        {progress ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            {progress.done
              ? `Done — ${progress.current}/${progress.total} files`
              : `${progress.kind === "pull" ? "Downloading" : "Uploading"} ${progress.current}/${progress.total} — ${progress.file ?? ""}`}
          </div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 10, color: "#dc2626", fontSize: 13 }}>{error}</div>
        ) : null}
      </section>

      <section style={{ border: "2px solid #1a1a1a" }}>
        <header
          style={{
            padding: "6px 12px",
            borderBottom: "2px solid #1a1a1a",
            background: "#1a1a1a",
            color: "#f0f0e8",
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          VERSION HISTORY
        </header>
        {snapshot.versions.length === 0 ? (
          <div style={{ padding: 14, color: "#888" }}>
            No versions yet. Drop files in <code>{localFolder}/v1/</code> and push.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {snapshot.versions.map((v) => (
              <li
                key={v._id}
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid #ccc",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }} className="mono">
                    {v.folderName}
                    {v.label ? (
                      <span style={{ color: "#888", fontWeight: 500, marginLeft: 6 }}>
                        {v.label}
                      </span>
                    ) : null}
                    {v.isLatest ? (
                      <span
                        style={{
                          marginLeft: 8,
                          background: "#2d5a2d",
                          color: "#f0f0e8",
                          padding: "2px 6px",
                          fontSize: 10,
                          fontWeight: 800,
                        }}
                      >
                        LATEST
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11, color: "#888" }}>
                    push #{v.versionNumber}
                  </div>
                </div>
                <button
                  className="ghost"
                  onClick={() =>
                    void handlePull({
                      s3Prefix: v.s3Prefix,
                      folderName: v.folderName,
                    })
                  }
                  disabled={busy !== null}
                >
                  Pull
                </button>
                {!v.isLatest ? (
                  <button
                    className="ghost"
                    onClick={() => void handleMarkLatest(v._id)}
                  >
                    Set latest
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <TimelinesView client={client} projectId={projectId} />
    </div>
  );
}
