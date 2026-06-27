# subfrost Design Language

This is the operating design contract for `subfrost.io`. Treat the article redesign as the seed of the full site redesign: every future marketing, docs-adjacent, legal, support, and product-entry page should move toward this language unless a product surface has a stronger functional constraint.

The standard is quiet, technical, premium, and fast. subfrost should feel like Bitcoin-native infrastructure with the discipline of a world-class editorial product: high clarity, low ornamentation, deliberate spacing, excellent assets, and no decorative UI noise.

Every design decision must pass this test:

- Does it make the product faster to understand?
- Does it make the interface easier to operate?
- Does it make the system easier to maintain?
- Does it strengthen the brand without adding clutter?

If the answer is no, remove it.

## Living Contract

`design.md` is not a mood board. It is the source of truth for how the website should look, feel, move, and scale.

When any design-facing work changes the site, the loop is:

1. Read this document before editing.
2. Inspect the current implementation and the brand kit.
3. Make the smallest code changes that move the site toward the system.
4. Update this document if a new design decision is made or an old rule changes.
5. Run the design QA loop before handoff.

No PR that materially changes the UI should ship without checking whether `design.md` needs an update. If implementation and this document diverge, that is design debt.

## Source Of Truth

Git owns structure and experience:

- Site shell, navigation, footer, layout, theme, metadata, routes.
- Page templates for articles, privacy, terms, support, and marketing surfaces.
- Design tokens, responsive rules, search behavior, internationalized UI copy.
- Fallback preview content used only when production CMS data is unavailable.

The CMS owns editorial data:

- Article titles, slugs, excerpts, bodies, authors, tags, translations, publish state, and cover images.
- Do not hard-code production editorial copy in React components.
- Local fallback articles are allowed only for deploy previews and design review without production Postgres access.

## SEO And LLM Discoverability

Public pages are product surfaces and machine-readable assets. When adding or materially changing a public route, update the full discovery contract in the same PR:

- Page-level metadata: title, description, canonical URL, language alternates, Open Graph, Twitter card, and focused keywords.
- Structured data: use JSON-LD that matches the page type. Homepage should expose `Organization`, `WebSite`, `WebPage`, product `ItemList`, app surface, and FAQ. Articles index should expose `CollectionPage` and article `ItemList`. Article pages should expose `Article`. Author pages should expose `ProfilePage` and `Person`. Developer/docs pages should expose their reference lists.
- Sitemap: include every crawlable public route and localized variant that should rank.
- `llms.txt`: include high-value human routes plus machine-readable APIs that LLM crawlers should prefer for fresh stats, articles, authors, and volume data.
- Copy: metadata must match the current product pitch. Do not leave old bridge/EVM copy in root metadata, unfurls, or LLM descriptions.
- Localization: Chinese pages should have Chinese titles/descriptions and correct `zh-CN` language signals.
- API data: expose raw values in machine-readable endpoints; UI formatting belongs in the page.

If a page is important enough to put in the header or homepage, it is important enough to be in metadata, structured data, sitemap, and `llms.txt`.

Key implementation files:

- Article index: `app/articles/page.tsx`
- Article reader: `app/articles/[slug]/page.tsx`
- Brand kit page: `app/brand/page.tsx`
- Developer gateway: `app/developer/page.tsx`
- Legal/support pages: `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/support/page.tsx`
- Article components: `components/articles/*`
- Editorial CSS/tokens: `app/globals.css`
- CMS reads: `lib/cms/articles.ts`
- SEO helpers: `lib/seo.ts`
- OG image: `app/articles/opengraph-image.tsx`
- Brand source package: `brand/subfrost`
- Runtime brand assets: `public/brand/subfrost`

## Design Thesis

subfrost should not look like a generic crypto landing page. Avoid gradients, glass panels, cartoon DeFi metaphors, dark-blue SaaS clutter, oversized hero copy, token badges, and decorative cards.

The visual language is:

- OpenAI-style editorial structure.
- subfrost brand assets and cold Bitcoin-native imagery.
- Spacious, asymmetric layouts with a strong left edge.
- Real content, not marketing filler.
- Minimal controls that feel engineered, not styled.
- Fast page transitions and almost invisible motion.

The site should feel expensive because it is restrained.

## Brand Assets

The full client brand package lives in `brand/subfrost`. Only optimized assets needed at runtime should be copied into `public/brand/subfrost`.

Use the official marks. Do not redraw, filter, distort, recolor, letter-space, or manually typeset the logo when a supplied asset exists.

Logo rules:

