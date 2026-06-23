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

Key implementation files:

- Article index: `app/articles/page.tsx`
- Article reader: `app/articles/[slug]/page.tsx`
- Brand kit page: `app/brand/page.tsx`
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

- White background.
- Official logomark plus lowercase `subfrost`.
- Use the same Geist/OpenAI-style typography used on the blog page.
- Add the tagline below the logo lockup: `Bitcoin's next-gen defi experience`.
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

- Desktop nav items: Markets, Swap, Vaults, Blog.
- Chinese mode localizes menu items.
- Active item uses `--ed-ink`.
- Inactive items use `--ed-muted`.
- Hover states should match OpenAI: no pills, no background, no animation; use pointer cursor and steady text color behavior.
- Focus states must be accessible but should not show browser-orange default outlines.

Mobile menu:

- Match OpenAI mobile menu structure.
- Full-screen menu.
- Large stacked nav links.
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
- Remove standalone `Posts By Topic` label.

Load more:

- Only show when there are actually more posts to load.
- It belongs under the relevant post grid, not as a floating page artifact.

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

Search should feel like a high-end modal page, not a hash jump.

Behavior:

- Click search icon.
- Header icon becomes close/X.
- Full viewport search layer opens under the header.
- Input animates in smoothly.
- Closing reverses smoothly.
- Escape and X should close without layout flash when supported.

Visual:

- White or black canvas matching theme.
- Centered/narrow input row.
- Large quiet placeholder.
- One subtle underline or border is acceptable if needed.
- Submit button is muted until text is entered, then `--ed-action-bg`.

Copy:

- English: `Search articles`
- Chinese: `搜索文章`

## Internationalization

Language state uses `?lang=zh`.

Requirements:

- Nav items translate.
- Topic filters translate.
- Footer columns translate.
- Subscribe copy translates.
- Search copy translates.
- Article links preserve language when moving from index to reader.
- Toggling language must not scroll the user to the top.
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
