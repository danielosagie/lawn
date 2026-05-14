"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  ChevronDown,
  GitBranch,
  Film,
  Sparkles,
  Clock,
  Database,
  Box,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface Props {
  projectId: Id<"projects">;
  canEdit: boolean;
}

/**
 * Timeline-snapshot history for a project — snip's vit-style version
 * history. Each row is a single push from the Resolve plugin (or a
 * manual tag from the dashboard). Branch chip on the left, message in
 * the middle, source + size on the right.
 *
 * Drill-down (per-domain diff view) is not in this round — that becomes
 * a side panel once we have a snapshot detail page.
 */
export function TimelineHistory({ projectId, canEdit }: Props) {
  const snapshots = useQuery(api.timelines.list, { projectId, limit: 30 });
  const branches = useQuery(api.timelines.listBranches, { projectId });
  const createManual = useMutation(api.timelines.createManual);

  const [filterBranch, setFilterBranch] = useState<string | null>(null);
  const [tagging, setTagging] = useState(false);
  const [tagMessage, setTagMessage] = useState("");

  const handleTag = async () => {
    if (!tagMessage.trim()) return;
    setTagging(true);
    try {
      await createManual({
        projectId,
        message: tagMessage.trim(),
        branch: filterBranch ?? undefined,
      });
      setTagMessage("");
    } finally {
      setTagging(false);
    }
  };

  if (snapshots === undefined || branches === undefined) {
    return (
      <div className="text-sm text-[#888] py-3">Loading timeline history…</div>
    );
  }

  const filtered = filterBranch
    ? snapshots.filter((s) => s.branch === filterBranch)
    : snapshots;

  if (snapshots.length === 0) {
    return (
      <div className="border-2 border-[#1a1a1a] p-6 bg-[#e8e8e0]">
        <div className="flex items-start gap-3">
          <Film className="h-5 w-5 mt-0.5 text-[#888]" />
          <div className="flex-1">
            <div className="font-black text-sm">No timeline snapshots yet</div>
            <div className="text-xs text-[#666] mt-1">
              Install the DaVinci Resolve plugin (
              <code>plugins/resolve/install.sh</code>) and push a snapshot from
              <strong> Workspace → Workflow Integrations → snip-vit</strong>.
              Each push captures the timeline as domain-split JSON (cuts /
              color / audio / effects / markers) so editors and colorists can
              branch + merge without stepping on each other.
            </div>
          </div>
        </div>
        {canEdit ? (
          <div className="mt-4 pt-3 border-t-2 border-[#1a1a1a] flex gap-2">
            <input
              value={tagMessage}
              onChange={(e) => setTagMessage(e.target.value)}
              placeholder="Or tag a manual milestone…"
              className="flex-1 px-2 py-1 border-2 border-[#1a1a1a] bg-[#f0f0e8] text-sm"
            />
            <button
              type="button"
              onClick={() => void handleTag()}
              disabled={!tagMessage.trim() || tagging}
              className="px-3 py-1 border-2 border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8] text-xs font-bold uppercase tracking-wider disabled:opacity-40"
            >
              {tagging ? "Tagging…" : "Tag"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-2 border-[#1a1a1a]">
      <header
        className="px-3 py-2 border-b-2 border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8] flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider">
          <Film className="h-3.5 w-3.5" />
          Timeline history
          <span className="font-mono font-normal opacity-60">
            {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"}
          </span>
        </div>
        <BranchPicker
          branches={branches}
          selected={filterBranch}
          onSelect={setFilterBranch}
        />
      </header>

      <ul className="divide-y divide-[#ccc] max-h-[480px] overflow-y-auto">
        {filtered.map((s, i) => (
          <li
            key={s._id}
            className="px-3 py-2.5 hover:bg-[#e8e8e0] transition-colors flex items-start gap-3"
          >
            <div className="flex-shrink-0 mt-0.5">
              {s.source === "resolve" ? (
                <Film className="h-4 w-4 text-[#FF6600]" />
              ) : s.source === "premiere" ? (
                <Box className="h-4 w-4 text-[#b45309]" />
              ) : (
                <Sparkles className="h-4 w-4 text-[#888]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[#1a1a1a] truncate">
                  {s.message}
                </span>
                {i === 0 ? (
                  <span className="text-[9px] font-mono font-bold uppercase bg-[#FF6600] text-[#f0f0e8] px-1.5 py-0.5">
                    HEAD
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-[#666]">
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {s.branch}
                </span>
                <span>·</span>
                <span>{s.createdByName}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(s._creationTime)}
                </span>
                {s.sizeBytes != null ? (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      {formatBytes(s.sizeBytes)}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="text-[10px] font-mono text-[#888] uppercase tracking-wider flex-shrink-0">
              {s.source}
            </div>
          </li>
        ))}
      </ul>

      {canEdit ? (
        <div className="px-3 py-2 border-t-2 border-[#1a1a1a] bg-[#e8e8e0] flex gap-2">
          <input
            value={tagMessage}
            onChange={(e) => setTagMessage(e.target.value)}
            placeholder="Tag a milestone (e.g. 'final delivery v3 approved')"
            className="flex-1 px-2 py-1 border-2 border-[#1a1a1a] bg-[#f0f0e8] text-xs"
          />
          <button
            type="button"
            onClick={() => void handleTag()}
            disabled={!tagMessage.trim() || tagging}
            className="px-3 py-1 border-2 border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8] text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
          >
            {tagging ? "Tagging…" : "Tag"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BranchPicker({
  branches,
  selected,
  onSelect,
}: {
  branches: Array<{ branch: string; count: number; tipAt: number }>;
  selected: string | null;
  onSelect: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-2 py-1 bg-[#f0f0e8] text-[#1a1a1a] text-[10px] font-bold uppercase tracking-wider"
      >
        <GitBranch className="h-3 w-3" />
        {selected ?? "all branches"}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 min-w-[180px] z-40 bg-[#f0f0e8] border-2 border-[#1a1a1a]">
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#e8e8e0] text-xs font-bold"
            >
              all branches
            </button>
            {branches.map((b) => (
              <button
                key={b.branch}
                type="button"
                onClick={() => {
                  onSelect(b.branch);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#e8e8e0] text-xs font-mono flex items-center justify-between"
              >
                <span>{b.branch}</span>
                <span className="text-[#888]">{b.count}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
