// "Frost Editorial" body type. Geist (display/UI) + Geist Mono (data) are loaded
// via the self-hosted `geist` next/font package on the editorial shell; Newsreader
// remains the optical-size serif used for long-form reading and is loaded via a
// scoped Google Fonts stylesheet (matching how the rest of the app loads its
// Satoshi UI face from a CDN, and avoiding a build-time font fetch). The family
// names are referenced from globals.css (`.font-display` / `.font-reading`).
export const EDITORIAL_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap"
