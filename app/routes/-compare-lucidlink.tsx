import { Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/MarketingLayout";

/**
 * Illustrative LucidLink seat rate for the “seat math” cards only.
 * LucidLink bills by plan + included capacity + overages — see their site for
 * current list pricing. This constant is a mid-tier Business-plan-ish
 * round number so the chart reads as “directionally cheaper,” not a quote.
 */
const LUCIDLINK_ILLUSTRATIVE_PER_USER = 27;
const SNIP_PRICE_FLAT = 25;

const comparisonRows = [
  {
    feature: "Primary job",
    lucidlink: "Cloud NAS / Filespace",
    snip: "Video review + contracts + delivery",
    note: "Different products — snip mounts your bucket so editors still get a drive letter.",
  },
  {
    feature: "Desktop mount",
    lucidlink: "Native LucidLink client",
    snip: "snip desktop: one-click rclone + FUSE",
    note: "Same mental model: files appear local; data lives in the cloud.",
  },
  {
    feature: "Where files live",
    lucidlink: "LucidLink-managed storage",
    snip: "Your R2 / S3 bucket (you own keys + egress math)",
    note: "Bring-your-own-object-storage vs bundled Filespace.",
  },
  {
    feature: "Sequential / NLE playback",
    lucidlink: "Highly tuned streaming cache",
    snip: "rclone VFS: large read-ahead + write cache (tuned for big media)",
    note: "We bias rclone toward read-ahead and chunky range reads like a NAS client.",
  },
  {
    feature: "Frame-accurate review",
    lucidlink: "Not the product focus",
    snip: "Built-in (Mux + comments + share links)",
    note: "snip is for review; LucidLink is for shared project media.",
  },
  {
    feature: "Open source",
    lucidlink: "No",
    snip: "Yes",
    note: "Read the mount + desktop code; no black box.",
  },
  {
    feature: "snip subscription",
    lucidlink: "Per user + capacity tiers / overages",
    snip: "$25/mo flat (Pro storage tier $50)",
    note: "Object storage is still billed by your provider — same as rolling your own with any NAS client.",
  },
];

const teamSizes = [3, 5, 10, 25];

function annualSeatSavingsIllustrative(teamSize: number) {
  return (LUCIDLINK_ILLUSTRATIVE_PER_USER * teamSize - SNIP_PRICE_FLAT) * 12;
}

const savingsCommentary: Record<number, string> = {
  3: "That's a few months of object storage for a small team.",
  5: "Enough to pay for a serious R2 bucket and still pocket the difference.",
  10: "Real money — but add your own storage math on both sides.",
  25: "At agency scale, seat + capacity lines add up fast.",
};

export default function CompareLucidlink() {
  return (
    <MarketingLayout>
      <section className="px-6 pt-20 pb-24 md:pt-28 md:pb-32 border-b-2 border-[var(--border)] bg-[var(--background)]">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-[14vw] sm:text-[10vw] md:text-[8vw] font-black leading-[0.85] tracking-tighter uppercase">
            snip vs
            <br />
            LucidLink
          </h1>
          <div className="mt-10 md:mt-14 max-w-2xl">
            <p className="text-2xl md:text-3xl font-black uppercase tracking-tight leading-tight">
              Cloud NAS vs
              <br />
              review-first + your bucket.
              <br />
              <span className="text-[var(--foreground-muted)]">
                The desktop mount is the overlap.
              </span>
            </p>
            <p className="mt-6 text-lg text-[var(--foreground-muted)] font-medium max-w-lg">
              LucidLink is excellent at making remote media feel local. snip is
              excellent at review, contracts, and share links — and the desktop
              companion mounts the same project tree over S3 so Premiere,
              Resolve, and Finder see the same folder layout you get from a
              Filespace-style workflow.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 border-b-2 border-[var(--border)] bg-[var(--surface-alt)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-16 text-center">
            SIDE BY
            <br />
            SIDE.
          </h2>

          <div className="border-2 border-[var(--border)] shadow-[8px_8px_0px_0px_var(--shadow-color)] bg-[var(--background)]">
            <div className="grid grid-cols-3 border-b-2 border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground-inverse)]">
              <div className="p-4 md:p-6 font-black uppercase tracking-wider text-sm">
                Feature
              </div>
              <div className="p-4 md:p-6 font-black uppercase tracking-wider text-sm border-l-2 border-[var(--border)]">
                LucidLink
              </div>
              <div className="p-4 md:p-6 font-black uppercase tracking-wider text-sm border-l-2 border-[var(--border)] text-[var(--accent-light)]">
                snip
              </div>
            </div>

            {comparisonRows.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 ${i < comparisonRows.length - 1 ? "border-b-2 border-[var(--border)]" : ""}`}
              >
                <div className="p-4 md:p-6 flex flex-col justify-center">
                  <span className="font-black uppercase tracking-tight text-lg">
                    {row.feature}
                  </span>
                  <span className="text-xs text-[var(--foreground-muted)] mt-1 hidden md:block">
                    {row.note}
                  </span>
                </div>
                <div className="p-4 md:p-6 border-l-2 border-[var(--border)] flex items-center text-[var(--foreground-muted)] font-medium">
                  {row.lucidlink}
                </div>
                <div className="p-4 md:p-6 border-l-2 border-[var(--border)] flex items-center font-bold text-[var(--accent)]">
                  {row.snip}
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-[var(--foreground-muted)] mt-6 max-w-2xl mx-auto">
            * LucidLink pricing and included capacity change by plan — see{" "}
            <a
              href="https://www.lucidlink.com/pricing"
              className="underline underline-offset-2 hover:text-[var(--foreground)]"
              target="_blank"
              rel="noopener noreferrer"
            >
              lucidlink.com/pricing
            </a>
            . The savings cards below use an illustrative ${LUCIDLINK_ILLUSTRATIVE_PER_USER}
            /user/mo seat figure only (no storage overages on either side).
          </p>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 border-b-2 border-[var(--border)] bg-[var(--background)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-4 text-center">
            SEAT MATH
            <br />
            (ILLUSTRATIVE)
          </h2>
          <p className="text-center text-lg text-[var(--foreground-muted)] font-medium mb-16 max-w-lg mx-auto">
            snip is ${SNIP_PRICE_FLAT}/month flat for the product. LucidLink
            charges per collaborator on published plans. Here is the delta if
            you model LucidLink at ~${LUCIDLINK_ILLUSTRATIVE_PER_USER}/user/mo —
            before any storage overages or your S3/R2 bill.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {teamSizes.map((size) => {
              const savings = annualSeatSavingsIllustrative(size);
              const lucidAnnual = LUCIDLINK_ILLUSTRATIVE_PER_USER * size * 12;
              const snipAnnual = SNIP_PRICE_FLAT * 12;

              return (
                <div
                  key={size}
                  className="border-2 border-[var(--border)] bg-[var(--background)] shadow-[6px_6px_0px_0px_var(--shadow-color)] hover:-translate-y-1 hover:translate-x-1 hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] transition-all flex flex-col"
                >
                  <div className="border-b-2 border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground-inverse)] p-5">
                    <span className="text-4xl font-black">{size}</span>
                    <span className="text-sm font-bold uppercase tracking-wider text-[var(--foreground-muted)] ml-2">
                      seats (modeled)
                    </span>
                  </div>
                  <div className="p-5 flex flex-col flex-grow">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)]">
                        LucidLink (modeled)
                      </span>
                      <span className="font-black text-[var(--foreground-muted)] line-through">
                        ${lucidAnnual.toLocaleString()}/yr
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline mb-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                        snip
                      </span>
                      <span className="font-black text-[var(--accent)]">${snipAnnual}/yr</span>
                    </div>
                    <div className="border-t-2 border-[var(--border-subtle)] pt-4 mt-auto">
                      <div className="text-3xl font-black text-[var(--accent)]">
                        ${savings.toLocaleString()}
                      </div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)]">
                        modeled seat delta / yr
                      </div>
                      <p className="text-sm text-[var(--foreground-muted)] mt-2 italic">
                        {savingsCommentary[size]}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 border-b-2 border-[var(--border)] bg-[var(--surface-alt)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-4 text-center">
            MOUNT
            <br />
            PARITY.
          </h2>
          <p className="text-center text-lg text-[var(--foreground-muted)] font-medium mb-12 max-w-2xl mx-auto">
            The snip desktop app wraps the same rclone + FUSE recipe documented
            in <code className="text-[var(--foreground)]">docs/MOUNTING.md</code>
            : large VFS read-ahead, chunky read sizes, and a 50&nbsp;GB write
            cache so big media behaves more like a purpose-built cloud NAS
            client than a naive S3 browser.
          </p>

          <div className="border-2 border-[var(--border)] bg-[var(--background)] shadow-[8px_8px_0px_0px_var(--shadow-color)] p-8 md:p-10">
            <h3 className="text-xl font-black uppercase tracking-tight mb-4">
              What we tuned for editors
            </h3>
            <ul className="space-y-3 text-[var(--foreground-muted)] font-medium max-w-2xl">
              <li>
                <span className="text-[var(--accent)] font-black">—</span>{" "}
                <strong className="text-[var(--foreground)]">Read-ahead</strong>{" "}
                so sequential playback and bin scrolling pull fewer tiny HTTP
                ranges off object storage.
              </li>
              <li>
                <span className="text-[var(--accent)] font-black">—</span>{" "}
                <strong className="text-[var(--foreground)]">Larger read chunks</strong>{" "}
                to match how NLEs read big GOP blocks instead of hammering the
                API with 4&nbsp;KiB requests.
              </li>
              <li>
                <span className="text-[var(--accent)] font-black">—</span>{" "}
                <strong className="text-[var(--foreground)]">Write-back cache</strong>{" "}
                (existing) so exports land in VFS fast, then flush to S3 in the
                background like you expect from a sync client.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:py-32 border-b-2 border-[var(--border)] bg-[var(--background)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-4 text-center">
            HONEST
            <br />
            ADVICE.
          </h2>
          <p className="text-center text-lg text-[var(--foreground-muted)] font-medium mb-16 max-w-lg mx-auto">
            If you need LucidLink-class collaborative caching across dozens of
            workstations on one Filespace, LucidLink is purpose-built for that.
            If you need frame-accurate review, contracts, and a mount that hits{" "}
            <em>your</em> bucket with open-source tooling, snip is built for
            that combo.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border-2 border-[var(--border)] bg-[var(--background)] shadow-[8px_8px_0px_0px_var(--shadow-color)]">
              <div className="border-b-2 border-[var(--border)] p-6">
                <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">
                  Use LucidLink if...
                </h3>
              </div>
              <div className="p-6">
                <ul className="space-y-5">
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--foreground-muted)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You want a vendor-managed global namespace with their
                      client stack and SLAs across every machine
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--foreground-muted)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You are standardizing the entire facility on one Filespace
                      and collaboration inside that volume is the top priority
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="border-2 border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground-inverse)] shadow-[8px_8px_0px_0px_var(--shadow-accent)]">
              <div className="border-b-2 border-[var(--border)] p-6">
                <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-[var(--accent-light)]">
                  Use snip if...
                </h3>
              </div>
              <div className="p-6">
                <ul className="space-y-5">
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--accent-light)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You want review + delivery in snip, but still mount{" "}
                      <code className="text-[var(--accent-light)]">projects/</code>{" "}
                      from your own R2/S3 keys
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[var(--accent-light)] font-black text-lg shrink-0 mt-0.5">
                      --
                    </span>
                    <span className="font-medium">
                      You are comfortable installing rclone + macFUSE / WinFsp
                      once, then using the desktop Mount button forever
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-32 bg-[var(--background)]">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          <h2 className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-[0.8] mb-4">
            TRY
            <br />
            SNIP.
          </h2>
          <p className="text-xl md:text-2xl text-[var(--foreground-muted)] font-medium mb-12 max-w-md">
            $25/month. Unlimited seats. Mount your bucket from the desktop app
            when you are ready.
          </p>
          <Link
            to="/sign-up"
            className="bg-[var(--surface-strong)] text-[var(--foreground-inverse)] px-12 py-6 border-2 border-[var(--border)] text-2xl font-black uppercase tracking-wider hover:bg-[var(--accent)] hover:border-[var(--accent)] transition-colors shadow-[12px_12px_0px_0px_var(--shadow-accent)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[8px_8px_0px_0px_var(--shadow-accent)]"
          >
            START FREE TRIAL
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
