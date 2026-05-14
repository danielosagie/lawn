import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import PricingPage from "./-pricing";

export const Route = createFileRoute("/pricing")({
  head: () =>
    seoHead({
      title: "Pricing — $25/month, unlimited seats",
      description:
        "snip pricing is simple. $25/month for unlimited seats, projects, and clients. $50/month if you need more storage. No per-user fees.",
      path: "/pricing",
      ogImage: "/og/pricing.png",
    }),
  component: PricingPage,
});
