# Design system

How PokeFindr looks, and how to build UI that matches. The visual source of truth is the
[redesign prototype](https://claude.ai/artifact/AhDFCmn2qbARqjpMgkSRjF); the code below is how it
lives in this repo. Browse every component with `npm run storybook`.

- [Tokens](#tokens) · [Type](#type) · [Spacing, radius, elevation](#spacing-radius-and-elevation) · [Location kinds](#location-kinds)
- [Components](#components) · [Which overlay?](#which-overlay) · [Icons](#icons) · [Copy](#copy)
- [Adding a component](#adding-a-component) · [Accessibility](#accessibility) · [Guardrails](#guardrails)

## Tokens

All colors are CSS variables in [`src/app/globals.css`](../src/app/globals.css), defined once for
light (`:root`) and once for dark (`.dark`). Values are HSL channels, so Tailwind can add opacity
(`bg-primary/10`). **Use the Tailwind class, never a raw color.** Dark mode then works for free.

| Token | Class examples | Use for |
|---|---|---|
| `background` / `foreground` | `bg-background`, `text-foreground` | Page and main text |
| `card`, `popover` (+ `-foreground`) | `bg-card` | Raised surfaces: cards, panels, menus |
| `muted` / `muted-foreground` | `bg-muted`, `text-muted-foreground` | Secondary text, quiet fills, empty states |
| `primary` (+ `-foreground`) | `bg-primary`, `text-primary` | The main action on a screen, links |
| `secondary`, `accent` | `bg-secondary`, `hover:bg-accent` | Secondary buttons, hover rows |
| `destructive` | `bg-destructive`, `text-destructive` | Delete, errors |
| `border`, `input`, `ring` | `border-border`, `ring-ring` | Lines, field borders, focus rings |
| `brand`, `brand-2` | `from-brand to-brand-2` | Logo gradient, hero accents. Not for UI states. |
| `spark` | `text-spark` | Logo sparkle, filled stars |
| `success`, `warning` | `text-success`, `border-warning/45` | Status badges ("Live", "Pending review") |
| `kind-vending`, `kind-shop`, `kind-event` | `bg-kind-shop` | Location kinds only. Use `KINDS[kind]` instead of picking by hand. |
| `me` | `bg-me` | The viewer's location dot |
| `map-*` | — | Map paint. MapLibre can't read CSS classes, so read them with `readToken()` from [`src/lib/design/tokens.ts`](../src/lib/design/tokens.ts). |
| `chart-1…5` | — | Charts. They alias the kind colors first, so charts match the map. |

To add a token: add it to both `:root` and `.dark` in `globals.css`, map it in
`tailwind.config.ts` → `theme.extend.colors`, and add it to `COLOR_TOKENS` in
`src/lib/design/tokens.ts` (a test checks every token Tailwind uses is defined). Check contrast in both themes.

## Type

One family, **Noto Sans** (`font-sans`), plus **JetBrains Mono** (`font-mono`) for IDs and code.
Both load through `next/font` in `src/app/layout.tsx`. Use the named sizes; each sets line height,
tracking and (for headings) weight:

| Class | Size | Use for |
|---|---|---|
| `text-display` | 36→64px fluid, 700 | Landing hero only |
| `text-title` | 26→36px fluid, 700 | Page titles, section titles on marketing pages |
| `text-heading` | 20px, 600 | Panel and card titles |
| `text-subheading` | 15px, 600 | Group labels, list item names |
| `text-body-lg` | 17px | Intro paragraphs |
| `text-body` | 14px | Default UI text |
| `text-caption` | 12px | Meta: distances, counts, timestamps |
| `text-overline` | 11px, 600, tracked | Small labels, with `uppercase` ("SPONSORED") |

Numbers that line up (counts, distances, prices) get `tabular-nums`.

## Spacing, radius and elevation

- Spacing is Tailwind's 4px scale. Common steps: `gap-1.5`/`gap-2` inside a control, `p-3`/`p-4`
  inside cards and panels, `gap-6`/`gap-8` between sections.
- Radius: `rounded-md` for controls, `rounded-lg` (= `--radius`, 8px) for cards and panels,
  `rounded-xl` for large floating surfaces (search, composer), `rounded-full` for chips and dots.
- Elevation: `shadow-sm` for chips and buttons on the map, `shadow-md` for floating panels and
  popovers, `shadow-lg` for the hero search and dialogs. Shadows are tokens too (`--shadow-*`), so
  they deepen in dark mode.

## Location kinds

Vending machines, card shops and events each have a color, an icon and labels, all in
[`src/components/pokefindr/kinds.ts`](../src/components/pokefindr/kinds.ts):

```tsx
import { KINDS, KIND_ORDER, countLabel } from "@/components/pokefindr/kinds"

KINDS.shop.label      // "Card shops"
KINDS.shop.icon       // StoreIcon
KINDS.shop.bg         // "bg-kind-shop"
countLabel("vending", 1) // "1 vending machine"
```

Always go through `KINDS` (or `KindDot` / `KindIcon` / `TypeChip`) so the map, chips, list rows
and assistant cards agree. Adding a kind means adding it here, a `--kind-*` token, and a story.

## Components

Two folders, two naming rules (a test enforces both):

- **`src/components/ui/`**: shadcn/ui components, kebab-case file names, kept as close to the
  registry as possible. Local changes get a comment saying why (see `command.tsx`).
- **`src/components/pokefindr/`**: PokeFindr components built from them, PascalCase `.tsx`,
  plus camelCase `.ts` helpers.

| Component | What it is |
|---|---|
| `KindDot`, `KindIcon` | A kind's colored circle with icon; the bare icon in the kind's color |
| `TypeChip` | Toggle chip to show or hide one kind, with an optional count |
| `StatusBadge` | Live · Sample · Pending review · Coming soon · Sponsored |
| `EmptyState` | What a list or panel shows when it has nothing: title, one or two sentences, an action |
| `SponsoredSlot` | The shell for one labeled, dismissible sponsored card (`compact` or `strip`) |
| `StarRating` | Read-only stars, or a keyboard-friendly rating input when given `onChange` |
| `ResponsivePanel` | Side sheet on desktop, bottom drawer on mobile (see below) |
| `ThemeToggle`, `UserMenu` | Light/dark/system switch; avatar menu |
| `brand/Logo` | The mark (`variant="mark"`) or mark + wordmark (`"full"`) |

## Which overlay?

| Need | Use |
|---|---|
| Details or a form about one thing (a location, "Add a place") | `ResponsivePanel`: `Sheet` from the side at ≥768px, `Drawer` from the bottom below |
| A short decision that blocks everything else ("Delete this review?") | `Dialog` |
| A small control anchored to a button (filters, radius) | `Popover` |
| A list of actions on one thing | `DropdownMenu` |
| Search with suggestions | `Command` (inside a `Popover` when it drops down) |
| The name of an icon-only button | `Tooltip` (the button still needs its own `aria-label`) |
| "Done" feedback after an action ("Link copied") | `toast()` from `sonner` |

Don't put forms in a `Dialog` or `Popover`; they get a panel. Don't stack overlays: open the next
one in place of the current one.

## Icons

- [lucide-react](https://lucide.dev) only. Import the `…Icon` names (`MapPinIcon`, not `MapPin`).
  Custom icons use `createLucideIcon` so they match (see `VendingMachineIcon`) and live next to the
  component that uses them.
- Sizes: `size-4` inline with body text and in buttons, `size-5` in toolbars and map controls,
  `size-6` in the sidebar and nav.
- Decorative icons get `aria-hidden`. Icon-only buttons get an `aria-label` that says what happens
  ("Show my location"), plus a `Tooltip` on desktop.
- No emoji in UI chrome.

## Copy

- Sentence case everywhere: buttons, titles, menu items ("View full map", not "View Full Map").
- Say what happens: buttons are verbs ("Add a place", "Copy link", "Widen to 25 mi").
- Short and plain. One idea per sentence, no exclamation marks, no "Oops".
- Empty states say what would appear and how to get it ("Nothing within 10 mi. Try a wider radius
  or turn on more types.") and offer the action as a button.
- Errors say what went wrong and what to do next, in the user's terms.
- Units: `mi`, `0.4 mi away`; counts with thousands separators (`1,457`); dates like `Sat, Nov 8`.
- Sponsored content is always labeled "Sponsored" and never looks like a location row.

## Adding a component

**A shadcn component**

1. `npx shadcn@2.3.0 add <name>`. If it stops at the React 19 peer-dependency prompt, pick
   `--legacy-peer-deps`. (Or copy the files from `https://ui.shadcn.com/r/styles/new-york/<name>.json`.)
2. It lands in `src/components/ui/<name>.tsx`. Keep the file name; only change what you must, with
   a comment.
3. Add `src/stories/ui/<name>.stories.tsx` with realistic PokeFindr content.

**A PokeFindr component**

1. `src/components/pokefindr/<Name>.tsx`, built from `ui/` components and tokens only.
2. Add `src/stories/pokefindr/<Name>.stories.tsx` covering its variants and states, and unit tests
   in `__tests__/components/pokefindr/` for behavior (keyboard, callbacks).

Then run `npm run storybook` and check it in light and dark, and run the checks below.
`__tests__/design/story-coverage.test.ts` fails if a component has no story.

## Accessibility

CI runs [axe](https://github.com/dequelabs/axe-core) on every story, in light and dark, through the
Storybook test runner ([`.storybook/test-runner.ts`](../.storybook/test-runner.ts)). **Serious and
critical violations fail the build**; minor and moderate ones are printed as warnings. The
Accessibility tab in Storybook shows the same results while you work.

Run it locally:

```sh
npm run build-storybook
npx playwright install chromium          # once
python3 -m http.server 6006 -b 127.0.0.1 -d storybook-static &
npm run test-storybook
```

Fix the component or the token rather than the story. Contrast targets: 4.5:1 for text, 3:1 for
large text, icons and borders that carry meaning.

**Waiving a rule.** Only when the finding is wrong for that story or comes from a library you can't
change. Waive one rule on one story, with a comment saying why:

```ts
export const OnMap: Story = {
  parameters: {
    // Sits on the map canvas in the app; axe can't see the map behind it.
    a11y: { config: { rules: [{ id: "color-contrast", enabled: false }] } },
  },
}
```

`a11y: { disable: true }` skips a story entirely; use it for stories that only make sense in a page.

## Guardrails

ESLint (`.eslintrc.json`) blocks, in `src/components`, `src/app` and `src/stories`:

- Tailwind palette colors (`text-blue-600`, `bg-gray-100`): use a token.
- Arbitrary colors (`bg-[#fff]`, `text-[rgb(…)]`), hex literals and `rgb()`/`hsl()` in code: use a
  token, or `readToken()` when code needs the value (maps, canvas).

Exempt: `src/components/icons/**` and the image routes that render outside the page
(`opengraph-image.tsx`, `apple-icon.tsx`, `brand-mark.ts`), which can't read CSS variables.

Tests in `__tests__/design/` check that tokens are defined, raw colors stay out, the folder naming
rules, lucide-only icons, the lint rules themselves, and story coverage.
