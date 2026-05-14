"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  ChevronDown,
  History,
  Plus,
  Check,
  Star,
  Upload as UploadIcon,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { videoPath } from "@/lib/routes";

/**
 * Google-Docs-style version picker that lives in the video page's top
 * bar. Wraps the lineage backend: lists every upload in this video's
 * stack, lets the user switch to a different version (navigates to its
 * videoId), mark a different version as the current one, or upload a
 * brand-new version off this one.
 */

interface Props {
  teamSlug: string;
  projectId: Id<"projects">;
  videoId: Id<"videos">;
  canEdit: boolean;
}

export function VideoVersionDropdown({
  teamSlug,
  projectId,
  videoId,
  canEdit,
}: Props) {
  const navigate = useNavigate();
  const versions = useQuery(api.videos.listVersions, { videoId });
  const setCurrent = useMutation(api.videos.setCurrentVersion);
  const createNextVersion = useMutation(api.videos.createNextVersion);
  const getUploadUrl = useAction(api.videoActions.getUploadUrl);
  const markUploadComplete = useAction(api.videoActions.markUploadComplete);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "current" | "upload">(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  if (!versions || versions.length === 0) return null;
  const current = versions.find((v) => v.isCurrentVersion) ?? versions[0];
  const me = versions.find((v) => v._id === videoId);
  const onCurrent = me?._id === current._id;

  const handleSwitch = (targetId: Id<"videos">) => {
    setOpen(false);
    if (targetId === videoId) return;
    navigate({ to: videoPath(teamSlug, projectId, targetId) });
  };

  const handleMarkCurrent = async () => {
    setBusy("current");
    try {
      await setCurrent({ videoId });
    } finally {
      setBusy(null);
    }
  };

  const handleNewVersionFile = async (file: File) => {
    setBusy("upload");
    setUploadProgress(0);
    try {
      const newId = await createNextVersion({
        parentVideoId: videoId,
        fileSize: file.size,
        contentType: file.type || "video/mp4",
      });
      const { url } = await getUploadUrl({
        videoId: newId,
        filename: file.name,
        fileSize: file.size,
        contentType: file.type || "video/mp4",
      });
      // Direct PUT to the presigned S3 URL with progress.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(e.loaded / e.total);
          }
        });
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.send(file);
      });
      await markUploadComplete({ videoId: newId });
      navigate({ to: videoPath(teamSlug, projectId, newId) });
      setOpen(false);
    } catch (e) {
      console.error("Upload-new-version failed", e);
      alert(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
      setUploadProgress(null);
    }
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleNewVersionFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          // Match the rest of the top-bar boxed buttons (h-9, 2px
          // border, brutalist drop-shadow). When open we invert the
          // surface but keep the shadow so it doesn't shift the row.
          "inline-flex items-center gap-1.5 h-9 px-3 border-2 border-[#1a1a1a] text-xs font-bold uppercase tracking-wider transition-all shadow-[4px_4px_0px_0px_var(--shadow-color)] active:translate-y-[2px] active:translate-x-[2px]",
          open
            ? "bg-[#1a1a1a] text-[#f0f0e8]"
            : "bg-[#f0f0e8] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f0f0e8] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
        )}
        title="Switch between versions of this video"
      >
        <History className="h-3.5 w-3.5" />
        <span className="normal-case font-mono">
          v{me?.versionNumber ?? 1}
        </span>
        {onCurrent ? (
          <span
            className={cn(
              "text-[9px] font-bold uppercase tracking-wider px-1 py-0.5",
              open ? "bg-[#f0f0e8] text-[#1a1a1a]" : "bg-[#FF6600] text-[#f0f0e8]",
            )}
          >
            current
          </span>
        ) : null}
        <span className="text-[#888]">·</span>
        <span className="text-[11px] font-mono">
          {versions.length} version{versions.length === 1 ? "" : "s"}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div className="absolute right-0 mt-1 z-40 min-w-[360px] max-w-[460px] bg-[#f0f0e8] border-2 border-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--shadow-color)]">
          <header className="bg-[#1a1a1a] text-[#f0f0e8] px-3 py-2 flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider">
              Versions
            </div>
            <div className="text-[10px] font-mono opacity-60">
              {versions.length} total
            </div>
          </header>

          <ul className="max-h-[60vh] overflow-y-auto">
            {versions.map((v) => {
              const isMe = v._id === videoId;
              const isCurrent = v.isCurrentVersion;
              return (
                <li
                  key={v._id}
                  className={cn(
                    "px-3 py-2.5 border-b border-[#ccc] last:border-b-0 cursor-pointer hover:bg-[#e8e8e0]",
                    isMe ? "bg-[#e8e8e0]" : "",
                  )}
                  onClick={() => handleSwitch(v._id as Id<"videos">)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-[#1a1a1a]">
                      v{v.versionNumber}
                    </span>
                    {isCurrent ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-[#FF6600] text-[#f0f0e8] px-1 py-0.5 inline-flex items-center gap-1">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        current
                      </span>
                    ) : null}
                    {isMe ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-[#1a1a1a] text-[#f0f0e8] px-1 py-0.5">
                        viewing
                      </span>
                    ) : null}
                    {v.status !== "ready" ? (
                      <span className="text-[9px] font-mono uppercase text-[#b45309]">
                        {v.status}
                      </span>
                    ) : null}
                    <span className="ml-auto text-[10px] font-mono text-[#888]">
                      {formatRelativeTime(v._creationTime)}
                    </span>
                  </div>
                  <div className="text-xs text-[#1a1a1a] truncate mt-0.5">
                    {v.versionLabel || v.title}
                  </div>
                  <div className="text-[10px] text-[#888] truncate mt-0.5">
                    by {v.uploaderName}
                  </div>
                </li>
              );
            })}
          </ul>

          {canEdit ? (
            <footer className="px-3 py-2 border-t-2 border-[#1a1a1a] bg-[#e8e8e0] flex flex-col gap-1.5">
              {!onCurrent ? (
                <button
                  type="button"
                  onClick={() => void handleMarkCurrent()}
                  disabled={busy !== null}
                  className="inline-flex items-center justify-center gap-1.5 px-2 py-1 border-2 border-[#1a1a1a] bg-[#FF6600] text-[#f0f0e8] text-[10px] font-bold uppercase tracking-wider hover:bg-[#FF7A1F]"
                >
                  <Check className="h-3 w-3" />
                  {busy === "current"
                    ? "Marking…"
                    : `Make v${me?.versionNumber} the current version`}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy !== null}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1 border-2 border-[#1a1a1a] bg-[#f0f0e8] text-[#1a1a1a] text-[10px] font-bold uppercase tracking-wider hover:bg-[#1a1a1a] hover:text-[#f0f0e8]"
              >
                {busy === "upload" ? (
                  <>
                    <UploadIcon className="h-3 w-3" />
                    Uploading {Math.round((uploadProgress ?? 0) * 100)}%…
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" />
                    Upload new version
                  </>
                )}
              </button>
            </footer>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