- Preferred public wordmark casing is lowercase `subfrost`. This is the default for headers, footers, brand kit surfaces, social previews, and future marketing pages.
- `SUBFROST` is allowed only where an existing official asset is all-caps, where legacy product/legal copy already uses all-caps, or where a constrained system field requires it.
- Never use title-case `Subfrost` as a visual brand lockup. In prose, prefer lowercase `subfrost` for brand-led marketing copy and reserve `SUBFROST` for product/legal references already written that way.
- Primary header mark is the official logotype.
- On light/editorial surfaces, use the blue-snowflake logotype when available: `logotype_dark.svg` in the runtime brand folder.
- On black/dark surfaces, use `logotype_light.svg`: the wordmark turns light, but the snowflake remains Glacial blue.
- Use the standalone logomark for favicon, app icons, avatars, social thumbnails, and very tight placements; favicon/apple icon files must be transparent PNG/SVG marks with no square, circle, or profile-card background.
- Minimum logotype height is 32px unless the viewport physically cannot support it.
- Preserve clear space around the mark. A practical rule is at least half the logo height on all sides.
- Logo position must never shift when filters, search, language, or theme changes.
- Mobile logo should feel proportionate to the Launch App button and OpenAI mobile header proportions. If it looks small next to the header controls, increase the mark before increasing nav text.

Favicon:

- Use the official logomark.
- Use the blue/Glacial snowflake variant across light and dark browser UI. Do not swap the snowflake to white unless a platform hard-requires a monochrome mask.

OG/unfurl:

- Use `/brand/subfrost/Graphics/jpeg/unfurl.jpg` as the shared site-wide social preview image.
- The image must use the exact same frost banner image used on the homepage, full-bleed with no white frame. Keep the native banner composition so the snowflake mark and lowercase `subfrost` wordmark remain visible in messaging app previews.
- Do not include topic lists, divider lines, or decorative text blocks in the OG image.

## Brand Kit Page

The `/brand` page is the public expression of the brand system. It should feel like the OpenAI brand page in discipline and information architecture, while remaining unmistakably subfrost.

Purpose:

- Show how to use the brand without requiring a private handoff.
- Make approved logo, color, typography, and imagery decisions obvious.
- Give designers, developers, partners, and reviewers a single reference point.
- Reduce repeated subjective design debate across future redesign work.

Structure:

- Hero: centered page title, concise thesis, Download guidelines and Contact support actions.
- Large media card immediately after the hero using official brand graphics.
- Logo section showing black-on-white and white-on-black logotypes.
- Logomark section showing the snowflake as a compact symbol, paired with frost imagery.
- Color section showing Carbon, Frost, Glacial, and Flare swatches.
- Typography section showing Geist and Geist Mono specimens.
- Imagery section showing light and dark frost assets.
- Usage rules section with short, operational do/don't guidance.
- Downloads section linking to the PDF guidelines and core SVG assets.

Layout:

- Use the same `1440px` max-width and editorial shell as `/articles`.
- Section intros are centered and narrow, around `720px`.
- Media grids use small 6px radii and no decorative borders.
- Spacing is intentionally generous; the page should feel like a design manual, not a settings page.
- Keep actions text-first unless the action is a primary app CTA.

Copy:

- Use sentence case.
- Avoid marketing filler.
- State rules plainly.
- Chinese localization should cover section headings, intro copy, and utility actions.

Assets:

- Runtime page assets live under `public/brand/subfrost`.
- Full client source package stays under `brand/subfrost`.
- Use JPEG brand graphics for page display when file size is materially better than PNG.
- Keep PNG/SVG assets available for download/use where fidelity matters.

Do not:

- Recreate the logo in text.
- Use screenshots of the PDF as the page.
- Add decorative gradients or crypto motifs.
- Put cards inside cards.
- Add all-caps section labels.
- Make the page depend on CMS data.

## Developer Gateway

The `/developer` page is the git-managed front door for technical users. It is not the full docs system. Deep protocol references, API specifications, and long-form setup guides remain hosted on `docs.subfrost.io` until that repository is available.

Purpose:

- Give engineers and partners one polished starting point from the marketing site.
- Route users quickly to docs, technical overview, API docs, app, protocol updates, and support.
- Carry the same OpenAI-inspired editorial design language into developer surfaces.
- Avoid duplicating source-of-truth protocol documentation in the marketing repo.

Design rules:

- Use the same `EditorialShell`, Geist typography, and image-card system as `/articles` and `/brand`.
- Keep the page text-first and quiet. No heavy sidebars, boxes, product-marketing cards, or crypto jargon blocks.
- Use image-led cards only for primary references. Secondary surfaces should be plain text links with small sideways arrows.
- Every deep technical link must point to the canonical docs URL until docs ownership moves into this repo.
- If the docs repo becomes available, redesign docs to match this page rather than inventing a separate docs aesthetic.

