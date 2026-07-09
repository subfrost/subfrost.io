import { METRIC_LABELS, WINDOW_DAYS, type MetricKey, type WindowKey } from "./opreturn-types"

// Shared shapes + validation for the PUBLIC OP_RETURN stat card
// (app/metrics/card/opreturn) and the share buttons that link to it.

export type CardTemplate = "hero" | "compare"
export type CardTheme = "dark" | "light"

export interface CardParams {
  metric: MetricKey
  window: WindowKey
  template: CardTemplate
  theme: CardTheme
}

export const CARD_DEFAULTS: CardParams = {
  metric: "alkanesOfOpReturnShare",
  window: "avg7",
  template: "hero",
  theme: "dark",
}

/** Validate the public card query params against the fixed enums: missing → default,
 *  present-but-unknown → null (the route replies 400). Keeping the URL space finite
 *  makes it fully CDN-cacheable and blocks free-text abuse of the branded renderer —
 *  no custom labels ever reach the public image. */
export function parseCardParams(sp: URLSearchParams): CardParams | null {
  const metric = sp.get("metric") ?? CARD_DEFAULTS.metric
  const window = sp.get("window") ?? CARD_DEFAULTS.window
  const template = sp.get("template") ?? CARD_DEFAULTS.template
  const theme = sp.get("theme") ?? CARD_DEFAULTS.theme
  if (!Object.prototype.hasOwnProperty.call(METRIC_LABELS, metric)) return null
  if (!Object.prototype.hasOwnProperty.call(WINDOW_DAYS, window)) return null
  if (template !== "hero" && template !== "compare") return null
  if (theme !== "dark" && theme !== "light") return null
  return { metric: metric as MetricKey, window: window as WindowKey, template, theme }
}

/** Build a public OP_RETURN card URL for a share button. `compare` cards ignore
 *  `metric` (they render the bytes composition), so it's omitted there. */
export function opReturnCardUrl(cfg: {
  metric?: MetricKey
  template?: CardTemplate
  window?: WindowKey
  theme?: CardTheme
}): string {
  const p = new URLSearchParams()
  const template = cfg.template ?? "hero"
  p.set("template", template)
  if (template !== "compare" && cfg.metric) p.set("metric", cfg.metric)
  p.set("window", cfg.window ?? "avg7")
  p.set("theme", cfg.theme ?? "dark")
  return `https://subfrost.io/metrics/card/opreturn?${p.toString()}`
}
