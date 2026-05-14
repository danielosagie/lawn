import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import CompareFrameio from "./-compare-frameio";

export const Route = createFileRoute("/compare/frameio")({
  head: () =>
    seoHead({
      title: "snip vs Frame.io — the cheaper, faster alternative",
      description:
        "Compare snip and Frame.io. Flat pricing from $25/month vs per-seat billing. Unlimited seats, instant playback, open source. See why teams are switching.",
      path: "/compare/frameio",
      ogImage: "/og/compare-frameio.png",
    }),
  component: CompareFrameio,
});