## Admin Portal

The `/admin` CMS is an operational product surface. It should use the same subfrost editorial tokens, typography, logo handling, and motion restraint as the public site, but its information density should be higher and its hierarchy should prioritize repeated work over marketing presentation.

Direction:

- Use the shared `--ed-*` editorial tokens instead of one-off dark navy/zinc palettes.
- Keep the shell quiet: official wordmark, thin hairlines, text-first nav, no heavy filled sidebar panels.
- Use icons only as small scanning aids in navigation and operational controls.
- Keep active state subtle: ink text plus a small hairline or restrained indicator, not blue pills or glowing backgrounds.
- Dashboard stats should follow the homepage data language: top hairline, muted label, mono value, optional quiet status text.
- Tables should be plain operational rows with subtle dividers. Avoid rounded boxed table containers unless the table is inside a modal or repeated card list.
- Loading states use skeletons, not `Loading...` text, and should inherit editorial tokens.
- Dark mode should be true black/editorial dark, not navy. Logo assets must swap through the official light/dark logotypes.
- The article CMS should use Ghost's publishing workflow as the product reference: top publishing chrome, writing canvas first, feature image as a first-class asset, and a right settings rail for URL, language, tags, cover image, feature status, publishing, and destructive actions.
- Admin publishing UI always uses `Articles`, matching the public site. Do not introduce `blog` or `posts` labels in visible CMS copy.
- Article rows should be content previews, not spreadsheet rows: title, excerpt, tags, language, status, author, updated time, and a subtle arrow affordance.
- Feature image inputs must support direct upload through `/api/admin/upload` with `kind=cover`, plus manual URL editing for API/backfill workflows.

Do not:

- Build nested cards inside the admin shell.
- Use all-caps table headers or labels for ordinary UI.
- Reintroduce saturated blue dashboard buttons unless they represent a primary action and no quieter affordance works.
- Make CMS pages feel like a separate product from the public site.

## Color System

Brand bases:

- Carbon: `#212121`
- Frost: `#E9F0F7`
- Glacial: `#A7C6DC`
- Flare: `#EC4521`

Color scale rule from the brand files:

- Each base color can generate 3 lighter and 3 darker steps.
- Move in 4% lightness increments.
- Lighter steps: `+4%`, `+8%`, `+12%`.
- Darker steps: `-4%`, `-8%`, `-12%`.
- Do not invent nearby blues, grays, or oranges by eye. Add semantic tokens using this rule.

Current editorial CSS variables in `app/globals.css` are the implementation bridge:

- `--ed-canvas`: page background.
- `--ed-ink`: primary text and active controls.
- `--ed-body`: long-form body copy.
- `--ed-muted`: metadata, secondary nav, captions.
- `--ed-hair`: subtle dividers when a divider is unavoidable.
- `--ed-accent`: link/accent color.
- `--ed-ice`: focus rings and cold highlight.
- `--ed-flare`: rare alert/emphasis color.
- `--ed-surface`: soft surface color.
- `--ed-cover`, `--ed-cover-2`: fallback cover tones.
- `--ed-placeholder`, `--ed-placeholder-focus`, `--ed-button-muted`: form states.

Light mode:

- Canvas is white.
- Primary text is near Carbon / editorial ink.
- Muted text is cool gray-blue, not saturated blue.
- Surfaces should mostly disappear. If a surface is needed, use a very light Frost-derived tint.

Dark mode:

- Canvas should be true black or visually equivalent to OpenAI dark mode.
- Avoid the old navy-sheet look.
- Text should be white/off-white with muted gray secondary text.
- The top of mobile screens must not show a white bar caused by page background, theme-color, or body/html mismatch.

Flare:

- Flare is not a decoration color.
- Use it only for destructive/error states, urgent alerts, or intentional brand accents.
- Never use Flare as a broad UI theme.

## Typography

Primary typeface:

- Geist Sans everywhere for UI and editorial content.
- Geist Mono only for code, hashes, technical labels, or data readouts.
- Use the locally supplied Geist fonts when practical.

Tone:

- Sentence case by default.
- No all-caps labels in the editorial UI.
- No aggressive tracking.
- No negative letter spacing.
- No novelty newspaper serif unless a specific editorial article template calls for it.

Weights:

- Page titles: normal to medium.
- Card titles: normal.
- Metadata keys: medium when needed.
- Footer headings: normal, muted.
- Buttons: medium.
- Avoid heavy bold except for emphasis inside long-form content.

Scale:

