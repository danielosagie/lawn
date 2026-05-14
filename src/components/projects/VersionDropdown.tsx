"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, FolderClosed, Check, Star } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface Props {
  projectId: Id<"projects">;
  canEdit: boolean;
}

/**
 * Version-folder switcher for the project page. Lists every folder the
 * agency has pushed via the desktop app and lets a member mark a different
 * one as the canonical "latest." Viewers (without member role) see the
 * dropdown read-only — a project history panel they can browse.
 */
export function VersionDropdown({ projectId, canEdit }: Props) {
  const versions = useQuery(api.projectVersions.list, { projectId });
  const markLatest = useMutation(api.projectVersions.markLatest);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Hide the chip entirely until at least one snapshot exists. Empty
  // state is noisy on a fresh project and was confusing users who
  // hadn't installed the desktop app yet.
  if (versions === undefined || versions.length === 0) return null;

  const latest = versions.find((v) => v.isLatest) ?? versions[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 border-2 border-[#1a1a1a] text-xs font-bold uppercase tracking-wider transition-colors",
          open
            ? "bg-[#1a1a1a] text-[#f0f0e8]"
            : "bg-[#f0f0e8] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f0f0e8]",
        )}
      >
        <FolderClosed className="h-3.5 w-3.5" />
        <span className="font-mono normal-case">{latest.folderName}</span>
        {latest.isLatest ? (
          <span
            className={cn(
              "text-[9px] px-1.5 py-0.5 font-bold uppercase",
              open ? "bg-[#f0f0e8] text-[#1a1a1a]" : "bg-[#FF6600] text-[#f0f0e8]",
            )}
          >
            latest
          </span>
        ) : null}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-1 min-w-[320px] max-w-[420px] z-40 bg-[#f0f0e8] border-2 border-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--shadow-color)]">
            <div className="px-3 py-2 border-b-2 border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8] font-black text-xs uppercase tracking-wider">
              Version history
            </div>
            <ul className="max-h-[60vh] overflow-y-auto">
              {versions.map((v) => (
                <li
                  key={v._id}
                  className="border-b border-[#ccc] last:border-b-0"
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <FolderClosed className="h-4 w-4 text-[#888] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm font-bold text-[#1a1a1a] truncate flex items-center gap-1.5">
                        {v.folderName}
                        {v.isLatest ? (
                          <Star className="h-3 w-3 fill-[#FF6600] text-[#FF6600]" />
                        ) : null}
                      </div>
                      <div className="text-[10px] text-[#888] flex items-center gap-2">
                        <span>by {v.createdByName}</span>
                        <span>·</span>
                        <span>push #{v.versionNumber}</span>
                        {v.label ? (
                          <>
                            <span>·</span>
                            <span className="italic truncate">
                              {v.label}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {canEdit && !v.isLatest ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setBusyId(v._id);
                          try {
                            await markLatest({ versionId: v._id });
                          } catch (err) {
                            console.error("markLatest failed", err);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        disabled={busyId !== null}
                        className="text-xs font-bold uppercase tracking-wider text-[#FF6600] hover:text-[#1a1a1a] underline underline-offset-2 disabled:opacity-40"
                      >
                        {busyId === v._id ? "…" : "Set latest"}
                      </button>
                    ) : v.isLatest ? (
                      <Check className="h-4 w-4 text-[#FF6600]" />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
