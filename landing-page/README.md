# DataOrbyt landing page

The marketing page for DataOrbyt: **“Ask Claude for a dashboard. See it right in the conversation.”**

## One source of truth: `landing-page/index.html`

The whole page is a single self-contained file, with inline CSS, inline SVG and a little vanilla JavaScript. It has no build step and no dependencies. You can see it two ways:

| How | Where |
|---|---|
| Through the app (recommended) | `npm run dev`, then open **http://localhost:3000/landing-page** |
| Straight from disk | `open landing-page/index.html` (or double-click it) |

`src/app/landing-page/route.ts` is a small route handler that reads `index.html` and serves it at `/landing-page`. Route handlers don't render the app layout, so the page has no app sidebar or top bar, and nothing in the main app had to change to support it. The handler also turns the page's relative `og:image` URL into an absolute one (set `DATAORBYT_SITE_URL` when deployed).

Opened from disk, the links into the app (*Open demo app*, *Open full dashboard*, *Explore MCP setup*, footer links) are rewritten to `http://localhost:3000`. Change `APP_ORIGIN` near the end of the file if you run the app on another port.

## Versions and side-by-side comparison

| Route | File | What it is |
|---|---|---|
| `/landing-page` | `index.html` | Current page (Oct 17): “Ask Claude for a dashboard.” |
| `/landing-page/v1` | `v1/index.html` | Archived first version (Oct 16): “Know what’s moving your business.” Marked `noindex` and not linked from the site. |
| `/landing-page/compare` | `compare.html` | Both versions side by side, with Desktop / Tablet / Mobile widths and synced scrolling. |

`v1/index.html` was rebuilt from the Oct 16 page (it had been overwritten and wasn't in git), including the new “data orbyt” logo. Delete `v1/`, `compare.html` and their two routes once you've decided.

## Files

```
landing-page/
  index.html            The page (single source of truth)
  opengraph-image.tsx   Social preview image, served at /landing-page/opengraph-image
  landing.test.ts       Content checks: links resolve, labels present, no unsupported claims
  README.md
src/app/landing-page/
  route.ts              Serves index.html at /landing-page
  opengraph-image.tsx   Re-exports landing-page/opengraph-image.tsx
```

**Assets:** none. The logo, product mockups, charts and diagrams are inline SVG and HTML, and nothing is hotlinked. The Geist font loads from Google Fonts when online and falls back to the system font offline.

## Page structure

1. **Hero:** what DataOrbyt is, who it's for, and two CTAs, followed by a looping five-step walkthrough: Ask in Claude → Use trusted metrics → See the dashboard inline → Open the full view → Share with the team.
2. **Why this matters:** the problem, in empathetic language.
3. **Three steps:** connect your data, ask for the view, review and share, each with a status note.
4. **What you can learn:** six business questions and the view each one becomes.
5. **Less setup:** an illustrative blank-canvas vs DataOrbyt comparison, with no time claims.
6. **Start in Claude, continue in DataOrbyt:** what each surface does.
7. **Trusted metrics:** your data → tested model → defined metric → dashboard, with dbt explained.
8. **Alerts and experiments:** supporting features.
9. **How Claude fits in:** the MCP role, permissions, drafts, and “works without Claude”, with a link to the real MCP setup page.
10. **Cost and control**, then **Privacy & security**, each item tagged with its status.
11. **Early access:** a prototype form, then the footer.

### The walkthrough

- **With JavaScript and motion allowed:** it starts when the hero is visible and loops continuously. Each scene stays on screen for about five seconds. There are no playback controls; inactive scenes are `inert` and hidden from assistive technology. It pauses while offscreen.
- **With `prefers-reduced-motion: reduce`:** the first step stays visible without animation. Without JavaScript, all five steps remain available as a static numbered sequence.

## What's real vs. illustrative

| Element | Status |
|---|---|
| Claude conversation, inline dashboard card | **Illustrative mockup** with demo data. Showing a dashboard preview *inside* Claude is **in development**. |
| “Used DataOrbyt · found 3 approved metrics” | Illustrates the real MCP flow. The preview build's MCP server (`POST /mcp`) does have `list_metrics`, `get_metric_definition` and `create_dashboard_draft` tools. |
| “Open full dashboard” | Opens a **real** sample dashboard in the demo app (`/dashboards/d_acme_founder`). |
| Full view: filters, definitions, freshness | These exist in the demo app. The mockup is a simplified illustration. |
| Share dialog, teammate toast | **Illustrative.** Link sharing is **simulated** in the app, and the link shown is labelled as an example, not a real URL. |
| Connectors (Stripe, PostHog, warehouse) | Named as examples. Live connectors are **in development**; the preview uses demo connections. |
| Alerts | Rules and checks work in the preview. Delivery is **simulated**. |
| Experiments | Demo data, shown as descriptive counts. The app reports confidence intervals only when its checks pass. |
| Cost controls | Approved metrics, caching, limits and usage are in the preview (on demo data). Pre-aggregated models are a design approach. No savings are promised. |
| Privacy | Each item is tagged *Design principle*, *In preview* or *Partly on roadmap*. No certifications or compliance claims are made. |
| Early-access form | **Prototype.** It validates locally and then says *“Your request was not sent.”* Nothing is stored or transmitted. |
| “Explore MCP setup” | Links to the **real** `/mcp-api` page in the demo app. |

There are no testimonials, customer logos, measured time savings or performance claims; `landing.test.ts` checks for several of these.

## Checks

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
