"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ContractEditor } from "./ContractEditor";
import {
  Plus,
  Lock,
  AlertCircle,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tabbed clause editor for structured contracts. Left rail lists every
 * clause as a tab with its state badge; right panel renders the
 * currently-selected clause's body in the existing Tiptap editor.
 *
 * Required clauses are visibly locked (delete is disabled with an
 * explanatory tooltip). Custom clauses can be renamed inline and
 * removed. State changes (draft → pending → accepted → disputed) live
 * on each tab for when we wire the redlining flow next round.
 */

type ClauseState = "draft" | "pending" | "accepted" | "disputed";

interface Clause {
  id: string;
  sectionKey: string;
  title: string;
  bodyHtml: string;
  state: ClauseState;
  required: boolean;
  order: number;
}

interface Props {
  projectId: Id<"projects">;
  clauses: Clause[];
  readOnly?: boolean;
}

const STATE_STYLES: Record<ClauseState, { bg: string; fg: string; label: string }> = {
  draft: { bg: "transparent", fg: "#888", label: "draft" },
  pending: { bg: "#b45309", fg: "#f0f0e8", label: "pending" },
  accepted: { bg: "#FF6600", fg: "#f0f0e8", label: "accepted" },
  disputed: { bg: "#dc2626", fg: "#f0f0e8", label: "disputed" },
};

export function TabbedContractEditor({ projectId, clauses, readOnly }: Props) {
  const updateClauseBody = useMutation(api.contractClauses.updateClauseBody);
  const updateClauseTitle = useMutation(api.contractClauses.updateClauseTitle);
  const removeClause = useMutation(api.contractClauses.removeClause);
  const addCustomClause = useMutation(api.contractClauses.addCustomClause);

  const sorted = useMemo(
    () => [...clauses].sort((a, b) => a.order - b.order),
    [clauses],
  );

  const [activeId, setActiveId] = useState<string | null>(
    sorted[0]?.id ?? null,
  );
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [bodyDraft, setBodyDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const active = sorted.find((c) => c.id === activeId) ?? sorted[0];

  // Reset the body draft whenever the selected clause changes or its
  // canonical content changes from the server (e.g. a co-editor on a
  // different machine saved).
  useEffect(() => {
    if (active) setBodyDraft(active.bodyHtml);
  }, [active?.id, active?.bodyHtml]);

  // Auto-select the first clause once the list loads.
  useEffect(() => {
    if (!activeId && sorted.length > 0) setActiveId(sorted[0].id);
  }, [activeId, sorted]);

  if (sorted.length === 0) {
    return (
      <div className="border-2 border-[#1a1a1a] p-6 text-sm text-[#666]">
        No clauses yet. Run the wizard to draft the contract from project
        terms.
      </div>
    );
  }

  const handleSaveBody = async () => {
    if (!active || readOnly) return;
    if (bodyDraft === active.bodyHtml) return;
    setError(null);
    try {
      await updateClauseBody({
        projectId,
        clauseId: active.id,
        bodyHtml: bodyDraft,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const handleRename = async (clauseId: string) => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setEditingTitleId(null);
      return;
    }
    setError(null);
    try {
      await updateClauseTitle({ projectId, clauseId, title: trimmed });
      setEditingTitleId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed.");
    }
  };

  const handleRemove = async (clauseId: string) => {
    setError(null);
    try {
      await removeClause({ projectId, clauseId });
      if (activeId === clauseId) setActiveId(sorted[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed.");
    }
  };

  const handleAddCustom = async () => {
    const trimmed = newSectionTitle.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const id = await addCustomClause({ projectId, title: trimmed });
      setNewSectionTitle("");
      setAdding(false);
      if (typeof id === "string") setActiveId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add section.");
    }
  };

  const bodyDirty = active ? bodyDraft !== active.bodyHtml : false;

  return (
    <div className="flex border-2 border-[#1a1a1a] bg-[#f0f0e8] min-h-[480px]">
      {/* Left sidebar — clause list */}
      <aside className="w-[240px] border-r-2 border-[#1a1a1a] flex flex-col">
        <header className="px-3 py-2 bg-[#1a1a1a] text-[#f0f0e8] text-[10px] font-black uppercase tracking-wider">
          Contract sections
        </header>
        <ul className="flex-1 overflow-y-auto">
          {sorted.map((c) => {
            const isActive = c.id === activeId;
            const stateStyle = STATE_STYLES[c.state];
            return (
              <li
                key={c.id}
                className={cn(
                  "border-b border-[#ccc] cursor-pointer hover:bg-[#e8e8e0] group",
                  isActive ? "bg-[#e8e8e0]" : "",
                )}
                onClick={() => setActiveId(c.id)}
              >
                <div className="flex items-center gap-1.5 px-2 py-2">
                  {c.required ? (
                    <Lock className="h-3 w-3 flex-shrink-0 text-[#888]" />
                  ) : (
                    <div className="w-3" />
                  )}
                  <div className="flex-1 min-w-0">
                    {editingTitleId === c.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename(c.id);
                            if (e.key === "Escape") setEditingTitleId(null);
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 min-w-0 px-1 py-0.5 text-xs border border-[#1a1a1a] bg-[#f0f0e8]"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRename(c.id);
                          }}
                          className="text-[#FF6600]"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTitleId(null);
                          }}
                          className="text-[#888]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs font-bold text-[#1a1a1a] truncate">
                        {c.title}
                      </div>
                    )}
                    {stateStyle.label !== "draft" ? (
                      <span
                        className="inline-block mt-0.5 px-1 text-[9px] font-bold uppercase tracking-wider"
                        style={{
                          background: stateStyle.bg,
                          color: stateStyle.fg,
                        }}
                      >
                        {stateStyle.label}
                      </span>
                    ) : null}
                  </div>
                  {!readOnly && editingTitleId !== c.id ? (
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTitleId(c.id);
                          setTitleDraft(c.title);
                        }}
                        className="text-[#888] hover:text-[#1a1a1a]"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={c.required}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!c.required) void handleRemove(c.id);
                        }}
                        className={
                          c.required
                            ? "text-[#ccc] cursor-not-allowed"
                            : "text-[#dc2626] hover:text-[#7f1d1d]"
                        }
                        title={
                          c.required
                            ? "Required clause — can't be removed"
                            : "Remove this section"
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Add custom section */}
        {!readOnly ? (
          <div className="border-t-2 border-[#1a1a1a] px-2 py-2 bg-[#e8e8e0]">
            {adding ? (
              <div className="flex items-center gap-1">
                <input
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAddCustom();
                    if (e.key === "Escape") setAdding(false);
                  }}
                  autoFocus
                  placeholder="Section title…"
                  className="flex-1 min-w-0 px-1.5 py-1 text-xs border border-[#1a1a1a] bg-[#f0f0e8]"
                />
                <button
                  onClick={() => void handleAddCustom()}
                  className="text-[#FF6600]"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="text-[#888]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#FF6600] hover:text-[#1a1a1a] underline underline-offset-2"
              >
                <Plus className="h-3 w-3" />
                Add section
              </button>
            )}
          </div>
        ) : null}
      </aside>

      {/* Right pane — editor for selected clause */}
      <main className="flex-1 min-w-0 flex flex-col">
        {active ? (
          <>
            <header className="px-4 py-3 border-b-2 border-[#1a1a1a] bg-[#e8e8e0] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-[#888] flex items-center gap-2">
                  <span>{active.sectionKey}</span>
                  {active.required ? (
                    <span className="inline-flex items-center gap-1 text-[#888]">
                      <Lock className="h-2.5 w-2.5" /> required
                    </span>
                  ) : null}
                </div>
                <div className="text-lg font-black text-[#1a1a1a] tracking-tight truncate">
                  {active.title}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {bodyDirty ? (
                  <span className="text-[11px] font-mono text-[#b45309]">
                    unsaved
                  </span>
                ) : null}
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => void handleSaveBody()}
                    disabled={!bodyDirty}
                    className="px-3 py-1 border-2 border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8] text-xs font-bold uppercase tracking-wider disabled:opacity-40"
                  >
                    Save section
                  </button>
                ) : null}
              </div>
            </header>

            {active.required ? (
              <div className="px-4 py-2 border-b border-[#ccc] bg-[#f5e9d8] flex items-center gap-2 text-xs text-[#7c4400]">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                This section is required and can't be removed — these clauses
                keep the contract enforceable in court. You can edit the
                language to fit your situation, but the section itself stays.
              </div>
            ) : null}

            {error ? (
              <div className="px-4 py-2 border-b border-[#dc2626] bg-[#fee2e2] text-xs text-[#7f1d1d]">
                {error}
              </div>
            ) : null}

            <div className="flex-1 p-4 overflow-y-auto bg-white">
              <ContractEditor
                contentHtml={bodyDraft}
                onChange={setBodyDraft}
                editable={!readOnly}
              />
            </div>
          </>
        ) : (
          <div className="p-6 text-sm text-[#888]">
            Pick a section on the left to edit.
          </div>
        )}
      </main>
    </div>
  );
}
