import { Navigate } from "@tanstack/react-router";

/**
 * Single-team users don't need a separate /dashboard/$teamSlug page — the
 * dashboard index already shows every project they can reach, and team-
 * level surfaces (billing, members, settings) live under
 * /dashboard/$teamSlug/settings*. Redirect this route to the index so
 * existing bookmarks keep working without a duplicate "Home / <team>"
 * crumb stage.
 */
export default function TeamPageRedirect() {
  return <Navigate to="/dashboard" replace />;
}
