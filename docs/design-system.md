# Design system

How PokeFindr looks, and how to build UI that matches. The visual source of truth is the
[redesign prototype](https://claude.ai/artifact/AhDFCmn2qbARqjpMgkSRjF); the code below is how it
lives in this repo. Browse every component in Storybook: `make run` starts it on http://localhost:6006 (or run
`npm run storybook` on the host).

- [Tokens](#tokens) · [Type](#type) · [Spacing, radius, elevation](#spacing-radius-and-elevation) · [Location kinds](#location-kinds)
- [Components](#components) · [Which overlay?](#which-overlay) · [Icons](#icons) · [Copy](#copy)
- [Adding a component](#adding-a-component) · [Accessibility](#accessibility) · [Guardrails](#guardrails)

## Tokens

All colors are CSS variables in [`src/app/globals.css`](../src/app/globals.css), defined once for
light (`:root`) and once for dark (`.dark`). Values are HSL channels, so Tailwind can add opacity
(`bg-primary/10`); a few, like `chart-*`, alias another token instead. **Use the Tailwind class, never a raw color.** Dark mode then works for free.

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
| `logo-card` | — | The logo's card face (white in both themes) |
| `map-*` | — | Map paint. MapLibre can't read CSS classes, so read them with `readTokens()` from [`src/lib/design/tokens.ts`](../src/lib/design/tokens.ts). |
| `chart-1…5` | — | Charts. They alias the kind colors first, so charts match the map. |

To add a token: add it to both `:root` and `.dark` in `globals.css`, map it in
`tailwind.config.ts` → `theme.extend.colors`, and, if its value is HSL channels, add it to
`COLOR_TOKENS` in `src/lib/design/tokens.ts` (a test checks each of those is channels in both
themes, and that every token Tailwind uses is defined). An alias (`--chart-6: var(--primary)`)
doesn't go in `COLOR_TOKENS`. Check contrast in both themes.

## Type

One family, **Noto Sans** (`font-sans`), plus **JetBrains Mono** (`font-mono`) for IDs and code.
Both load through `next/font` in `src/app/layout.tsx`. Use the named sizes; each sets line height,
tracking and (for headings) weight. They're defined once in
[`src/lib/design/type-scale.ts`](../src/lib/design/type-scale.ts), which Tailwind and `cn()` both read:

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

`cn()` (`src/lib/utils.ts`) merges classes with tailwind-merge, so when a caller's `className`
conflicts with a component's default, the caller's wins (`cn("px-2.5", "px-2")` is `px-2`). A
text size next to a `leading-*` keeps both.

## Spacing, radius and elevation

- Spacing is Tailwind's 4px scale. Common steps: `gap-1.5`/`gap-2` inside a control, `p-3`/`p-4`
  inside cards and panels, `gap-6`/`gap-8` between sections.
- Radius, as the components use it: `rounded-md` for controls, popovers and menus, `rounded-lg`
  (= `--radius`, 8px) for dialogs, panels and empty states, `rounded-xl` for cards (`Card`) and
  large floating surfaces (search, composer), `rounded-full` for chips and dots. The phone drawer
  rounds only its top corners.
- Elevation: `shadow-sm` (and plain `shadow`) for chips and buttons on the map, `shadow-md` for
  popovers and floating panels, `shadow-lg` for menus, dialogs, sheets (including the desktop
  `ResponsivePanel`) and the hero search, `shadow-xl` for the app's fixed side panels (the sidebar
  drawer, the location panel). The phone drawer has no shadow; its overlay sets it apart. Shadows are tokens too (`--shadow-*`), so they deepen in dark mode. Being
  `var()` values, they can't take a color modifier (`shadow-lg shadow-primary/10`); use an arbitrary
  shadow with a token instead.
- Breakpoints are Tailwind's defaults, defined once in
  [`src/lib/design/breakpoints.ts`](../src/lib/design/breakpoints.ts) for both Tailwind and
  `useMediaQuery` (`MD_UP`, `LG_UP` in `src/hooks/use-media-query.ts`), so `md:` classes and JS
  switch at the same width.

## Location kinds

Vending machines, card shops and events each have a color, an icon and labels, all in
[`src/components/pokefindr/kinds.ts`](../src/components/pokefindr/kinds.ts):

```tsx
import { KINDS, KIND_ORDER, countLabel } from "@/components/pokefindr/kinds"

KINDS.shop.label      // "Card shops"
KINDS.shop.short      // "Shops"
KINDS.shop.icon       // StoreIcon
KINDS.shop.bg         // "bg-kind-shop"
countLabel("vending", 1) // "1 vending machine"
```

Always go through `KINDS` (or `KindDot` / `KindIcon` / `TypeChip`) so the map, chips, list rows
and assistant cards agree. For a kind from API data, use `toKind(value)`: a missing value becomes
vending, and so does an unknown one, with a warning outside production.

Adding a kind:

1. `--kind-<name>` in both `:root` and `.dark` (`globals.css`), checked for contrast.
2. `kind.<name>` in `tailwind.config.ts` → `theme.extend.colors.kind`, so `bg-kind-<name>` exists,
   and `kind-<name>` in `COLOR_TOKENS` (`src/lib/design/tokens.ts`).
3. The kind in `LocationKind` (`src/lib/types/locations.ts`) and its entry in `KINDS`: `label`,
   `short`, the singular and plural nouns `one` and `many` (`countLabel` uses them), `icon`, and
   the `bg-`/`text-` classes. `KIND_ORDER` follows `KINDS`.
4. A story showing it (the `KindDot` and `TypeChip` stories render every kind).

## Components

Three folders (a test enforces the naming rules and that each component has a story):

- **`src/components/ui/`**: shadcn/ui components, kebab-case file names, kept as close to the
  registry as possible. Local changes get a comment saying why (see `command.tsx`). Stories in
  `src/stories/ui/`.
- **`src/components/pokefindr/`**: PokeFindr components built from them, PascalCase `.tsx`,
  plus camelCase `.ts` helpers. Stories in `src/stories/pokefindr/`.
- **`src/components/brand/`**: the logo. Its stories sit with the PokeFindr ones, in
  `src/stories/pokefindr/`.

| Component | What it is |
|---|---|
| `KindDot`, `KindIcon` | A kind's colored circle with icon; the bare icon in the kind's color |
| `TypeChip` | Toggle chip to show or hide one kind, with an optional count |
| `StatusBadge` | Live · Sample · Pending review · Coming soon · Sponsored |
| `EmptyState` | What a list or panel shows when it has nothing: title, one or two sentences, an action |
| `SponsoredSlot` | The shell for one labeled, dismissible sponsored card (`compact` or `strip`) |
| `StarRating` | Read-only stars ("4.5 out of 5 stars", half-star steps), or a 1–5 radio group with arrow keys when given `onChange` |
| `ResponsivePanel` | Side sheet on desktop, bottom drawer on mobile (see below) |
| `ThemeToggle` | Light / dark / system (`segmented`, in settings) or a one-click light/dark switch (`toggle`, in the sidebar) |
| `UserMenu` | The signed-in user's avatar: a dropdown with Settings and Log out, or `variant="list"` for the mobile nav drawer |
| `brand/Logo` | The mark (`variant="mark"`) or mark + wordmark (`"full"`) |

## Which overlay?

| Need | Use |
|---|---|
| Details or a form about one thing (a location, "Add a place") | `ResponsivePanel`: `Sheet` from the side at ≥768px, `Drawer` from the bottom below |
| A short decision that blocks everything else ("Delete this review?") | `Dialog` |
| A small control anchored to a button (filters, radius) | `Popover` |
| A long list or panel body that scrolls | `ScrollArea` (it's a tab stop only when its content overflows and has nothing focusable of its own) |
| A list of actions on one thing | `DropdownMenu` |
| Search with suggestions | `Command` (inside a `Popover` when it drops down) |
| The name of an icon-only button | `Tooltip` (the button still needs its own `aria-label`; one `TooltipProvider` wraps the app) |
| "Done" feedback after an action ("Link copied") | `toast()` from `sonner` |

New forms go in a panel, not a `Dialog` or `Popover`. (The review forms on the map and the home
page are still in dialogs; move them to a `ResponsivePanel` when you next work on them.) Don't stack overlays: open the next
one in place of the current one.

## Icons

- UI icons come from [lucide-react](https://lucide.dev) (either export name works: `MapPin` or
  `MapPinIcon`). A missing single-color UI icon is made with `createLucideIcon` so it matches, next
  to the code that uses it (see `VendingMachineIcon` in `kinds.ts`).
- Multi-color artwork (social logos, the map pins) lives in `src/components/icons/` as plain SVG
  components. It's exempt from the color lint because it uses fixed colors.
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

Then open it in Storybook (http://localhost:6006 after `make run`) and check it in light and dark, and run the checks below.
`__tests__/design/story-coverage.test.ts` fails if a component has no story.

## Accessibility

CI runs [axe](https://github.com/dequelabs/axe-core) on every story, in light and dark, through the
Storybook test runner ([`.storybook/test-runner.ts`](../.storybook/test-runner.ts)). **Serious and
critical violations fail the build**; minor and moderate ones are printed as warnings.

The Accessibility tab in Storybook runs the same axe while you work, with two differences:

- It checks the theme you're viewing; CI checks light and dark.
- It also reports page-level rules (`region`, `landmark-one-main`, `page-has-heading-one`), which
  CI turns off because a story is one component, not a page.

Run it locally (builds Storybook, serves the build on port 6007 and runs the checks). Port 6007
keeps it clear of the Storybook `make run` starts on 6006; the checks need a build, because the
test runner doesn't work reliably against `storybook dev`:

```sh
npx playwright install chromium   # once
npm run test-storybook:local
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

`a11y: { test: "off" }` (or the older `disable: true`) skips a story in CI and turns off the tab's
automatic run for it (you can still run it from the tab); use it for stories that only make sense
in a page. `a11y: { context: "#selector" }` narrows what's
checked, in both. `a11y.config` and `a11y.options` apply in both too. `test: "todo"`, the default
in `.storybook/preview.tsx`, only makes the tab show violations as warnings: CI still fails on
serious and critical ones.

## Guardrails

ESLint (`.eslintrc.js`) blocks, in `src` (`.ts`, `.tsx`, `.js`, `.jsx`):

- Tailwind palette colors (`text-blue-600`, `hover:!bg-gray-100`, `border-t-red-500`): use a token.
- Arbitrary colors (`bg-[#fff]`, `text-[rgb(…)]`, `bg-[oklch(…)]`, `[color:red]`,
  `text-[theme(colors.blue.500)]`): use a token. `bg-[hsl(var(--brand)/0.3)]` is fine.
- Hex colors and color functions (`rgb()`, `hsl()`, `oklch()`, `color-mix()`) in styles, color
  attributes (`fill="#…"`), color-named variables and CSS strings: use a token class, or
  `readTokens()` when code needs the value (maps, canvas). Text like "Fixed in #142" and anchors
  like `href="#add"` aren't flagged.

Exempt: `src/components/icons/**`, the image routes under `src/app` (`opengraph-image`,
`twitter-image`, `icon`, `apple-icon`), which can't read CSS variables, the token runtime in
`src/lib/design/`, and the config readers (`src/server/config.ts`, `edge-config.ts`, `site-url.ts`,
`src/config.public.ts`), where `no-restricted-syntax` is off. ESLint doesn't read CSS: the raw-color
test in `__tests__/design/tokens.test.ts` checks `.css` files in `src/components` and `src/app`
(`globals.css` defines the tokens, so it's exempt).

Tests in `__tests__/design/` check that tokens are defined in both themes (and key text/fill pairs
meet 4.5:1), raw colors stay out, the folder naming rules, no heroicons, the logo copies match,
the lint rules themselves, and that every component has a story that imports it.
