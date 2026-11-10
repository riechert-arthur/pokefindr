# Analytics and ads

## Analytics (#53, #137)

`src/components/Analytics.tsx` loads the configured provider's page-view tracker, and
`track()` in `src/lib/analytics.ts` sends product events to the same provider.

| Variable | Values |
| --- | --- |
| `NEXT_PUBLIC_ANALYTICS_PROVIDER` | `none` (default: local dev and CI send nothing), `vercel`, `plausible`, `umami` |
| `NEXT_PUBLIC_ANALYTICS_SITE` | Plausible: the site's domain. Umami: the website id. |
| `NEXT_PUBLIC_ANALYTICS_SCRIPT_URL` | Self-hosted Plausible or Umami: the tracker script's URL |

Production on Vercel needs `NEXT_PUBLIC_ANALYTICS_PROVIDER=vercel` to keep Vercel Analytics.
These are build-time values: change them, then redeploy.

### Speed Insights (#298)

`<SpeedInsights />` (`@vercel/speed-insights`) sits next to `<Analytics />` in
`src/app/[locale]/layout.tsx` and reports real visitors' Core Web Vitals. It renders only on Vercel
(`onVercelProduction()`), which serves its script; local dev, CI and other hosts load nothing.
Speed Insights has to be enabled for the project in the Vercel dashboard. Goals at the 75th
percentile on `/` and `/map`: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.

Lab scores come from Lighthouse CI (`.github/workflows/lighthouse.yml`, targets in
`lighthouserc.json`) on every pull request. Treat Speed Insights as the real goal and Lighthouse
as the guard against regressions. The Lighthouse assertions are warnings at first; switch `"warn"`
to `"error"` in `lighthouserc.json` to make them fail the check.

### Events

Properties are kinds and where something happened. No ids, coordinates or typed text.

| Event | When | Properties |
| --- | --- | --- |
| `search` | A search result is picked | `result` (area kind or `location`), `from` (`landing` / `map`) |
| `open_map_from_landing` | The landing page sends someone to the map | `via` (`search`, `quick_pick`, `my_location`, `button`) |
| `filter_change` | A kind chip, the retailer filter or the radius changes | `filter` (`kinds`, `retailers`, `radius`), `value` |
| `details_open` | A place's details open | `kind`, `from` (`list`, `search`, `map`, `nearby`, `assistant`) |
| `directions_click` | Directions is followed | `kind` |
| `add_place_submit` | Add a place is sent | `kind`, `outcome` (`sent`, `duplicate`, `error`) |
| `assistant_query` | A question to the assistant | `turn` |
| `sponsored_click` / `sponsored_dismiss` | A sponsored link is followed / the slots are hidden | `placement`, `banner` |

Add an event by adding it to `ProductEvents`, so its properties are typed everywhere it's sent.

## Sponsored slots (#59, #136)

Banners live in `src/config/banners.ts`: sponsor, title, body, CTA, link, impression pixel, weight,
and the placements each may use. The first one reads `NEXT_PUBLIC_AFFILIATE_LINK_1` and
`NEXT_PUBLIC_PIXEL_TRACKING_URL_1`; new ones can use literal URLs.

The landing strip keeps its height from the first paint: the page reads the switches on the server
and passes `reserve`, so the band is in the HTML before the banner is picked in the browser (no
layout shift, #298). Its min-heights in `SponsoredPlacement.tsx` fit the current banner's copy;
check them again after adding a banner with longer copy.

`SponsoredPlacement` shows one per view, labeled Sponsored, with `rel="sponsored nofollow"`:

- `results`: after the third place in the results list, when more follow
- `details`: after a place's facts, not while the report form is open
- `landing`: a strip between the landing sections

Never on the map, in popups, in forms or in the assistant. Dismissing one hides them all for the
visit (sessionStorage). The impression pixel loads in production only. Admins will be able to
switch each placement off in #159.
