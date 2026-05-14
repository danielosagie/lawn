// Electron main process. Plain CJS so it runs without a build step.
// Talks to the renderer (React UI in src/) via IPC.

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const { spawn, execSync } = require("node:child_process");

const DEV_URL = "http://localhost:5300";
const PROD_INDEX = path.join(__dirname, "dist/index.html");

const SETTINGS_DIR = path.join(app.getPath("userData"));
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

// ---- Settings persistence ----------------------------------------------------

const DEFAULT_SETTINGS = {
  convexUrl: "",
  convexAuthToken: "",
  storage: {
    provider: "r2", // "r2" | "railway"
    bucket: "",
    endpoint: "",
    accessKeyId: "",
    secretAccessKey: "",
    region: "auto",
  },
  rootDir: path.join(app.getPath("home"), "VideoInfra"),
  // Mount on app launch if the previous session was mounted. Set to true
  // whenever the user clicks "Mount" and false on explicit "Unmount" so the
  // app respects intent on next launch.
  autoMount: false,
};

async function loadSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings) {
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ---- S3 helpers --------------------------------------------------------------

function makeS3(settings) {
  // Lazy import so a build without creds set still launches.
  const { S3Client } = require("@aws-sdk/client-s3");
  const s = settings.storage;
  return new S3Client({
    region: s.region || "auto",
    endpoint: s.endpoint || undefined,
    credentials: {
      accessKeyId: s.accessKeyId,
      secretAccessKey: s.secretAccessKey,
    },
    forcePathStyle: s.provider === "railway",
  });
}

async function listPrefix(s3, bucket, prefix) {
  const { ListObjectsV2Command } = require("@aws-sdk/client-s3");
  const out = [];
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      out.push({ key: obj.Key, size: obj.Size, etag: obj.ETag, lastModified: obj.LastModified });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function downloadObject(s3, bucket, key, destPath) {
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const stream = res.Body;
  const writer = fssync.createWriteStream(destPath);
  await new Promise((resolve, reject) => {
    stream.pipe(writer);
    stream.on("error", reject);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function uploadFile(s3, bucket, key, filePath) {
  const { Upload } = require("@aws-sdk/lib-storage");
  const stream = fssync.createReadStream(filePath);
  const upload = new Upload({
    client: s3,
    params: { Bucket: bucket, Key: key, Body: stream },
  });
  await upload.done();
}

async function walkLocal(dir) {
  const out = [];
  async function recurse(d, base) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(d, entry.name);
      const rel = path.relative(base, full);
      if (entry.isDirectory()) {
        await recurse(full, base);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        out.push({ relPath: rel, size: stat.size, path: full });
      }
    }
  }
  if (fssync.existsSync(dir)) {
    await recurse(dir, dir);
  }
  return out;
}

// ---- IPC handlers ------------------------------------------------------------

let mainWindow = null;
function reportProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync:progress", payload);
  }
}

ipcMain.handle("settings:get", async () => loadSettings());
ipcMain.handle("settings:set", async (_event, next) => {
  await saveSettings(next);
  return next;
});

ipcMain.handle("dialog:pick-folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("shell:open-external", async (_event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle("sync:pull", async (_event, { s3Prefix, localPath }) => {
  const settings = await loadSettings();
  if (!settings.storage.bucket) throw new Error("Storage bucket not configured.");
  const s3 = makeS3(settings);
  const objects = await listPrefix(s3, settings.storage.bucket, s3Prefix);
  let done = 0;
  for (const obj of objects) {
    const relKey = obj.key.slice(s3Prefix.length);
    if (!relKey || relKey.endsWith("/")) continue;
    const dest = path.join(localPath, relKey);
    reportProgress({ kind: "pull", current: done, total: objects.length, file: relKey });
    await downloadObject(s3, settings.storage.bucket, obj.key, dest);
    done++;
  }
  reportProgress({ kind: "pull", current: done, total: objects.length, file: null, done: true });
  return { fileCount: done };
});

