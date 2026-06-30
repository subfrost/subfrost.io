# subfrost Brand Kit

This folder preserves the client-provided subfrost brand package for git-managed site design work.

Source: `subfrost branding`

Included:

- Brand guidelines PDF
- Logotype and logomark SVG/JPEG exports
- Social/profile marks
- Brand graphics in PNG/JPEG
- Geist and Geist Mono font files with licenses

Runtime note:

- The full package lives here to keep the repo complete.
- Only the small set of assets actually served by the website should be copied into `public/brand/subfrost`.

Implementation notes from the guidelines:

- Preferred public wordmark casing is lowercase `subfrost`.
- Use `SUBFROST` only for existing all-caps assets, legacy product/legal copy, or constrained system contexts.
- Do not use title-case `Subfrost` as a visual brand lockup.
- Use Geist as the primary typeface and Geist Mono only for technical/data UI.
- Use the logotype as the primary brand mark. Minimum recommended logotype height is 32px.
- Use the standalone logomark for icons, favicons, social avatars, and compact placements.
- When the snowflake mark appears in color, use Glacial `#A7C6DC`.
- Core palette: Carbon `#212121`, Frost `#E9F0F7`, Glacial `#A7C6DC`, Flare `#EC4521`.
- Preserve clear space around the logo and do not recolor or distort the marks.

Usage note:

- For the articles header, use `logotype_black.svg` on light backgrounds and `logotype_white.svg` on black/dark backgrounds. Do not filter, recolor, or distort the SVGs in CSS.
- The `logotype_light.svg` export uses white type and is only appropriate on colored or dark surfaces. It should not be used on the white editorial header.