- Article index title: large and simple, currently topic-driven (`All`, `Research`, `Protocol`, `Developer`).
- Card title: readable before dramatic.
- Recent feed titles: compact, text-first.
- Article reader title: large, centered, OpenAI-like.
- Body prose: narrow width, comfortable line height, no dense crypto whitepaper texture.

## Layout System

Core grid:

- Max width: `1440px`.
- Desktop horizontal padding: `32px` where possible.
- Mobile horizontal padding: `24px`, reducing only when necessary.
- Strong shared left edge across header, title, filters, grids, and footer.

Vertical rhythm:

- Header to title spacing should match OpenAI News proportions: generous, not cramped.
- Title to filters: close enough to read as a group.
- Filters to first content row: open enough to breathe.
- Topic sections should not have accidental empty gaps.

Desktop article index:

- Title and filters lead the page.
- Featured article takes more width than the Recent feed.
- Recent feed is a right-side text feed, not card stacks.
- Topic sections use a left descriptor column and right content grid.

Mobile article index:

- Header.
- Title.
- Filters.
- Featured.
- Recent.
- Topic sections.
- Footer.

Mobile should never feel like desktop columns squeezed into a phone.

## Header

The header is a product-control surface, not a hero.

Rules:

- Sticky at top.
- Solid background. No translucency.
- No scroll shrink, shake, or stuck intermediate states.
- No color transition flicker on dark/light toggle.
- Header content must remain anchored when filters or query params change.
- Logo left, nav next, utilities right.
- Search icon sits with nav on desktop and with compact controls on mobile.
- Language toggle and Launch App live on the right.

Navigation:

- Desktop nav items use compact top-level groups: Trade, Developer, Articles, Search.
- Chinese mode localizes menu items.
- Active item uses `--ed-ink`.
- Inactive items use `--ed-muted`.
- Hover states should match OpenAI: no pills, no background, no chevrons, no button chrome; use pointer cursor and steady text color behavior.
- Trade and Developer open their full-width editorial panels on hover and keyboard focus. The panel stays open while the cursor or focus remains inside the header/menu region, then exits with the shared editorial easing.
- Focus states must be accessible but should not show browser-orange default outlines.

Mobile menu:

- Match OpenAI mobile menu structure.
- Full-screen menu.
- Large stacked top-level nav links first; do not dump nested Trade or Developer links into the root drawer.
- Trade and Developer drill into their own simple link views, with a small `Home` return action and the same editorial easing.
- Search and panel/menu icons remain top-right.
- Dark mode menu is true black.
- Launch App appears as a large text action with external arrow inside the menu.
- Language control appears below primary actions.

## Buttons And Controls

Buttons should be chosen by function, not decoration.

Primary CTA: Launch App

- Label: `Launch App`.
- Shape: clean rounded rectangle, aligned with the image corner language.
- Current radius target: `6px`.
- Background: `--ed-action-bg` (`Carbon` on light mode, `Frost` on dark mode).
- Text: `--ed-action-fg` (`Frost` on light mode, `Carbon` on dark mode).
- Include a small up-right arrow.
- Border: extremely light, only enough to refine the edge.
- No gray-out hover state.
- No pill shape.

Search and subscribe submit buttons:

- Compact square rounded rectangle, not a floating circle.
- Current radius target: `6px`.
- Empty state: muted.
- Text present: `--ed-action-bg` (`Carbon` on light mode, `Frost` on dark mode).
- Success: green check icon, small and precise.
- No success text below the form.
- Animate state change quickly and elegantly.

Text links:

- No boxes.
- No background hover.
- External links may use a tiny up-right arrow in nav/menu/action contexts when the external destination matters.
- Footer column links do not use arrows; keep them plain and quiet.
- Recent-feed article links use a straight right arrow, same size as the current arrow, not up-right.
- Recent-feed arrows should sit immediately after the title text, including on wrapped titles. They should never drift to the far right edge of the feed column.

Controls:

- Language pill is acceptable because it is a system utility.
- Theme toggle belongs near language controls, including bottom/footer placement.
- Avoid using pill styling for content filters or metadata tags.

## Forms

Subscribe is a footer utility, not a hero block.

Rules:

- Keep it compact.
- The input width should approximate a normal email address such as `josh@area21.io`.
- The submit button must sit beside the field on mobile and desktop.
- The button should be close to the field.
- The input/button group may have a very subtle rounded rectangle border.
- Dark mode placeholder text must be readable.
- Button turns ink/black when text is present.
- On success, the button becomes a small green check.
- Do not render success body text under the form.

Search form:

- Header icon opens the search panel.
- Placeholder: `Search articles`.
- Search submit button follows the same active/inactive rule as subscribe.
- This is not yet an AI answer product. Do not imply AI answers until that feature exists.

