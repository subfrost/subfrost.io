# SUBFROST Design System

This document is the operating brief for extending the `/articles` redesign across the rest of `subfrost.io`. Assume the full website will move toward this design language unless a specific product surface has stronger local constraints.

## Product Direction

The target is a minimal editorial/product interface inspired by OpenAI News, adapted to SUBFROST's Bitcoin-native brand. The page should feel calm, technical, liquid, and premium: high information clarity, low ornamentation, no decorative UI chrome, and no marketing-site filler.

Design decisions should pass one test: does this make the product faster to understand, easier to use, or easier to maintain?

## Source Files

- Article index: `app/articles/page.tsx`
- Article reader: `app/articles/[slug]/page.tsx`
- Article UI components: `components/articles/*`
- Editorial CSS variables and responsive rules: `app/globals.css`
- Brand source package: `brand/subfrost`
- Runtime brand assets: `public/brand/subfrost`
- Open Graph article image: `app/articles/opengraph-image.tsx`
- CMS article reads: `lib/cms/articles.ts`

## Ownership Model

Editorial content is CMS-managed and backed by Postgres. Do not hard-code article copy, authors, tags, translations, bodies, or cover image URLs unless creating local fallback data for deploy previews.

Git owns the site shell: layout, typography, navigation, category presentation, image rendering, metadata, SEO routes, footer, responsive behavior, and fallback preview data.

## Brand

- Typeface: Geist for all UI and editorial surfaces. Geist Mono is reserved for code, data, hashes, and technical labels.
- Primary logo: use the official SUBFROST logotype. Use the standalone logomark only for favicons, social previews, avatars, and tight icon placements.
- Light surfaces: use `logotype_black.svg`.
- Dark surfaces: use `logotype_white.svg`.
- Do not recolor logos with CSS filters. Choose the correct SVG for the surface.
- Core colors:
  - Carbon: `#212121`
  - Frost: `#E9F0F7`
  - Glacial: `#A7C6DC`
  - Flare: `#EC4521`
- Current editorial palette maps those tokens into CSS variables in `app/globals.css`. Prefer variables such as `--ed-canvas`, `--ed-ink`, `--ed-muted`, and `--ed-ice` over raw values.

## Layout

- Use a white page background in light mode and true black in dark mode.
- Keep the header solid, not translucent. On scroll it should remain visually stable and must not jump, shake, or resize.
- Keep desktop content aligned to the same max-width grid. The current editorial max width is `1440px`.
- Match OpenAI-style top spacing: generous whitespace between header, page title, filters, and first content grid.
- On mobile, prioritize vertical rhythm and readable scan order: logo/header, page title, filters, featured article, recent feed, topic sections, footer.
- Header/filter interactions must not shift the logo, nav, page title, or content grid.

## Typography

- Use normal sentence case. Avoid all-caps labels except where a brand asset itself includes uppercase.
- Page titles are large and quiet. The `/articles` title is the active topic, for example `All`, `Research`, `Protocol`, or `Developer`.
- Section labels use the same text color family as body copy, not saturated blue.
- Article/card titles should be readable before decorative hierarchy. Prefer medium weight over bold-heavy treatment.
- Metadata uses compact text: category, date, source, and optional reading time.

## Navigation

- Top nav is text-first and minimal: Markets, Swap, Vaults, Blog, search, language, and Launch App.
- The active nav item uses ink color; inactive items use muted color.
- Hover states are intentionally minimal. Use pointer affordance and subtle color consistency, not background pills or animated decoration.
- Topic filters are text links, not pills. Order: Research, Protocol, Developer, All.
- Query/filter changes should behave like OpenAI News: update the visible topic view without disturbing header position or causing layout flash.
- EN/ZH language toggles must preserve scroll position and persist through article links.

## Images And Cards

- Use high-quality ice/frost imagery with unique thumbnails per article/card.
- Order imagery from lightest near the top to darkest lower on the page.
- Do not overlay category text on images.
- Match OpenAI image rounding: small radius, currently `6px`.
- Cards should feel like content, not containers. Avoid borders, heavy backgrounds, and nested cards.
- Hover animation is allowed only when extremely subtle:
  - `transition: box-shadow 400ms cubic-bezier(0,0,0,1), transform 400ms cubic-bezier(0,0,0,1)`
  - no opacity fade
  - no gray image overlay
  - no large movement
  - respect `prefers-reduced-motion`

## Article Reader

- Match the OpenAI article structure: centered metadata, large centered title, concise subtitle, then readable article body.
- Do not show the article cover image on the reader page unless explicitly requested.
- Do not show author cards, "all articles" clutter, or decorative panels.
- Body width should stay narrow enough for comfortable reading.
- CMS markdown remains the source of truth for article body copy.

## Footer

- Footer follows an OpenAI-style utility model: compact link columns, social icons, copyright, terms/privacy links, language pill, and theme toggle.
- Subscribe belongs inside the footer/link area, not as a large standalone marketing band.
- On mobile, bottom utilities should center like OpenAI: social row, copyright/legal row, language/theme controls.
- Dark mode footer should use true black and enough contrast for form inputs and links.

## Search

- Header search opens a smooth, full-width editorial search panel.
- Current placeholder copy is `Search articles`.
- The search submit button should become black when input has text. Empty input stays muted.
- Search can become an AI answer surface later, but current behavior should remain article-search focused.

## Internationalization

- `?lang=zh` controls Chinese copy for nav, filters, footer, subscribe, metadata labels, and article links.
- Changing language must not scroll the user to the top.
- Links from `/articles` to `/articles/[slug]` should preserve the active language.

## SEO And Sharing

- Keep `/sitemap.xml`, `/robots.txt`, and `/llms.txt` git-managed but data-aware.
- Article pages should include canonical metadata, localized alternates, OG/Twitter metadata, and article structured data.
- OG images use the official logomark/logotype treatment with lowercase `subfrost` and the line `Bitcoin's next-gen defi experience`.
- Use the favicon from the official logomark.

## Impeccable Workflow

The repo includes Impeccable so design QA is repeatable.

At the start of a material design task:

```bash
pnpm install
pnpm exec impeccable install
```

During work:

```bash
pnpm impeccable
```

For broader redesign work:

```bash
pnpm impeccable:site
```

Impeccable is an audit aid, not a replacement for browser QA. Before design handoff, also capture desktop, tablet, and mobile screenshots; check console errors; verify light/dark mode; verify EN/ZH; and inspect the Netlify preview if a public review link is requested.

## Handoff Checklist

- `pnpm exec tsc --noEmit`
- `pnpm test -- tests/articles`
- `pnpm build`
- `pnpm impeccable`
- Browser QA at desktop, tablet, and mobile widths
- Check light mode, dark mode, EN, and ZH
- Check article index, filtered topic views, and at least one article reader
- Confirm public preview link if the work is being sent to a client
