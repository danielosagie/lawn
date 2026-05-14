import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "@convex/_generated/dataModel";
import ProjectPage from "./-project";

export const Route = createFileRoute("/dashboard/$teamSlug/$projectId/")({
  validateSearch: (search: Record<string, unknown>) => ({
    folder:
      typeof search.folder === "string" && search.folder.length > 0
        ? (search.folder as Id<"folders">)
        : undefined,
  }),
  component: ProjectIndexRoute,
});

function ProjectIndexRoute() {
  const { teamSlug, projectId } = Route.useParams();
  const { folder } = Route.useSearch();

  return (
    <ProjectPage
      teamSlug={teamSlug}
      projectId={projectId as Id<"projects">}
      folderId={folder ?? null}
    />
  );
}
