import createDOMPurify from "dompurify"
import { JSDOM } from "jsdom"

// SVG can carry script/handlers — sanitize before we host it on our bucket.
// We serve SVG via <img> (no script execution), but sanitizing protects
// download/reuse and defense-in-depth.
const { window } = new JSDOM("")
const DOMPurify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0])

export function sanitizeSvg(input: Buffer | string): string {
  const raw = typeof input === "string" ? input : input.toString("utf8")
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject"],
    FORBID_ATTR: ["onload", "onclick", "onmouseover"],
  })
}
