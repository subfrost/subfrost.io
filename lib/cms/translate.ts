import Anthropic from "@anthropic-ai/sdk"
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema"

export type Locale = "en" | "zh"
export interface TranslationContent { title: string; excerpt: string; body: string; sources: string }

export const TRANSLATE_MODEL = "claude-opus-4-8"
export const LOCALE_NAME: Record<Locale, string> = {
  en: "English",
  zh: "Simplified Chinese (中文)",
}

// Raw JSON schema (not Zod) — the SDK's zod helper targets zod v4 while this
// repo is on zod v3, so the json-schema helper is the version-proof path.
const TRANSLATION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    excerpt: { type: "string" },
    body: { type: "string" },
    sources: { type: "string" },
  },
  required: ["title", "excerpt", "body", "sources"],
  additionalProperties: false,
} as const

/** Pure: compose the translator system prompt + the source payload. No SDK/network. */
export function buildTranslationRequest(
  source: TranslationContent,
  from: Locale,
  to: Locale,
): { system: string; userText: string } {
  const system =
    `You are a professional translator for a Bitcoin/DeFi publication. ` +
    `Translate the article from ${LOCALE_NAME[from]} to ${LOCALE_NAME[to]}. ` +
    `The body and sources are Markdown — preserve their structure exactly: headings, lists, blockquotes, links, and fenced code blocks. ` +
    `Do not translate code, URLs, or proper nouns / ticker symbols (e.g. SUBFROST, frBTC, DIESEL, Bitcoin). ` +
    `Translate the sources line too (e.g. the word "Sources"), but keep citation names, URLs, and issue numbers intact. ` +
    `Keep the author's tone. Return only the translated title, excerpt, body, and sources.`
  const userText = `TITLE:\n${source.title}\n\nEXCERPT:\n${source.excerpt}\n\nBODY (Markdown):\n${source.body}\n\nSOURCES (Markdown):\n${source.sources}`
  return { system, userText }
}

/** True when the Claude service isn't configured (graceful no-op). */
export function translationUnavailable(): boolean {
  return !process.env.ANTHROPIC_API_KEY
}

/** Translate via Claude using structured outputs. Throws on parse/API failure. */
export async function translate(source: TranslationContent, from: Locale, to: Locale): Promise<TranslationContent> {
  const { system, userText } = buildTranslationRequest(source, from, to)
  const client = new Anthropic()
  const res = await client.messages.parse({
    model: TRANSLATE_MODEL,
    max_tokens: 16000,
    system,
    output_config: { format: jsonSchemaOutputFormat(TRANSLATION_SCHEMA) },
    messages: [{ role: "user", content: userText }],
  })
  if (!res.parsed_output) throw new Error("Translation returned no structured output")
  return res.parsed_output
}
