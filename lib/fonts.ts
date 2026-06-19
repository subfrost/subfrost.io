// "Frost Editorial" typography. Fraunces is the high-contrast display serif used
// for headlines and section titles; Newsreader is the optical-size body serif
// used for long-form reading. They are loaded via a Google Fonts stylesheet
// (scoped to the editorial shell) — matching how the rest of the app loads its
// Satoshi UI face from a CDN, and avoiding a build-time font fetch. The family
// names are referenced from globals.css (`.font-display` / `.font-reading`).
export const EDITORIAL_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap"
