import { createFileRoute } from "@tanstack/react-router";
import TeamSettingsPage from "./-settings";

/**
 * Index child of `/dashboard/$teamSlug/settings` — renders the
 * team-members page. Separated from `$teamSlug.settings.tsx` so that
 * file can act as a layout (with an Outlet) for sibling routes like
 * `/settings/payouts`.
 */
export const Route = createFileRoute("/dashboard/$teamSlug/settings/")({
  component: TeamSettingsPage,
});