ipcMain.handle("sync:push", async (_event, { s3Prefix, localPath }) => {
  const settings = await loadSettings();
  if (!settings.storage.bucket) throw new Error("Storage bucket not configured.");
  const s3 = makeS3(settings);
  const files = await walkLocal(localPath);
  let done = 0;
  let totalBytes = 0;
  for (const f of files) {
    const key = `${s3Prefix.replace(/\/$/, "")}/${f.relPath.split(path.sep).join("/")}`;
    reportProgress({ kind: "push", current: done, total: files.length, file: f.relPath });
    await uploadFile(s3, settings.storage.bucket, key, f.path);
    done++;
    totalBytes += f.size;
  }
  reportProgress({ kind: "push", current: done, total: files.length, file: null, done: true });
  return { fileCount: done, sizeBytes: totalBytes };
});

ipcMain.handle("local:open-folder", async (_event, folderPath) => {
  await shell.openPath(folderPath);
});

// ─── Mount as drive (rclone wrapper, LucidLink-style UX) ─────────────────────
//
// Single-tenant mount inside this Electron process. We spawn rclone as a
// long-lived child with --daemon=false so we own the lifecycle: on app quit
// we kill the process and umount the path. Output is streamed back to the
// renderer so the UI can surface "still mounting", errors, etc.

let mountState = {
  status: "unmounted", // "unmounted" | "mounting" | "mounted" | "error"
  mountPath: null,
  pid: null,
  lastError: null,
  log: [],
};
let mountChild = null;

function emitMountStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("mount:status", { ...mountState, log: mountState.log.slice(-30) });
  }
}

function pushLog(line) {
  mountState.log.push(`${new Date().toISOString().slice(11, 19)}  ${line}`);
  if (mountState.log.length > 200) mountState.log.shift();
  emitMountStatus();
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "pipe", shell: "/bin/bash" });
    return true;
  } catch {
    return false;
  }
}

function checkMountPrereqs() {
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";
  return {
    platform: process.platform,
    rclone: commandExists("rclone"),
    // macFUSE on macOS, WinFsp on Windows, kernel FUSE elsewhere.
    fuse: isMac
      ? fssync.existsSync("/Library/Filesystems/macfuse.fs")
      : isWin
        ? fssync.existsSync("C:\\Program Files (x86)\\WinFsp")
        : true,
    installHint: isMac
      ? "brew install rclone macfuse  (then approve macFUSE in System Settings → Privacy & Security)"
      : isWin
        ? "winget install Rclone.Rclone  +  install WinFsp from winfsp.dev"
        : "Install rclone via your package manager.",
  };
}

ipcMain.handle("mount:prereqs", async () => checkMountPrereqs());
ipcMain.handle("mount:status", async () => ({
  ...mountState,
  log: mountState.log.slice(-30),
}));

async function persistAutoMount(value) {
  try {
    const current = await loadSettings();
    await saveSettings({ ...current, autoMount: value });
  } catch (e) {
    console.error("Failed to persist autoMount flag", e);
  }
}