## Imagery

Image direction:

- Cold, crystalline, liquid, glacial, precise.
- Realistic or generated bitmap imagery is acceptable when it feels premium.
- Avoid generic crypto, coins, chains, neon, dark bokeh, or abstract SVG hero shapes.

Article thumbnails:

- Every visible article/card preview image should be unique.
- Order imagery from lightest near the top to darkest lower on the page.
- Top/featured images should be airy and bright.
- Bottom rows can move darker and deeper.
- Do not overlay category labels on images.
- Do not gray out images on hover.
- Preserve image quality; optimize delivery instead of degrading assets.

Image shape:

- Match OpenAI News image corners.
- Current radius target: `6px`.
- Same corner radius on featured, topic cards, docs cards, and future content thumbnails.
- No heavy shadows.
- No borders.

Performance:

- Use optimized static assets where possible.
- Use `sizes`, eager/fetch priority only for the lead image, and lazy loading for lower content.
- Avoid shipping massive unused images to the client.

## Cards And Motion

Cards should barely feel like cards.

Sitewide motion:

- Editorial pages must enter and exit smoothly. Same-tab links should never hard-flash from one document to another when the current site can control the transition.
- Use one shared easing system for editorial motion:
  - Fast interaction: `180ms cubic-bezier(0,0,0,1)`.
  - Page/content entrance: `360ms cubic-bezier(0.16,1,0.3,1)`.
- Page exits should be nearly invisible: slight opacity fade, at most `1px` blur, at most `2px` vertical movement.
- Page entrances should feel like the surface becoming ready, not like an animation demo.
- Ticker and external product links should use the same smooth exit treatment before navigation. This reduces the white/black flash when leaving the marketing site for the app.
- Internal links should keep client-side navigation where possible; do not force full reloads just to get an animation.
- External app destinations should also maintain matching body/html background colors. The marketing site can smooth the exit, but it cannot fully control the destination app's first paint.
- All motion must respect `prefers-reduced-motion`.

Scroll-reveal statements:

- Large hero statements may use a muted word layer plus an active word layer that reveals as the user scrolls.
- The effect should feel like reading progress, not a gimmick. No bouncing, rotation, blur trails, or per-letter animation.
- Use `--ed-muted` for unrevealed text and `--ed-ink` for revealed text.
- The statement must remain readable without JavaScript and must expose a single non-duplicated accessible label for screen readers.
- Keep the copy product-specific. Do not use generic API or infrastructure claims borrowed from another site.

Navigation:

- Product execution links such as Markets, Swap, and Vaults should live under one `Trade` menu in the editorial header.
- Trade should also expose `Volume` when available. Keep navigation as routing first: a compact endpoint-backed preview may live inside the Volume item, but do not add a detached right-side analytics panel or modal-style chart controls to the header. Surface compact 24H volume near the homepage protocol stats, and keep dense chart controls in the destination surface.
- Until the volume experience is rebuilt in the editorial system, `/volume` may route to the existing protocol volume chart component. The header and homepage stats should link there rather than to a missing external app route.
- Developer links should live under one `Developer` menu in the editorial header. Label the primary entry `Gateway`, then include docs, API docs, technical overview, and high-value integration references without crowding the top nav.
- Trade and Developer must share one standardized mega-menu pattern: full-width editorial panel, muted eyebrow, large primary links, optional right-side resource list, small arrow icons inside menu items only, no top-nav chevrons, no floating card dropdowns, no nested cards, and the same open/close easing.
- Keep the top-level header minimal: brand, Trade, Developer, Articles, search, language, primary app CTA.
- Mobile menu root uses OpenAI-style top-level navigation only. Trade and Developer drill into section-specific views; keep primary links large and resource links smaller.

Protocol analytics:

