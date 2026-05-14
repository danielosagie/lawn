import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import ForAgencies from "./-for-agencies";

export const Route = createFileRoute("/for/agencies")({
  head: () =>
    seoHead({
      title: "Video review for agencies — stop paying per seat",
      description:
        "Video review built for agencies. Unlimited seats from $25/month. No per-user pricing, no client accounts needed, instant sharing.",
      path: "/for/agencies",
      ogImage: "/og/for-agencies.png",
    }),
  component: ForAgencies,
});