async function startMount({ mountPath } = {}) {
  if (mountChild) {
    throw new Error("Already mounting / mounted. Stop the current mount first.");
  }
  const settings = await loadSettings();
  const s = settings.storage;
  if (!s.bucket || !s.accessKeyId || !s.secretAccessKey || !s.endpoint) {
    throw new Error(
      "Storage credentials incomplete — fill in bucket, endpoint, access key, secret in Settings.",
    );
  }
  const prereqs = checkMountPrereqs();
  if (!prereqs.rclone || !prereqs.fuse) {
    throw new Error(
      `Missing prerequisites — ${!prereqs.rclone ? "rclone " : ""}${!prereqs.fuse ? "FUSE driver " : ""}not found. Install: ${prereqs.installHint}`,
    );
  }

  const targetPath = mountPath || settings.rootDir;
  await fs.mkdir(targetPath, { recursive: true });

  mountState = {
    status: "mounting",
    mountPath: targetPath,
    pid: null,
    lastError: null,
    log: [],
  };
  emitMountStatus();
  pushLog(`Mounting ${s.provider}:${s.bucket}/projects → ${targetPath}`);

  // Env-based rclone config. No file is written; rclone reads
  // RCLONE_CONFIG_<NAME>_<FIELD> at runtime. We use the remote name
  // "videoinfra" inline below.
  const env = {
    ...process.env,
    RCLONE_CONFIG_VIDEOINFRA_TYPE: "s3",
    RCLONE_CONFIG_VIDEOINFRA_PROVIDER: s.provider === "r2" ? "Cloudflare" : "Other",
    RCLONE_CONFIG_VIDEOINFRA_ACCESS_KEY_ID: s.accessKeyId,
    RCLONE_CONFIG_VIDEOINFRA_SECRET_ACCESS_KEY: s.secretAccessKey,
    RCLONE_CONFIG_VIDEOINFRA_ENDPOINT: s.endpoint,
    RCLONE_CONFIG_VIDEOINFRA_REGION: s.region || "auto",
    RCLONE_CONFIG_VIDEOINFRA_ACL: "private",
  };

  // VFS tuned for LucidLink-style streaming on NLE workloads:
  //  • vfs-cache-mode full   — cache read blocks on disk so revisits are local
  //  • multi-thread-streams  — parallel range reads on big files (the single
  //                            biggest win over default rclone for video)
  //  • aggressive read-ahead — seekers + playheads stay ahead of the decoder
  //  • long dir cache        — Resolve/Premiere rescan bins constantly
  //  • fast fingerprint      — skip slow per-file ETag checks on cache hits
  //
  // We still tell rclone to prefer mmap and disable mtime metadata pulls
  // since they're a hot path for finder/Resolve listings. The whole stanza
  // mirrors docs/MOUNTING.md + the Settings “Mount command” preview so
  // editors can copy/paste it for ad-hoc terminal mounts.
  const args = [
    "mount",
    `videoinfra:${s.bucket}/projects`,
    targetPath,
    // Cache strategy
    "--vfs-cache-mode", "full",
    "--vfs-cache-max-size", "100G",
    "--vfs-cache-max-age", "720h",
    "--vfs-cache-min-free-space", "10G",
    "--vfs-fast-fingerprint",
    "--vfs-write-back", "5s",
    // Read tuning
    "--vfs-read-ahead", "256M",
    "--vfs-read-chunk-size", "32M",
    "--vfs-read-chunk-size-limit", "512M",
    "--buffer-size", "64M",
    "--multi-thread-streams", "8",
    "--multi-thread-cutoff", "100M",
    // Dir + listing tuning
    "--dir-cache-time", "5m",
    "--poll-interval", "30s",
    "--no-modtime",
    "--no-checksum",
    // Resilience
    "--low-level-retries", "10",
    "--retries", "3",
    "--timeout", "5m",
    // Misc
    "--transfers", "8",
    "--use-mmap",
    "--allow-other=false",
    "-vv",
  ];

  try {
    mountChild = spawn("rclone", args, { env });
  } catch (e) {
    mountState.status = "error";
    mountState.lastError = e instanceof Error ? e.message : String(e);
    emitMountStatus();
    throw e;
  }

  mountState.pid = mountChild.pid ?? null;
  emitMountStatus();
  // Remember intent so we auto-mount on the next app launch.
  void persistAutoMount(true);

  mountChild.stdout.on("data", (chunk) => {
    chunk
      .toString()
      .split("\n")
      .filter((line) => line.trim())
      .forEach((line) => pushLog(line));
  });
  mountChild.stderr.on("data", (chunk) => {
    chunk
      .toString()
      .split("\n")
      .filter((line) => line.trim())
      .forEach((line) => {
        pushLog(line);
        // rclone prints "The service rclone has been started." or
        // similar on macFUSE. We treat ANY successful directory listing
        // as "mounted" — see the readiness poller below.
      });
  });
  mountChild.on("close", (code) => {
    pushLog(`rclone exited with code ${code}`);
    mountState.status = code === 0 ? "unmounted" : "error";
    mountState.pid = null;
    mountState.lastError =
      code !== 0 && code !== null ? `rclone exited (code ${code})` : null;
    mountChild = null;
    emitMountStatus();
  });
  mountChild.on("error", (err) => {
    mountState.status = "error";
    mountState.lastError = err.message;
    mountChild = null;
    emitMountStatus();
  });

  // Readiness probe — poll the mount point. Once we can stat any subdir,
  // rclone has the FUSE layer up.
  const startedAt = Date.now();
  const ready = setInterval(async () => {
    if (mountState.status !== "mounting") {
      clearInterval(ready);
      return;
    }
    try {
      await fs.readdir(targetPath);
      // readdir succeeds before FUSE attaches too; use statfs to confirm.
      // Simplest heuristic: if rclone is still alive and >2s have passed,
      // call it mounted.
      if (mountChild && Date.now() - startedAt > 2000) {
        mountState.status = "mounted";
        pushLog("Mount appears ready.");
        emitMountStatus();
        clearInterval(ready);
      }
    } catch {
      // mount point not present yet
    }
    if (Date.now() - startedAt > 30_000 && mountState.status === "mounting") {
      mountState.status = "error";
      mountState.lastError = "Mount timed out after 30s. Check log for details.";
      mountChild?.kill();
      clearInterval(ready);
      emitMountStatus();
    }
  }, 500);

  return { status: mountState.status, mountPath: targetPath };
}