- Homepage analytics should show a compact live summary first, then defer dense charting to an explicit action.
- The homepage should consume `/api/stats` as the contract for raw market and protocol stats. Format numbers in the UI; do not ask the API for `$`, commas, or unit-suffixed strings.
- `/api/stats` may expose the production nested shape `{ metrics, marquee }` and should also expose normalized flat fields for page clients: `totalBtcLocked`, `currentFrbtcSupply`, `lifetimeTxValueBtc`, `lifetimeTxValueUsd`, `btcUsd`, `btcHeight`, `msHeight`, `dieselUsd`, `fireUsd`, `btcDieselPrice`, `btcFirePrice`, and `updatedAt`.
- The three protocol cards derive from the same underlying values as the legacy homepage: total BTC locked equals Alkanes locked plus BRC2.0 locked; current frBTC supply equals Alkanes circulating plus BRC2.0 circulating; lifetime tx value equals total unwraps plus current circulating supply, with USD conversion coming from BTC/USD.
- The market ticker should show BTC height, MS height, BTC/USD, BTC/DIESEL, and BTC/FIRE. BTC/DIESEL and BTC/FIRE should come from the normalized `/api/stats` contract, derived once from `btcUsd / tokenUsd`; UI derivation is only a legacy fallback.
- The market ticker should not use an infinite side-scroll marquee. Use one readable strip with staggered fade/slide item reveals and periodic in-place refresh animation, OpenAI-style easing, no text truncation, and reduced-motion support.
- Keep the protocol stat cards near the ticker and animate the data values, not the layout frame. The bottom stat row should not reuse the ticker row's item load/cycle animation; keep only the native/USD value flip so the cards stay calm. Lines, spacing, and cards stay fixed to avoid layout shift/text clipping. Support reduced motion.
- Protocol stat cards may alternate native BTC/frBTC units with USD value on the same refresh cadence. Render both values in one fixed grid cell and animate only opacity/vertical offset so the card width never jumps.
- Protocol stat USD values must be derived from the normalized BTC/USD market price used by the ticker and rendered with two decimals. If an upstream BTC/USD value arrives as a shorthand thousands value such as `61.101`, normalize it before conversion so `101 BTC` displays near `$6,100,000.00`, not `$6,100.00`.
- Large homepage imagery should reserve its aspect ratio and reveal with a simple opacity/scale transition. Avoid lazy pop-in when the asset is visible in the first viewport after the data band.
- Homepage refresh should cascade top to bottom: eyebrow, title, statement, CTA, data band, hero image, then lower sections. Use one subtle opacity/translate reveal, no blur, bounce, rotation, or competing entrance effects.
- Homepage cascade must reserve final layout space from first paint so the page does not jump while it becomes visible. Respect `prefers-reduced-motion` by rendering content immediately.
- The hero scroll statement should let the first product promise read clearly, then begin the faded scroll boundary on `liquidity` so `liquidity into AMM pools and vaults on Bitcoin` has room to animate. Keep the effect text-only: no blur, scale, or layout movement.
- Volume surfaces should preserve source filters for Both, Alkanes, and BRC20, and both volume and cumulative modes.
- Do not drop wrap/unwrap context when moving analytics into editorial surfaces; those flows are product evidence, not decorative metrics.

Docs:

- Public docs pages should backfill from the existing docs.subfrost.io sitemap/source pages only. Do not add unsourced technical claims or guessed command syntax.
- Docs pages use the editorial shell, mobile-visible section navigation, horizontally safe tables/code, and the same restrained link/arrow language as the homepage.

Team and proof:

- Team sections should read as proof, not vanity. Lead with why the roster matters: protocol authorship, execution history, distribution, and credible advisors.
- Use editorial rows or compact repeated cards with real images, name, role, and one concrete credibility point.
- On wide screens, split `Core team` and `Advisors` into two balanced columns so the proof section does not create dead whitespace.
- Avoid large dark profile-card grids on the editorial homepage; they dilute the articles-page aesthetic.

Author profiles:

- Article cards and article detail pages should expose the author profile link visibly, not only through SEO metadata.
- Avoid nested anchors: the cover/title can link to the article, and the byline links separately to the author profile.
- Author profile pages should use the same editorial spacing, typography, and quiet row cards as `/articles`.

Default:

- Transparent container.
- Image + title + metadata.
- No heavy background.
- No border.
- No nested card.
- Pointer cursor when the whole card is clickable.

Hover:

- Very subtle only.
- Current rule: half-strength lift/shadow, with no opacity change.
- Suggested transition:
  - `transform 400ms cubic-bezier(0,0,0,1)`
  - `filter` or `box-shadow 400ms cubic-bezier(0,0,0,1)`
- Movement should be about `-1px`, never a dramatic lift.
- Respect `prefers-reduced-motion`.

Do not use:

- Image dimming.
- Gray overlays.
- Border reveal.
- Background color cards for the main article grid.
- Animated scale that causes layout blur.

## Article Index

The `/articles` page is the model for the redesign.

Page title:

- Reflects the active filter.
- `All` for unfiltered.
- `Research`, `Protocol`, `Developer` for filtered topic views.
- Chinese equivalents when `?lang=zh`.

Filters:

- Order: Research, Protocol, Developer, All.
- No `Browse By Topic` label.
- Text links only.
- Active filter uses ink.
- Inactive filters use muted text.
- Changing filters should feel like OpenAI News: content updates without header movement or page jump.

Featured:

- Label: `Featured`.
- Label color should match regular UI text, not saturated brand blue.
- Large image left.
- Title and metadata below image.
- Use normal title weight.
- No arrow required on the featured title.

