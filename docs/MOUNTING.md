# Mounting the project bucket as a local drive

Treat your S3/R2 bucket like a Lucid-style drive — read/write video files
directly through Finder, Premiere, Resolve, etc. with no manual sync. The
mount honors the same folder layout the desktop app pushes:

```
~/VideoInfra/<TeamSlug>/<ProjectID>/
  contract.docx
  final_v1/
  final_v12/
  color_pass_b/
```

You have three reasonable paths, in order of effort. Pick one.

## Option A — Mountpoint for Amazon S3 (recommended for R2 + S3)

Apple-signed, single binary, no FUSE rebuilds. Best fit if you're on R2 or
AWS S3.

### macOS install
```bash
# Mountpoint is AWS's official S3 FUSE client.
brew install mountpoint-s3
```

### Mount
```bash
mkdir -p ~/VideoInfra
mount-s3 \
  --profile videoinfra \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto \
  --allow-overwrite \
  --allow-delete \
  "$R2_BUCKET_NAME" \
  ~/VideoInfra
```

Set the profile once:
```bash
aws configure --profile videoinfra
# AWS Access Key ID: <R2_ACCESS_KEY_ID>
# AWS Secret Access Key: <R2_SECRET_ACCESS_KEY>
# Region: auto
# Output: json
```

### Unmount
```bash
umount ~/VideoInfra
```

### Caveats
- Read perf is great. Random-write perf is OK but not LucidLink-tier.
- No file locking. Don't open the same .prproj/.resolve project from two
  Macs at once.
- No symlinks.

## Option B — rclone mount (works with R2, Railway, anything S3-compatible)

Best for **Railway** because mountpoint-s3 doesn't always handle their
endpoint cleanly. Also works on Linux + Windows.

### macOS install
```bash
brew install rclone macfuse
# macFUSE requires a one-time kernel-extension allow in:
# System Settings → Privacy & Security → "Allow system software from
# developer Benjamin Fleischer"
```
Reboot after enabling macFUSE the first time.

### Configure rclone once
```bash
rclone config
# n) New remote
# name>  videoinfra
# Storage> 5  (s3)
# provider> Cloudflare R2  (or "Other")
# env_auth> false
# access_key_id> <R2_ACCESS_KEY_ID>
# secret_access_key> <R2_SECRET_ACCESS_KEY>
# region> auto
# endpoint> https://<account>.r2.cloudflarestorage.com
# location_constraint>
# acl>
# storage_class>
# y) Yes this is OK
```

### Mount
```bash
mkdir -p ~/VideoInfra
rclone mount \
  "videoinfra:$R2_BUCKET_NAME/projects" \
  ~/VideoInfra \
  --vfs-cache-mode writes \
  --vfs-cache-max-size 50G \
  --vfs-write-back 5s \
  --vfs-read-ahead 128M \
  --vfs-read-chunk-size 32M \
  --dir-cache-time 60s \
  --buffer-size 32M \
  --transfers 4 \
  --daemon
```

Run that in a separate Terminal tab (or with `--daemon` to background it).
Open `~/VideoInfra` in Finder — you should see your project folders.

### Unmount
```bash
umount ~/VideoInfra
# or, if rclone is daemonized:
pkill -f "rclone mount videoinfra"
```

### Caveats
- macFUSE is no longer fully open source post–Big Sur. You'll re-approve
  the kext on macOS upgrades.
- Random-access reads on a cold cache are still slower than a dedicated
  cloud-NAS client like LucidLink; large **read-ahead** and **read chunk**
  sizes (see flags above) narrow the gap for **sequential** playback and
  bin scrolling — the same knobs the snip desktop app uses for **Mount**.
- Don't run two simultaneous editors on the same .prproj. The mount has
  no proper lock primitives.

## Option C — LucidLink (paid)

If you'll have more than 2–3 editors hitting the same project regularly
and need vendor-managed file locking + a globally tuned cache, LucidLink
is the consumer-grade answer for a shared Filespace. List pricing and
capacity live on [lucidlink.com/pricing](https://www.lucidlink.com/pricing).
snip still pairs well: review in the web app, then mount your **own**
bucket with rclone when you want Finder/NLE-native paths.

## How the desktop app fits

The desktop app's **Pull project (all)** button does an explicit copy of
the project tree to a local folder you choose in Settings. That works
without any mount.

Once you've mounted via Option A or B, set the desktop app's **Local
root folder** in Settings to your mount point (e.g. `~/VideoInfra`). Now
the desktop "Pull" buttons become no-ops because the files are already
visible to your OS — Finder, Premiere, Resolve see them directly.

## Recommended layout

```
~/VideoInfra/                       ← mount point
  <team-slug>/
    <project-id>/                   ← what the team sees as one project
      contract.docx                 ← canonical contract
      final_v1/
        master.prproj
        proxies/
        renders/
      final_v12/                    ← editor's working folder
        master.prproj
      color_pass_b/                 ← colorist's branch
        master.drp
```

Each folder = a `projectVersions` row. Mark which one is "latest" in the
project page's version dropdown.
