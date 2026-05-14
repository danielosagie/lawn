import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout route for `/dashboard/$teamSlug/settings/*`. Renders an
 * Outlet so child routes (currently `payouts`) actually mount.
 *
 * The team-members page lives at the index child
 * (`$teamSlug.settings.index.tsx`); this file used to render that
 * page directly, which silently swallowed every nested route — clicks
 * to /settings/payouts just kept showing team-members because the
 * Outlet wasn't there.
 */
export const Route = createFileRoute("/dashboard/$teamSlug/settings")({
  component: TeamSettingsLayout,
});

function TeamSettingsLayout() {
  return <Outlet />;
}
