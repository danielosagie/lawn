"use client";

import { Link } from "@tanstack/react-router";
import { Id } from "@convex/_generated/dataModel";
import { projectPath } from "@/lib/routes";
import { ArrowRight, FileSignature, Check, Send, Folder } from "lucide-react";

export type ProjectStage =
  | "no-contract"
  | "drafting"
  | "awaiting-signature"
  | "in-production"
  | "delivered";

interface ProjectLike {
  _id: Id<"projects">;
  name: string;
  videoCount: number;
  contract?: {
    sentForSignatureAt?: number;
    signedAt?: number;
  } | null;
}

interface TeamGroup {
  _id: Id<"teams">;
  name: string;
  slug: string;
  projects: ProjectLike[];
}

interface Props {
  teams: TeamGroup[];
}

const COLUMNS: Array<{
  stage: ProjectStage;
  label: string;
  hint: string;
  accent: string;
  background: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    stage: "no-contract",
    label: "No contract",
    hint: "Scoping. Get a contract drafted before work starts.",
    accent: "#888",
    background: "#e8e8e0",
    Icon: Folder,
  },
  {
    stage: "drafting",
    label: "Drafting",
    hint: "Contract drafted, not yet sent.",
    accent: "#1a1a1a",
    background: "#e8e8e0",
    Icon: FileSignature,
  },
  {
    stage: "awaiting-signature",
    label: "Awaiting signature",
    hint: "Sent to client. Following up.",
    accent: "#b45309",
    background: "#f5e9d8",
    Icon: Send,
  },
  {
    stage: "in-production",
    label: "In production",
    hint: "Contract signed. Building deliverables.",
    accent: "#FF6600",
    background: "#dde6dd",
    Icon: Folder,
  },
  {
    stage: "delivered",
    label: "Delivered",
    hint: "Work shipped, contract closed.",
    accent: "#1a1a1a",
    background: "#FFB380",
    Icon: Check,
  },
];

function projectStage(project: ProjectLike): ProjectStage {
  if (!project.contract) return "no-contract";
  if (project.contract.signedAt) {
    // Heuristic: a project counts as "delivered" if it has been signed AND
    // has at least one video in it. Once we wire shareLinks/payments into
    // the dashboard data, we'll upgrade this to "delivered" only when a
    // paywalled link is paid.
    if (project.videoCount > 0) return "in-production";
    return "in-production";
  }
  if (project.contract.sentForSignatureAt) return "awaiting-signature";
  return "drafting";
}

export function ProjectKanban({ teams }: Props) {
  // Flatten all projects across teams, keeping team metadata on each card.
  const flat = teams.flatMap((t) =>
    t.projects.map((p) => ({
      project: p,
      teamSlug: t.slug,
      teamName: t.name,
      stage: projectStage(p),
    })),
  );

  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
      {COLUMNS.map((col) => {
        const items = flat.filter((entry) => entry.stage === col.stage);
        const { Icon } = col;
        return (
          <div
            key={col.stage}
            className="border-2 border-[#1a1a1a] flex flex-col min-h-[300px]"
            style={{ background: col.background }}
          >
            <header
              className="px-3 py-2 border-b-2 border-[#1a1a1a] flex items-center justify-between"
              style={{ background: col.accent, color: "#f0f0e8" }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="h-4 w-4 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-black text-sm tracking-tight truncate">
                    {col.label}
                  </div>
                  <div className="text-[10px] font-mono opacity-80 truncate">
                    {col.hint}
                  </div>
                </div>
              </div>
              <div className="font-mono text-lg font-black">{items.length}</div>
            </header>

            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              {items.length === 0 ? (
                <div className="text-xs text-[#888] px-1 py-3">
                  Empty.
                </div>
              ) : (
                items.map((entry) => (
                  <Link
                    key={entry.project._id}
                    to={projectPath(entry.teamSlug, entry.project._id)}
                    className="block border-2 border-[#1a1a1a] bg-[#f0f0e8] p-2.5 hover:bg-white transition-colors"
                  >
                    <div className="text-[10px] font-mono text-[#888] uppercase tracking-wider truncate">
                      {entry.teamName}
                    </div>
                    <div className="font-bold text-sm text-[#1a1a1a] truncate mt-0.5">
                      {entry.project.name}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-[#888]">
                      <span>
                        {entry.project.videoCount} video
                        {entry.project.videoCount === 1 ? "" : "s"}
                      </span>
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
