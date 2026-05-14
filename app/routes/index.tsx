import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import Homepage from "./-home";

export const Route = createFileRoute("/")({
  head: () =>
    seoHead({
      title: "snip — video review for creative teams",
      description:
        "Video review and collaboration for creative teams. Frame-accurate comments, unlimited seats, flat pricing from $25/month. The open source Frame.io alternative.",
      path: "/",
      ogImage: "/og/home.png",
    }),
  component: Homepage,
});
