"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import {
  Plus,
  Upload,
  FolderPlus,
  FileSignature,
  Check,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Compact "Add" dropdown that lives in the DashboardHeader on a
 * project page. Three actions: upload files, create a folder, jump
 * to the contract editor. Mutations are owned here so the caller
 * only has to pass identity (`projectId`, current folder) and the
 * uploader hook.
 */

interface Props {
  projectId: Id<"projects">;
  currentFolderId: Id<"folders"> | null;
  onAddFiles: () => void;
  contractHref: string;
  contractState: "none" | "draft" | "awaiting" | "signed";
}

export function ProjectAddButton({
  projectId,
  currentFolderId,
  onAddFiles,
  contractHref,
  contractState,
}: Props) {
  const createFolder = useMutation(api.folders.create);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const handleAddFolder = async () => {
    if (creatingFolder) return;
    const raw = prompt("Folder name", "Untitled folder");
    if (!raw) return;
    setCreatingFolder(true);
    try {
      await createFolder({
        projectId,
        name: raw,
        parentFolderId: currentFolderId ?? undefined,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't create folder.");
    } finally {
      setCreatingFolder(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8] text-xs font-bold uppercase tracking-wider hover:bg-[#FF6600] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuItem onClick={onAddFiles}>
          <Upload className="mr-2 h-4 w-4" />
          Add files
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void handleAddFolder()}
          disabled={creatingFolder}
        >
          <FolderPlus className="mr-2 h-4 w-4" />
          Add folder
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to={contractHref}
            className="flex items-center w-full cursor-pointer"
          >
            {contractState === "signed" ? (
              <Check className="mr-2 h-4 w-4 text-[#FF6600]" />
            ) : (
              <FileSignature className="mr-2 h-4 w-4" />
            )}
            {contractState === "signed"
              ? "View signed contract"
              : contractState === "awaiting"
                ? "Contract — awaiting signature"
                : contractState === "draft"
                  ? "Edit contract"
                  : "Add contract"}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
