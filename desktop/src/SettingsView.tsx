import { useState } from "react";
import { api, DesktopSettings } from "./api";

interface Props {
  settings: DesktopSettings;
  onChange: (next: DesktopSettings) => Promise<void>;
  firstRun?: boolean;
}

export function SettingsView({ settings, onChange, firstRun }: Props) {
  const [draft, setDraft] = useState<DesktopSettings>(settings);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onChange(draft);
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof DesktopSettings>(key: K, value: DesktopSettings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const setStorage = <K extends keyof DesktopSettings["storage"]>(
    key: K,
    value: DesktopSettings["storage"][K],
  ) => {
    setDraft((d) => ({ ...d, storage: { ...d.storage, [key]: value } }));
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {firstRun ? (
        <div style={{
          background: "#2d5a2d", color: "#f0f0e8", padding: 14, marginBottom: 18,
          border: "2px solid #1a1a1a", fontSize: 13,
        }}>
          <strong>First run.</strong> Configure your Convex deployment, auth token,
          and object-storage credentials below. You can grab the Convex URL and a
          session token from the web app.
        </div>
      ) : null}

      <Section title="Convex">
        <Field label="Deployment URL">
          <input
            type="url"
            placeholder="https://your-app.convex.cloud"
            value={draft.convexUrl}
            onChange={(e) => setField("convexUrl", e.target.value.trim())}
            style={{ width: "100%" }}
          />
        </Field>
        <Field label="Session token (Clerk JWT from web app)">
          <textarea
            placeholder="eyJhbGc..."
            rows={3}
            value={draft.convexAuthToken}
            onChange={(e) => setField("convexAuthToken", e.target.value.trim())}
            style={{ width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
          />
        </Field>
        <p style={{ fontSize: 11, color: "#888", margin: "4px 0 0" }}>
          Get a token by opening the web app's developer tools → Application → Cookies
          → look for the Clerk session token. Future versions will deep-link.
        </p>
      </Section>

      <Section title="Object storage">
        <Field label="Provider">
          <select
            value={draft.storage.provider}
            onChange={(e) => setStorage("provider", e.target.value as "r2" | "railway")}
          >
            <option value="r2">Cloudflare R2</option>
            <option value="railway">Railway S3</option>
          </select>
        </Field>
        <Field label="Bucket name">
          <input
            value={draft.storage.bucket}
            onChange={(e) => setStorage("bucket", e.target.value.trim())}
            style={{ width: "100%" }}
          />
        </Field>
        <Field label="Endpoint URL">
          <input
            value={draft.storage.endpoint}
            placeholder={
              draft.storage.provider === "r2"
                ? "https://<account>.r2.cloudflarestorage.com"
                : "https://bucket-production.up.railway.app"
            }
            onChange={(e) => setStorage("endpoint", e.target.value.trim())}
            style={{ width: "100%" }}
          />
        </Field>
        <Field label="Access key ID">
          <input
            value={draft.storage.accessKeyId}
            onChange={(e) => setStorage("accessKeyId", e.target.value.trim())}
            style={{ width: "100%" }}
          />
        </Field>
        <Field label="Secret access key">
          <input
            type="password"
            value={draft.storage.secretAccessKey}
            onChange={(e) => setStorage("secretAccessKey", e.target.value.trim())}
            style={{ width: "100%" }}
          />
        </Field>
        <Field label="Region">
          <input
            value={draft.storage.region}
            onChange={(e) => setStorage("region", e.target.value.trim())}
            placeholder={draft.storage.provider === "r2" ? "auto" : "us-east-1"}
            style={{ width: 180 }}
          />
        </Field>
      </Section>

      <Section title="Local mirror">
        <Field label="Root folder">
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={draft.rootDir}
              onChange={(e) => setField("rootDir", e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="ghost"
              onClick={async () => {
                const picked = await api.dialog.pickFolder();
                if (picked) setField("rootDir", picked);
              }}
            >
              Choose…
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#888", margin: "4px 0 0" }}>
            Each project mirrors as <code>&lt;rootDir&gt;/&lt;project&gt;/&lt;folderName&gt;/</code>. Point this at your mount path below if you go that route.
          </p>
        </Field>
      </Section>

      <Section title="Mount as drive (advanced)">
        <p style={{ fontSize: 12, color: "#1a1a1a", margin: "0 0 8px" }}>
          Mount the whole bucket so Finder / Premiere / Resolve see your
          projects without an explicit pull. See{" "}
          <code>docs/MOUNTING.md</code> for the full setup. Quick recipe
          using your saved credentials:
        </p>
        <MountCommandPreview settings={draft} />
        <p style={{ fontSize: 11, color: "#888", margin: "8px 0 0" }}>
          Run this in Terminal after installing rclone + macFUSE
          (<code>brew install rclone macfuse</code>) and approving the
          macFUSE kernel extension in System Settings.
        </p>
      </Section>

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        <button className="ghost" onClick={() => setDraft(settings)} disabled={saving}>
          Discard
        </button>
      </div>
    </div>
  );
}

function MountCommandPreview({ settings }: { settings: DesktopSettings }) {
  const s = settings.storage;
  const endpoint = s.endpoint || "<endpoint>";
  const bucket = s.bucket || "<bucket>";
  const accessKey = s.accessKeyId || "<R2_ACCESS_KEY_ID>";
  const secretKey = s.secretAccessKey ? "<SECRET-FROM-SETTINGS>" : "<R2_SECRET_ACCESS_KEY>";
  const mountAt = settings.rootDir || "~/VideoInfra";

  const lines = [
    "# 1. Configure rclone remote (one-time, run rclone config interactively or this scripted form):",
    `rclone config create videoinfra s3 \\`,
    `  provider Cloudflare \\`,
    `  access_key_id "${accessKey}" \\`,
    `  secret_access_key "${secretKey}" \\`,
    `  region auto \\`,
    `  endpoint "${endpoint}"`,
    "",
    "# 2. Mount it:",
    `mkdir -p "${mountAt}"`,
    `rclone mount "videoinfra:${bucket}/projects" "${mountAt}" \\`,
    `  --vfs-cache-mode writes \\`,
    `  --vfs-cache-max-size 50G \\`,
    `  --vfs-write-back 5s \\`,
    `  --vfs-read-ahead 128M \\`,
    `  --vfs-read-chunk-size 32M \\`,
    `  --buffer-size 32M \\`,
    `  --dir-cache-time 60s \\`,
    `  --transfers 4 \\`,
    `  --daemon`,
    "",
    "# 3. Unmount when done:",
    `umount "${mountAt}"`,
  ];

  const text = lines.join("\n");
  return (
    <div style={{ position: "relative" }}>
      <pre
        style={{
          fontFamily: '"SF Mono", Menlo, Consolas, monospace',
          fontSize: 11,
          background: "#1a1a1a",
          color: "#f0f0e8",
          padding: 12,
          border: "2px solid #1a1a1a",
          overflowX: "auto",
          margin: 0,
        }}
      >
        {text}
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text);
        }}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          padding: "2px 8px",
          fontSize: 11,
        }}
      >
        Copy
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: "2px solid #1a1a1a", padding: 14, marginBottom: 14 }}>
      <h3 style={{ margin: "0 0 10px", fontWeight: 900, letterSpacing: "-0.01em" }}>{title}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4, fontWeight: 700 }}>
        {label.toUpperCase()}
      </div>
      {children}
    </label>
  );
}