ipcMain.handle("mount:start", async (_event, args) => startMount(args || {}));

// ─── Resolve bridge (Python subprocess) ────────────────────────────────────
//
// The desktop app is the ONLY thing that talks to Resolve. Plugin is
// retired. We shell out to a single Python script that handles status /
// export / import via the DaVinciResolveScript API. Each call returns
// exactly one JSON document on stdout.

const RESOLVE_BRIDGE_PATH = path.join(__dirname, "resources", "resolve_bridge.py");

function findPython() {
  // Prefer system python3. We don't bundle our own interpreter — Resolve
  // Studio itself ships a Python and macOS has python3 in /usr/bin. If
  // none is found, we surface a categorized error to the UI.
  const candidates = [
    process.env.LAWN_PYTHON,
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
    "python3",
  ].filter(Boolean);
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: "pipe" });
      return cmd;
    } catch {
      // Try next.
    }
  }
  return null;
}

function spawnResolveBridge(args, { timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const python = findPython();
    if (!python) {
      reject(
        new Error(
          "Couldn't find python3. Install it via `xcode-select --install` " +
            "(macOS) or set LAWN_PYTHON env var to your Python interpreter.",
        ),
      );
      return;
    }
    const child = spawn(python, [RESOLVE_BRIDGE_PATH, ...args], {
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Resolve bridge timed out after ${timeoutMs / 1000}s.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      // The script always prints exactly one JSON object; parse the last
      // non-empty line so any stray debug output before it is ignored.
      const lines = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const lastLine = lines[lines.length - 1] ?? "";
      let parsed;
      try {
        parsed = JSON.parse(lastLine);
      } catch {
        reject(
          new Error(
            `Bridge produced unparseable output. exit=${code}\n` +
              `stdout: ${stdout.slice(-400)}\nstderr: ${stderr.slice(-400)}`,
          ),
        );
        return;
      }
      resolve(parsed);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

ipcMain.handle("resolve:status", async () => {
  return spawnResolveBridge(["status"]);
});

ipcMain.handle("resolve:snapshot", async (_event, { message, branch }) => {
  const settings = await loadSettings();
  if (!settings.convexUrl || !settings.convexAuthToken) {
    throw new Error("Convex URL + auth token must be set in Settings first.");
  }
  const tmpDir = path.join(app.getPath("temp"), "lawn-resolve");
  await fs.mkdir(tmpDir, { recursive: true });
  const fcpxmlPath = path.join(tmpDir, `snapshot-${Date.now()}.fcpxml`);

  // 1. Export FCPXML via the bridge.
  const exported = await spawnResolveBridge(["export", fcpxmlPath]);
  if (!exported.ok) {
    const err = new Error(exported.message || "Export failed.");
    err.category = exported.error;
    throw err;
  }

  // 2. Read + parse the FCPXML into domain JSONs.
  const fcpxmlText = await fs.readFile(fcpxmlPath, "utf8");
  const domains = parseFcpxmlToDomains(fcpxmlText);

  // 3. Forward to Convex via a public mutation. We use plain fetch
  //    because Convex's Node client is overkill for a single call from
  //    Electron; the Convex HTTP `mutation` endpoint accepts the same
  //    shape as the JS client.
  const projectId = settings.activeProjectId;
  if (!projectId) {
    throw new Error("Open a project in the Projects tab so we know where to push the snapshot.");
  }

  const convexUrl = settings.convexUrl.replace(/\/$/, "");
  const mutationUrl = `${convexUrl}/api/mutation`;
  const payload = {
    path: "timelines:createFromDesktop",
    args: {
      projectId,
      cuts: domains.cuts,
      color: domains.color,
      audio: domains.audio,
      effects: domains.effects,
      markers: domains.markers,
      metadata: domains.metadata,
      fcpxml: fcpxmlText,
      branch: branch || undefined,
      message: message || "Update from Resolve",
      sourceProjectId: exported.project_id,
      sourceTimelineId: exported.timeline_id,
    },
    format: "json",
  };
  const resp = await fetch(mutationUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.convexAuthToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Convex mutation failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  const result = await resp.json();
  // Clean up tmp file. Don't await — best-effort.
  void fs.unlink(fcpxmlPath).catch(() => {});
  return result;
});

ipcMain.handle("resolve:restore", async (_event, { fcpxml }) => {
  if (typeof fcpxml !== "string" || !fcpxml) {
    throw new Error("FCPXML payload required.");
  }
  const tmpDir = path.join(app.getPath("temp"), "lawn-resolve");
  await fs.mkdir(tmpDir, { recursive: true });
  const fcpxmlPath = path.join(tmpDir, `restore-${Date.now()}.fcpxml`);
  await fs.writeFile(fcpxmlPath, fcpxml, "utf8");

  const imported = await spawnResolveBridge(["import", fcpxmlPath]);
  void fs.unlink(fcpxmlPath).catch(() => {});
  if (!imported.ok) {
    const err = new Error(imported.message || "Import failed.");
    err.category = imported.error;
    throw err;
  }
  return imported;
});

ipcMain.handle("resolve:set-active-project", async (_event, { projectId }) => {
  const settings = await loadSettings();
  await saveSettings({ ...settings, activeProjectId: projectId });
  return { ok: true };
});

// ─── Premiere bridge (read .prproj from disk) ─────────────────────────────
//
// Premiere doesn't expose an external scripting API like Resolve. But
// its project file `.prproj` is a gzipped XML that contains the full
// timeline state. We don't need a plugin — read the file, decompress,
// parse the relevant elements into our domain shape, upload.
//
// On save: user picks the .prproj file (typically in the same project
// folder we sync via S3). We read whatever Premiere wrote at last save.
//
// On restore: we just hand the user back the original .prproj for them
// to open. Writing a Premiere-valid .prproj from scratch is harder than
// it looks; round-tripping the original blob is the safe play.

const zlib = require("node:zlib");

ipcMain.handle("dialog:pick-prproj", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Premiere project", extensions: ["prproj"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

async function readPrproj(filePath) {
  const buf = await fs.readFile(filePath);
  // .prproj is gzipped XML. If the file isn't gzipped (rare — some old
  // versions or test fixtures), fall back to reading as-is.
  let xmlText;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const inflated = await new Promise((resolve, reject) => {
      zlib.gunzip(buf, (err, out) => (err ? reject(err) : resolve(out)));
    });
    xmlText = inflated.toString("utf8");
  } else {
    xmlText = buf.toString("utf8");
  }
  return xmlText;
}

function parsePrprojToDomains(xmlText) {
  const parsed = xmlParser.parse(xmlText);
  const root = parsed.PremiereData ?? parsed;

  // Sequence clips. Premiere's XML buries them under
  // RootProjectItem → Item (recursive). Walk and collect anything that
  // looks like a clip + its placement. We're permissive here — different
  // Premiere versions emit slightly different element names.
  const clips = [];
  const clipTags = ["ClipProjectItem", "MasterClip", "TrackItem", "VideoClipTrackItem", "AudioClipTrackItem"];
  for (const tag of clipTags) {
    for (const el of findRecursive(root, tag, [])) {
      // Extract whatever placement attributes we can find. Premiere
      // stores these under nested elements rather than attributes.
      const name = el.Name ?? el.MediaName ?? el["@_Name"] ?? null;
      const start = numAttr(el.Start ?? el.StartTime ?? el["@_Start"]);
      const end = numAttr(el.End ?? el.EndTime ?? el["@_End"]);
      const inPoint = numAttr(el.In ?? el.InPoint ?? el["@_In"]);
      clips.push({
        tag,
        name: typeof name === "string" ? name : null,
        offset: start != null ? `${start}s` : null,
        duration:
          start != null && end != null ? `${end - start}s` : null,
        start: inPoint != null ? `${inPoint}s` : null,
        ref: el.MediaPath ?? el["@_MediaPath"] ?? null,
        lane: el.TrackIndex ?? el["@_TrackIndex"] ?? null,
        audio_role: tag.toLowerCase().includes("audio") ? "audio" : null,
      });
    }
  }

  const markers = findRecursive(root, "Marker", []).map((m) => ({
    start: m.Start != null ? `${numAttr(m.Start)}s` : null,
    duration: m.Duration != null ? `${numAttr(m.Duration)}s` : null,
    value: m.Name ?? m.Comments ?? null,
    note: m.Comments ?? null,
    completed: null,
  }));

  const metadata = {
    fcpxml_version: null,
    premiere_version: root["@_Version"] ?? null,
    sequence_count: findRecursive(root, "Sequence", []).length,
    parsed_at: new Date().toISOString(),
  };

  return {
    cuts: JSON.stringify({ clips }),
    color: JSON.stringify({ corrections: [] }),
    audio: JSON.stringify({ adjustments: [] }),
    effects: JSON.stringify({ items: [] }),
    markers: JSON.stringify({ items: markers }),
    metadata: JSON.stringify(metadata),
  };
}

function numAttr(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && value !== null) {
    // Premiere wraps some numbers in element nodes — peek at #text.
    const text = value["#text"];
    if (typeof text === "string") return parseFloat(text);
    if (typeof text === "number") return text;
  }
  return null;
}

ipcMain.handle("premiere:snapshot", async (_event, { filePath, message, branch }) => {
  const settings = await loadSettings();
  if (!settings.convexUrl || !settings.convexAuthToken) {
    throw new Error("Convex URL + auth token must be set in Settings first.");
  }
  if (!settings.activeProjectId) {
    throw new Error("Open a project in the Projects tab so we know where to save the snapshot.");
  }
  const xmlText = await readPrproj(filePath);
  const domains = parsePrprojToDomains(xmlText);

  // We store the .prproj XML in the `fcpxml` field for restore purposes.
  // The name is awkward but renaming the schema column for two source
  // types isn't worth a migration — readers know what they're getting
  // by looking at `source`.
  const convexUrl = settings.convexUrl.replace(/\/$/, "");
  const mutationUrl = `${convexUrl}/api/mutation`;
  const payload = {
    path: "timelines:createFromDesktop",
    args: {
      projectId: settings.activeProjectId,
      cuts: domains.cuts,
      color: domains.color,
      audio: domains.audio,
      effects: domains.effects,
      markers: domains.markers,
      metadata: domains.metadata,
      fcpxml: xmlText,
      branch: branch || undefined,
      message: message || "Update from Premiere",
      sourceProjectId: filePath,
      source: "premiere",
    },
    format: "json",
  };
  const resp = await fetch(mutationUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.convexAuthToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Convex mutation failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  // Now tell Convex this row is `source: "premiere"`. The mutation
  // currently hardcodes "resolve" — patch via a separate mutation in a
  // follow-up; for now we annotate the message instead.
  return resp.json();
});

ipcMain.handle("premiere:restore-download", async (_event, { fcpxml, suggestedName }) => {
  // Save the .prproj XML to disk so the user can open it in Premiere.
  // We re-gzip on write so Premiere accepts it without complaint.
  const result = await dialog.showSaveDialog({
    defaultPath: suggestedName || "restored.prproj",
    filters: [{ name: "Premiere project", extensions: ["prproj"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
  const gz = await new Promise((resolve, reject) => {
    zlib.gzip(Buffer.from(fcpxml, "utf8"), (err, out) =>
      err ? reject(err) : resolve(out),
    );
  });
  await fs.writeFile(result.filePath, gz);
  return { ok: true, path: result.filePath };
});

// ─── FCPXML → domain JSON parser (mirrors plugins/resolve/lawn_vit.py) ────
//
// Lightweight XML walk using fast-xml-parser. We keep the parser tolerant —
// Resolve emits FCPXML 1.10 with quirks across patch versions and we'd
// rather get a partial snapshot than fail on a stray attribute.

const { XMLParser } = require("fast-xml-parser");
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function findRecursive(node, tagName, accumulator) {
  if (node === null || typeof node !== "object") return accumulator;
  for (const key of Object.keys(node)) {
    if (key === tagName) {
      for (const child of asArray(node[key])) accumulator.push(child);
    }
    const val = node[key];
    if (val && typeof val === "object") {
      findRecursive(val, tagName, accumulator);
    }
  }
  return accumulator;
}

function parseFcpxmlToDomains(fcpxml) {
  const parsed = xmlParser.parse(fcpxml);
  const root = parsed.fcpxml ?? parsed;

  // ─── metadata ───
  const formats = findRecursive(root, "format", []);
  const metadata = {
    fcpxml_version: root["@_version"] ?? null,
    formats: formats.map((f) => ({
      id: f["@_id"] ?? null,
      name: f["@_name"] ?? null,
      frame_duration: f["@_frameDuration"] ?? null,
      width: f["@_width"] ?? null,
      height: f["@_height"] ?? null,
    })),
    sequences: findRecursive(root, "sequence", []).map((s) => ({
      duration: s["@_duration"] ?? null,
      tc_format: s["@_tcFormat"] ?? null,
      tc_start: s["@_tcStart"] ?? null,
    })),
  };

  // ─── cuts: spine of clips ───
  const cuts = { clips: [] };
  const spines = findRecursive(root, "spine", []);
  for (const spine of spines) {
    for (const tag of ["clip", "asset-clip", "ref-clip", "gap"]) {
      for (const el of asArray(spine[tag])) {
        cuts.clips.push({
          tag,
          name: el["@_name"] ?? null,
          offset: el["@_offset"] ?? null,
          duration: el["@_duration"] ?? null,
          start: el["@_start"] ?? null,
          ref: el["@_ref"] ?? null,
          lane: el["@_lane"] ?? null,
          audio_role: el["@_audioRole"] ?? null,
        });
      }
    }
  }

  // ─── color ───
  const color = {
    corrections: findRecursive(root, "color-correction", []).map((cc) => ({
      name: cc["@_name"] ?? null,
      params: extractParams(cc),
    })),
  };

  // ─── audio ───
  const audio = {
    adjustments: [
      ...findRecursive(root, "adjust-volume", []).map((a) => ({
        kind: "volume",
        amount: a["@_amount"] ?? null,
      })),
      ...findRecursive(root, "adjust-pan", []).map((a) => ({
        kind: "pan",
        amount: a["@_amount"] ?? null,
      })),
    ],
  };

  // ─── effects ───
  const effects = {
    items: [
      ...findRecursive(root, "filter", []).map((f) => ({
        kind: "filter",
        name: f["@_name"] ?? null,
        ref: f["@_ref"] ?? null,
        params: extractParams(f),
      })),
      ...findRecursive(root, "transition", []).map((t) => ({
        kind: "transition",
        name: t["@_name"] ?? null,
        duration: t["@_duration"] ?? null,
      })),
    ],
  };

  // ─── markers ───
  const markers = {
    items: [
      ...findRecursive(root, "marker", []).map((m) => ({
        start: m["@_start"] ?? null,
        duration: m["@_duration"] ?? null,
        value: m["@_value"] ?? null,
        note: m["@_note"] ?? null,
        completed: m["@_completed"] ?? null,
      })),
      ...findRecursive(root, "chapter-marker", []).map((c) => ({
        type: "chapter",
        start: c["@_start"] ?? null,
        duration: c["@_duration"] ?? null,
        value: c["@_value"] ?? null,
      })),
    ],
  };

  return {
    cuts: JSON.stringify(cuts),
    color: JSON.stringify(color),
    audio: JSON.stringify(audio),
    effects: JSON.stringify(effects),
    markers: JSON.stringify(markers),
    metadata: JSON.stringify(metadata),
  };
}

function extractParams(node) {
  const out = {};
  for (const param of asArray(node.param)) {
    const name = param["@_name"] ?? "(unnamed)";
    out[name] = param["@_value"] ?? null;
  }
  return out;
}

async function umountPath(p) {
  if (!p) return;
  try {
    if (process.platform === "darwin" || process.platform === "linux") {
      execSync(`umount "${p}"`, { stdio: "pipe" });
    } else if (process.platform === "win32") {
      // rclone on Windows uses WinFsp; killing the child detaches the drive.
    }
  } catch {
    // Fall back to diskutil on macOS if `umount` fails (busy / forced).
    try {
      if (process.platform === "darwin") {
        execSync(`diskutil unmount force "${p}"`, { stdio: "pipe" });
      }
    } catch {
      // Last resort — leave it; user can `umount -f` manually.
    }
  }
}

ipcMain.handle("mount:stop", async () => {
  // Explicit unmount = user no longer wants auto-mount next launch.
  void persistAutoMount(false);
  if (!mountChild) {
    mountState.status = "unmounted";
    emitMountStatus();
    return { status: mountState.status };
  }
  pushLog("Unmounting…");
  const targetPath = mountState.mountPath;
  await umountPath(targetPath);
  setTimeout(() => {
    if (mountChild) {
      try {
        mountChild.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }, 3000);
  return { status: "unmounting" };
});

async function tryAutoMount() {
  try {
    const settings = await loadSettings();
    if (!settings.autoMount) return;
    if (
      !settings.storage.bucket ||
      !settings.storage.accessKeyId ||
      !settings.storage.secretAccessKey ||
      !settings.storage.endpoint
    ) {
      // Don't fail silently — log so the user sees why nothing happened.
      console.log("autoMount skipped: storage credentials incomplete");
      return;
    }
    const prereqs = checkMountPrereqs();
    if (!prereqs.rclone || !prereqs.fuse) {
      console.log("autoMount skipped: missing rclone or FUSE");
      return;
    }
    // Defer slightly so the window is up and the renderer is listening
    // for the status events before we kick off rclone.
    setTimeout(() => {
      startMount({ mountPath: settings.rootDir }).catch((e) => {
        console.error("autoMount start failed", e);
      });
    }, 1500);
  } catch (e) {
    console.error("autoMount failed", e);
  }
}

// Best-effort cleanup on quit so we don't leave a half-attached FUSE volume.
app.on("before-quit", async (event) => {
  if (mountChild) {
    event.preventDefault();
    pushLog("App quit — unmounting first.");
    await umountPath(mountState.mountPath);
    try {
      mountChild.kill("SIGTERM");
    } catch {
      // ignore
    }
    // Give it 2s, then quit hard.
    setTimeout(() => app.exit(0), 2000);
  }
});

// ---- Window management -------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f0f0e8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (!app.isPackaged && process.env.NODE_ENV !== "production") {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(PROD_INDEX);
  }
}

app.whenReady().then(() => {
  createWindow();
  void tryAutoMount();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
