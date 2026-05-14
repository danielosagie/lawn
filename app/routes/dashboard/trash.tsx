import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Trash2, Briefcase } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { projectPath } from "@/lib/routes";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/dashboard/trash")({
  head: () =>
    seoHead({
      title: "Recently deleted",
      description: "Restore or permanently delete trashed projects.",
      path: "/dashboard/trash",
      noIndex: true,
    }),
  component: TrashRoute,
});

/**
 * "Recently deleted" page. Lists every soft-deleted project across
 * the user's teams with restore + permanent-delete actions.
 *
 * Projects soft-delete to `projects.deletedAt`; restoring clears that
 * marker and the project pops back into its team listing. Purging
 * cascades into videos, comments, share links, folders — same path
 * that the old hard-delete used.
 */
function TrashRoute() {
  const trashed = useQuery(api.projects.listDeleted, {});
  const restoreProject = useMutation(api.projects.restore);
  const purgeProject = useMutation(api.projects.purge);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const handleRestore = async (id: Id<"projects">, teamSlug: string) => {
    setBusy(id);
    try {
      await restoreProject({ projectId: id });
      // Drop the user into the just-restored project so the restore
      // feels actionable rather than a list reshuffle.
      navigate({ to: projectPath(teamSlug, id) });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Restore failed.");
    } finally {
      setBusy(null);
    }
  };

  const handlePurge = async (id: Id<"projects">, name: string) => {
    if (
      !confirm(
        `Permanently delete "${name}"? Every video, contract, and comment goes with it. This can't be undone.`,
      )
    ) {
      return;
    }
    setBusy(id);
    try {
      await purgeProject({ projectId: id });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Permanent delete failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <DashboardHeader paths={[{ label: "Recently deleted" }]} />

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-black tracking-tight text-[#1a1a1a]">
            Recently deleted
          </h1>
          <p className="text-sm text-[#666] mt-1 max-w-prose">
            Projects you delete land here. Restore brings everything back —
            videos, contracts, comments, share links. Permanent delete
            cascades through every related row and can't be undone.
          </p>

          <div className="mt-6">
            {trashed === undefined ? (
              <div className="text-sm text-[#888]">Loading…</div>
            ) : trashed.length === 0 ? (
              <div className="border-2 border-dashed border-[#1a1a1a] p-8 text-center text-sm text-[#888]">
                Nothing here. Deleted projects show up in this list and
                stay restorable until you purge them.
              </div>
            ) : (
              <div className="border-2 border-[#1a1a1a] divide-y-2 divide-[#1a1a1a]">
                {trashed.map((p) => (
                  <div
                    key={p._id}
                    className="flex items-center gap-4 px-4 py-3"
                  >
                    <div className="w-9 h-9 flex-shrink-0 bg-[#e8e8e0] border-2 border-[#1a1a1a] flex items-center justify-center">
                      <Briefcase className="h-4 w-4 text-[#888]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-[#1a1a1a] truncate flex items-center gap-2">
                        {p.name}
                        <Badge variant="secondary">{p.teamName}</Badge>
                      </div>
                      <div className="text-xs font-mono text-[#888]">
                        Deleted {formatRelativeTime(p.deletedAt)}
                        {p.deletedByName ? ` by ${p.deletedByName}` : ""}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRestore(p._id, p.teamSlug)}
                      disabled={busy !== null}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      {busy === p._id ? "…" : "Restore"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handlePurge(p._id, p.name)}
                      disabled={busy !== null}
                      className="text-[#dc2626] hover:text-[#dc2626] hover:bg-[#fef2f2]"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Forever
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
