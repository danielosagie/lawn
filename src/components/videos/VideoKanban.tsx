"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { Link } from "@tanstack/react-router";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { videoPath } from "@/lib/routes";
import { formatDuration, formatRelativeTime, cn } from "@/lib/utils";
import { Clock, Eye, MessageSquare } from "lucide-react";

type WorkflowStatus = "review" | "rework" | "done";

interface VideoLike {
  _id: Id<"videos">;
  _creationTime: number;
  title: string;
  description?: string;
  uploaderName: string;
  duration?: number;
  thumbnailUrl?: string;
  status: string;
  workflowStatus: WorkflowStatus;
  commentCount?: number;
}

interface Props {
  teamSlug: string;
  projectId: Id<"projects">;
  videos: VideoLike[];
  canEdit: boolean;
}

const COLUMNS: Array<{
  status: WorkflowStatus;
  label: string;
  description: string;
  accent: string;
  background: string;
}> = [
  {
    status: "review",
    label: "In Review",
    description: "Sent to client. Waiting on feedback.",
    accent: "#FF6600",
    background: "#e8e8e0",
  },
  {
    status: "rework",
    label: "Needs Rework",
    description: "Client requested changes.",
    accent: "#b45309",
    background: "#f5e9d8",
  },
  {
    status: "done",
    label: "Done",
    description: "Approved. Ready for delivery.",
    accent: "#1a1a1a",
    background: "#dde6dd",
  },
];

export function VideoKanban({ teamSlug, projectId, videos, canEdit }: Props) {
  const updateStatus = useMutation(api.videos.updateWorkflowStatus);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<WorkflowStatus | null>(null);

  const onDragStart = useCallback(
    (videoId: Id<"videos">) => (e: React.DragEvent) => {
      if (!canEdit) return;
      setDraggingId(videoId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", videoId);
    },
    [canEdit],
  );

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setOverColumn(null);
  }, []);

  const onColumnDragOver = useCallback(
    (status: WorkflowStatus) => (e: React.DragEvent) => {
      if (!canEdit || !draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overColumn !== status) setOverColumn(status);
    },
    [canEdit, draggingId, overColumn],
  );

  const onColumnDrop = useCallback(
    (status: WorkflowStatus) => async (e: React.DragEvent) => {
      e.preventDefault();
      const videoId = e.dataTransfer.getData("text/plain") as Id<"videos">;
      setDraggingId(null);
      setOverColumn(null);
      if (!videoId || !canEdit) return;
      const video = videos.find((v) => v._id === videoId);
      if (!video || video.workflowStatus === status) return;
      try {
        await updateStatus({ videoId, workflowStatus: status });
      } catch (err) {
        console.error("Failed to update workflow status", err);
      }
    },
    [canEdit, updateStatus, videos],
  );

  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = videos.filter((v) => v.workflowStatus === col.status);
        const isOver = overColumn === col.status;
        return (
          <div
            key={col.status}
            onDragOver={onColumnDragOver(col.status)}
            onDrop={onColumnDrop(col.status)}
            onDragLeave={() =>
              overColumn === col.status ? setOverColumn(null) : undefined
            }
            className={cn(
              "border-2 border-[#1a1a1a] flex flex-col min-h-[300px] transition-colors",
              isOver ? "bg-[#FFB380]/30" : "",
            )}
            style={{ background: isOver ? undefined : col.background }}
          >
            <header
              className="px-3 py-2 border-b-2 border-[#1a1a1a] flex items-center justify-between"
              style={{ background: col.accent, color: "#f0f0e8" }}
            >
              <div>
                <div className="font-black text-sm tracking-tight">
                  {col.label}
                </div>
                <div className="text-[10px] font-mono opacity-80">
                  {col.description}
                </div>
              </div>
              <div className="font-mono text-lg font-black">{items.length}</div>
            </header>

            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              {items.length === 0 ? (
                <div className="text-xs text-[#888] px-1 py-3">
                  {canEdit ? "Drop a video here." : "No videos."}
                </div>
              ) : (
                items.map((video) => (
                  <KanbanCard
                    key={video._id}
                    teamSlug={teamSlug}
                    projectId={projectId}
                    video={video}
                    canEdit={canEdit}
                    dragging={draggingId === video._id}
                    onDragStart={onDragStart(video._id)}
                    onDragEnd={onDragEnd}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  teamSlug,
  projectId,
  video,
  canEdit,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  teamSlug: string;
  projectId: Id<"projects">;
  video: VideoLike;
  canEdit: boolean;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const isReady = video.status === "ready";
  return (
    <article
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "border-2 border-[#1a1a1a] bg-[#f0f0e8] transition-opacity",
        dragging ? "opacity-40" : "opacity-100",
        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default",
      )}
    >
      <Link
        to={videoPath(teamSlug, projectId, video._id)}
        className="block"
        onClick={(e) => {
          // Suppress link nav while dragging.
          if (dragging) e.preventDefault();
        }}
      >
        <div className="aspect-video bg-[#1a1a1a] relative overflow-hidden border-b-2 border-[#1a1a1a]">
          {video.thumbnailUrl?.startsWith("http") ? (
            <img
              src={video.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="h-full w-full bg-[#1a1a1a]" />
          )}
          {video.duration ? (
            <div className="absolute bottom-1 right-1 bg-[#1a1a1a]/85 text-[#f0f0e8] text-[10px] font-mono px-1.5 py-0.5">
              {formatDuration(video.duration)}
            </div>
          ) : null}
          {!isReady ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[#f0f0e8] text-xs font-bold uppercase">
              {video.status}
            </div>
          ) : null}
        </div>
        <div className="p-2.5">
          <div className="font-bold text-sm text-[#1a1a1a] truncate">
            {video.title}
          </div>
          {video.description ? (
            <div className="text-xs text-[#888] truncate mt-0.5">
              {video.description}
            </div>
          ) : null}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-[#888]">
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {video.uploaderName}
            </span>
            {typeof video.commentCount === "number" ? (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {video.commentCount}
              </span>
            ) : null}
            <span className="flex items-center gap-1 ml-auto">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(video._creationTime)}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
