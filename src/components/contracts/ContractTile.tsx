"use client";

import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  FileSignature,
  Check,
  AlertCircle,
  FileText,
  Send,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { Id } from "@convex/_generated/dataModel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Contract {
  signedAt?: number;
  sentForSignatureAt?: number;
  clientName?: string;
  priceCents?: number;
  currency?: string;
  lastSavedAt?: number;
  docxS3Key?: string;
}

interface Props {
  teamSlug: string;
  projectId: Id<"projects">;
  projectName: string;
  contract?: Contract | null;
  /** When true (admin/member), the hover menu shows a delete option. */
  canDelete?: boolean;
}

/**
 * Project's contract surfaced as a first-class tile in the project grid —
 * looks like a video card, behaves like a file. Clicking opens the
 * full-page Ghost-style editor at `/dashboard/<slug>/<projectId>/contract`.
 *
 * Drag works like a video tile (HTML5 `draggable`); we don't act on the
 * drag yet (no destinations to move TO), but the affordance is there so
 * folders + files feel consistent.
 */
export function ContractTile({
  teamSlug,
  projectId,
  projectName,
  contract,
  canDelete,
}: Props) {
  const clearContract = useMutation(api.projects.clearContract);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        `Delete the contract for "${projectName}"? You'll be able to redraft it later.`,
      )
    ) {
      return;
    }
    try {
      await clearContract({ projectId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't delete contract.");
    }
  };

  const status = contract?.signedAt
    ? "signed"
    : contract?.sentForSignatureAt
      ? "sent"
      : contract
        ? "draft"
        : "missing";

  const headline =
    status === "signed"
      ? "Signed"
      : status === "sent"
        ? "Awaiting signature"
        : status === "draft"
          ? "Draft"
          : "Tap to draft";

  const subtext = contract?.clientName
    ? `Client: ${contract.clientName}`
    : status === "missing"
      ? "Statement of Work"
      : "Statement of Work";

  return (
    <Link
      to={`/dashboard/${teamSlug}/${projectId}/contract`}
      className="group flex flex-col cursor-pointer"
      draggable
      onDragStart={(e) => {
        // Drag data — useful if we later add a "drop on signature box" target.
        e.dataTransfer.setData(
          "application/x-videoinfra-contract",
          JSON.stringify({ projectId, teamSlug }),
        );
        e.dataTransfer.effectAllowed = "copyMove";
      }}
    >
      <div
        className="relative aspect-video overflow-hidden border-2 border-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--shadow-color)] group-hover:translate-y-[2px] group-hover:translate-x-[2px] group-hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] transition-all flex items-center justify-center"
        style={{
          background:
            status === "signed"
              ? "#FF6600"
              : status === "sent"
                ? "#b45309"
                : status === "draft"
                  ? "#e8e8e0"
                  : "#1a1a1a",
        }}
      >
        <FileSignature
          className={
            "h-16 w-16 " +
            (status === "draft"
              ? "text-[#1a1a1a]/80"
              : "text-[#f0f0e8]")
          }
        />
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-[#f0f0e8] text-[#1a1a1a] text-[10px] font-mono font-bold uppercase tracking-wider">
          .docx
        </div>
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {status === "signed" ? (
            <span className="px-1.5 py-0.5 bg-[#f0f0e8] text-[#FF6600] text-[10px] font-bold uppercase inline-flex items-center gap-1">
              <Check className="h-3 w-3" />
              Signed
            </span>
          ) : status === "sent" ? (
            <span className="px-1.5 py-0.5 bg-[#f0f0e8] text-[#b45309] text-[10px] font-bold uppercase inline-flex items-center gap-1">
              <Send className="h-3 w-3" />
              Sent
            </span>
          ) : status === "missing" ? (
            <span className="px-1.5 py-0.5 bg-[#dc2626] text-[#f0f0e8] text-[10px] font-bold uppercase inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Missing
            </span>
          ) : null}
        </div>
        {contract?.docxS3Key ? (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-[#FF6600] text-[#f0f0e8] text-[9px] font-mono font-bold uppercase">
            in folder
          </div>
        ) : null}
        {canDelete && contract ? (
          <div
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.preventDefault()}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center bg-black/60 hover:bg-black/80 text-white"
                  aria-label="Contract menu"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => void handleDelete(e)}
                  className="text-[#dc2626] focus:text-[#dc2626]"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete contract
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
      <div className="mt-3">
        <h3 className="font-black text-sm text-[#1a1a1a] truncate group-hover:underline">
          Contract — {projectName}
        </h3>
        <div className="flex items-center gap-2 mt-1 text-xs text-[#888]">
          <FileText className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{headline}</span>
          <span className="ml-auto truncate">{subtext}</span>
        </div>
        {contract?.priceCents && contract.currency ? (
          <div className="text-[11px] font-mono text-[#888] mt-1">
            {(contract.priceCents / 100).toFixed(2)}{" "}
            {contract.currency.toUpperCase()}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