Recent feed:

- Label: `Recent`.
- Show 5 items when available.
- Include article/docs backfill when there are fewer CMS articles.
- Titles are text-first and compact.
- Add a tiny straight right arrow after each title.
- Metadata row: category/source and date/source.
- No `View All`.
- No cards/background boxes.

Topic sections:

- Sections: Research, Protocol, Developer.
- Left column contains title and short description.
- Right column contains article/doc cards.
- Developer cards should visually match article cards, including image treatment.
- Developer cards can link to existing docs pages until docs are redesigned.
- When the docs repo becomes available, redesign docs around the same editorial system: OpenAI-like spacing, Geist typography, image-led hero moments only when useful, text-first navigation, no heavy sidebars, no boxed marketing cards, and direct Developer/API/Protocol pathways.
- Remove standalone `Articles By Topic` label.

Load more:

- Only show when there are actually more articles to load.
- It belongs under the relevant article grid, not as a floating page artifact.

## Article Reader

Article pages should move closer to OpenAI article pages.

Header:

- No cover image.
- No author card.
- No `All Articles` clutter unless a back link is explicitly needed for navigation.
- Center metadata above the title.
- Metadata: date, category, optionally author only when needed.
- Large centered title.
- Concise centered excerpt below title.

Body:

- Narrow readable column.
- Comfortable line height.
- No decorative side panels.
- No drop cap.
- Markdown remains CMS-owned.
- Body copy is never rewritten for design.

Below article:

- Footer system follows content.
- Subscribe belongs in footer area, not as a separate promotional band.

## Footer

Footer follows OpenAI utility structure, adapted to subfrost.

Desktop:

- Same max-width grid as page content.
- Subscribe column plus link columns.
- Columns: Developer, Product, Company.
- Links are text-first, no boxes.
- Footer links are plain text, even when external.
- Social icons use ink color in light mode and high-contrast white/off-white in dark mode.
- Footer social row includes X, Discord, and GitHub in that order. Keep icons the same optical size and do not add labels, circles, borders, or hover color shifts.
- Legal links should appear once. Do not duplicate Terms/Privacy in both columns and the copyright row.

Mobile:

- Link columns stack cleanly.
- Bottom utilities center like OpenAI:
  - social icons row
  - copyright/legal row
  - language/theme controls row
- Language pill and theme toggle belong together near the bottom.
- Dark mobile footer should be true black with readable muted labels.

Subscribe in footer:

- Compact left-side module on desktop.
- On mobile it should feel like part of the footer, not a separate section.
- Keep field and submit button inline.

## Search Experience

Search should feel like a high-end command surface, not a hash jump.

Behavior:

- Click search icon.
- Header icon remains the search icon; do not swap it into an X.
- Full viewport search layer opens under the header.
- Input animates in smoothly.
- Closing reverses smoothly.
- Escape, repeat-clicking the search icon, or clicking outside the search panel should close without layout flash when supported.
- Search must not push a hash or route just to open.
- Search should cover first-party public content: product pages, docs, articles, authors, support, brand, legal, and protocol pages.
- Results should be returned from one API boundary so the provider can later be swapped for hosted search without redesigning the UI.
- Empty search may show high-value suggestions; typed search should update quickly with bounded results.

Visual:

- White or black canvas matching theme.
- Centered input row with stable reserved width.
- Large quiet placeholder.
- One subtle underline or border is acceptable if needed.
- Submit button is muted until the user types into the input, matching the form-control standard used across the app.
- If typed input has no navigable result yet, the button may remain disabled but should visually follow the typed/active input state.
- Results use editorial rows: muted section label, title, short description, small arrow. No result cards.

Copy:

- English: `Search subfrost`
- Chinese: `搜索 subfrost`

## Internationalization

Language state uses `?lang=zh`.

Requirements:

- Default URL is English.
- Chinese URL uses `?lang=zh`.
- First-time `/articles`, article reader, and author visits may default to Chinese when the visitor resolves from CN/HK infrastructure or the browser/system `Accept-Language` preference is Chinese.
- Automatic language detection must never override an explicit `?lang=` or a saved `subfrost_locale` user preference.
- Nav items translate.
- Topic filters translate.
- Footer columns translate.
- Subscribe copy translates.
- Search copy translates.
- Article links preserve language when moving from index to reader.
- Toggling language must not scroll the user to the top.
- Manual toggles must save the preference for future visits.
- Footer language pill reflects active locale:
  - English / United States
  - 中文 / 中国

Do not localize the subfrost brand name.

## Theme Behavior

The site supports light and dark modes.

Rules:

