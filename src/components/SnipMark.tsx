import { Film } from "lucide-react";

/**
 * Brand mark — the actual Lucide React `Film` icon on the snip orange
 * (#FF6600). Same identity as `public/favicon.svg` and the macOS app
 * icon (generated from `public/grass-logo.svg`). Use this anywhere a
 * "logo spot" appears: nav headers, sidebar, footer, auth screen.
 * Wordmark + mark together is the lockup; the mark alone works as a
 * small avatar/affordance.
 *
 * Brutalist square edges per CLAUDE.md design language — no rounded
 * corners on the orange background.
 */

interface SnipMarkProps {
  /** Pixel size of the square mark. Defaults to 24. */
  size?: number;
  /** Optional class for layout (margins, etc.). */
  className?: string;
}

export function SnipMark({ size = 24, className }: SnipMarkProps) {
  // The Film glyph sits at ~66% of the box; the rest is the orange
  // bezel. Stroke a touch heavier than Lucide's default 2 so the
  // glyph reads at small sizes (sidebar header, nav).
  const iconSize = Math.round(size * 0.66);
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        backgroundColor: "#FF6600",
        flexShrink: 0,
      }}
      role="img"
      aria-label="snip"
    >
      <Film
        size={iconSize}
        strokeWidth={2}
        color="#f0f0e8"
        absoluteStrokeWidth
      />
    </span>
  );
}
