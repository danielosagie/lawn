import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import CompareLucidlink from "./-compare-lucidlink";

export const Route = createFileRoute("/compare/lucidlink")({
  head: () =>
    seoHead({
      title: "snip vs LucidLink — review + your bucket vs cloud NAS",
      description:
        "Compare snip with LucidLink for creative teams: flat pricing, open source, frame-accurate review, and a desktop mount that streams from your own S3/R2 bucket.",
      path: "/compare/lucidlink",
      ogImage: "/og/compare-lucidlink.png",
    }),
  component: CompareLucidlink,
});