- Respect system settings by default.
- Theme toggle is available in footer/bottom controls.
- Light mode uses white canvas.
- Dark mode uses true black canvas.
- Header, body, footer, and mobile browser theme color must agree so no white strip appears at the top of mobile dark mode.
- Toggle transitions should not create weird color flash in the menu.
- Logo switches to the correct official asset per theme.

## Legal And Support Pages

Privacy, Terms, and Support are part of the redesign, not leftover utility pages.

Direction:

- Same header/footer.
- Same typography.
- Same max-width grid.
- Minimal page title and compact body.
- No decorative cards unless they solve a real information-architecture problem.
- Support page can use clear contact/help sections, but keep it editorial and sparse.
- Legal pages should prioritize readability and trust.

## SEO, Metadata, And Sharing

Required:

- Canonical URL.
- Localized alternates.
- Open Graph image.
- Twitter card.
- Sitemap.
- Robots.
- `llms.txt`.
- Article JSON-LD for article pages.

Metadata tone:

- Prefer lowercase `subfrost` in visible marketing metadata and visual unfurl lockups.
- Use `SUBFROST` only where an existing product/legal page already uses that casing or when a platform field benefits from legacy all-caps recognition.
- Do not use title-case `Subfrost` as the displayed brand name.
- Keep descriptions search-friendly but not keyword-stuffed.

Article index keywords should cover:

- subfrost
- Bitcoin DeFi
- Bitcoin-native yield
- frBTC
- Bitcoin infrastructure
- Protocol updates
- Research

## Accessibility

Minimum bar:

- Keyboard-accessible nav, filters, search, language, theme, and subscribe.
- Visible focus states that use subfrost tokens, not browser-default orange.
- Adequate contrast in dark mode and light mode.
- No text hidden by mobile browser chrome.
- Tap targets large enough on mobile.
- Motion respects `prefers-reduced-motion`.
- Links have clear affordance through position, label, cursor, or arrow.

Do not remove focus states entirely to make screenshots cleaner. Replace ugly focus with intentional focus.

## Performance

Performance is part of design quality.

Rules:

- Do not trade image quality for blur or bad compression.
- Do optimize image size, dimensions, and loading strategy.
- Lead image may be priority/eager.
- Below-fold images should lazy-load.
- Avoid unused client JavaScript.
- Avoid layout shift from images by keeping stable dimensions/aspect ratios.
- Keep server fallback logic separate from design components.

## Anti-Patterns

Do not introduce:

- Crypto-gradient hero sections.
- Decorative orbs, bokeh blobs, and generic Web3 glow.
- All-caps UI labels.
- Pill tags for content filters.
- Heavy card backgrounds.
- Borders around every section.
- Nested cards.
- Translucent or shrinking headers.
- Hover gray-outs over images.
- Duplicate Terms/Privacy links at the bottom.
- Random raw colors outside tokens.
- CMS copy hard-coded in page templates.

## Impeccable Workflow

Impeccable is installed as the repeatable design-review aid. It does not replace human browser QA.

Initial setup:

```bash
pnpm install
pnpm exec impeccable install
```

Focused audit:

```bash
pnpm exec impeccable detect design.md app/articles components/articles app/globals.css public/brand/subfrost
```

Site audit:

```bash
pnpm impeccable:site
```

For any material website/app visual update, also do the manual `/impeccable` pass:

- Desktop screenshot.
- Tablet screenshot.
- Mobile screenshot.
- Light mode.
- Dark mode.
- English.
- Chinese.
- Header scroll behavior.
- Search open/close behavior.
- Footer mobile layout.
- Console errors.
- Broken images.
- Text overflow.
- SEO metadata.
- Public preview link if the page is being shared with a client.

## CMS Admin Lists

Admin article rows should feel like the public editorial system translated into an operational view.

- The whole row opens the article editor.
- Use one visible straight right arrow at the far right, matching the public articles arrow direction.
- Do not place a second arrow beside the article title.
- Group `Language`, `Author`, and `Updated` in one compact metadata column.
- Use `Language`, not `Langs`.
- Give the metadata column balanced horizontal breathing room so it does not feel attached to either the title or the row arrow.

## Handoff Checklist

Before handoff or PR review:

```bash
pnpm exec tsc --noEmit
pnpm test -- tests/articles
pnpm build
pnpm exec impeccable detect design.md app/articles components/articles app/globals.css public/brand/subfrost
```

Then verify in browser:

- `/articles`
- `/articles?topic=research`
- `/articles?topic=protocol`
- `/articles?topic=docs`
- `/articles?lang=zh`
- one article reader
- `/privacy`
- `/terms`
- `/support`

If a design decision changed during the work, update this document before pushing.
