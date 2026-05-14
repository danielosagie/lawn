# snip

Video review + contracts + paywalled delivery for creative teams. Forked from
lawn; the upstream repo at `pingdotgg/lawn` is still the origin remote.

## Design Language

### Philosophy
Brutalist, typographic, minimal. The design should feel bold and direct—like a
poster, not a dashboard. Prioritize clarity over decoration. Let typography and
whitespace do the heavy lifting.

### Colors
- **Background**: `#f0f0e8` (warm cream)
- **Text**: `#1a1a1a` (near-black)
- **Muted text**: `#888888`
- **Primary accent**: `#C2410C` (burnt orange — the snip mark dot)
- **Accent hover**: `#9A3412` (deeper burnt orange)
- **Highlight wash**: `#FDBA74` (light orange for tinted backgrounds)
- **Subtle wash**: `#FFEDD5` (very light orange for hover cells)
- **Borders**: `#1a1a1a` (strong) or `#ccc` (subtle)
- **Inverted sections**: `#1a1a1a` background with `#f0f0e8` text

### Typography
- **Headings**: Font-black (900 weight), tight tracking
- **Body**: Regular weight, clean and readable
- **Monospace**: For technical info, timestamps, stats
- Use size contrast dramatically—massive headlines with small supporting text

### Borders & Spacing
- Strong 2px borders in `#1a1a1a` for section dividers and cards
- Generous padding (p-6 to p-8 typical)
- Clear visual hierarchy through spacing

### Interactive Elements
- Buttons: 2px black border, brutalist `shadow-[4px_4px_0px_0px_var(--shadow-color)]`
  drop-shadow, press-down hover (`translate-y-[2px] translate-x-[2px]` with the
  shadow shrinking to 2px). The Button component's `outline` variant is the
  reference look — every top-bar control should match its height (`h-9` for
  packed strips, `h-10` for default).
- Links: Underlines, not color-only differentiation
- Hover states: Background fills or color shifts, no subtle opacity changes

### Component Patterns
- **Cards**: 2px black border, cream background, bold title
- **Sections**: Often alternate between cream and dark backgrounds
- **Forms**: Simple inputs with strong borders, no rounded corners or minimal
- **Navigation**: Minimal, text-based, appears on scroll when needed

### Do's
- Use bold typography to create hierarchy
- Embrace whitespace
- Keep interactions obvious and direct
- Use orange sparingly as accent, not as a fill — it's a punctuation color

### Don'ts
- No gradients (except inside the hero hero photo); subtle drop-shadows are
  fine when they're functional (brutalist 4px offset)
- No rounded corners on primary UI (square/sharp edges)
- No decorative icons—only functional ones
- Don't hide information behind hover states

## Branding notes

- Wordmark is `snip` with the period in `#C2410C`: `snip<span class="text-[#C2410C]">.</span>`
- Logo asset is `public/grass-logo.svg` (palm tree on a burnt-orange sand strip;
  filename kept stable to avoid breaking the static path; replaceable in place)
- Bulk rebrand happened via sed; a few historic identifiers stayed for safety:
  - `localStorage` keys (`lawn-theme`, `lawn:sidebar:collapsed`, `lawn.presence.client_id`)
  - The GitHub URL `github.com/pingdotgg/lawn`
