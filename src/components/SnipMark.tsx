/**
 * Brand mark — the Lucide Film glyph on the snip orange (#FF6600).
 *
 * Same identity as `public/favicon.svg` and the macOS app icon
 * (generated from `public/grass-logo.svg`). Use this anywhere a "logo
 * spot" appears: nav headers, sidebar, footer, auth screen, etc.
 * Wordmark + mark together is the lockup; the mark alone works as a
 * small avatar/affordance.
 */

interface SnipMarkProps {
  /** Pixel size of the square mark. Defaults to 24. */
  size?: number;
  /** Optional class for layout (margins, etc.). */
  className?: string;
}

export function SnipMark({ size = 24, className }: SnipMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label="snip"
      className={className}
    >
      <rect width="24" height="24" rx="4" fill="#FF6600" />
      <g
        fill="none"
        stroke="#f0f0e8"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(3 3) scale(0.75)"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M7 3v18" />
        <path d="M3 7.5h4" />
        <path d="M3 12h18" />
        <path d="M3 16.5h4" />
        <path d="M17 3v18" />
        <path d="M17 7.5h4" />
        <path d="M17 16.5h4" />
      </g>
    </svg>
  );
}
