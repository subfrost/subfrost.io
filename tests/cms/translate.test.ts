import { describe, it, expect, afterEach } from "vitest"
import { buildTranslationRequest, translationUnavailable, LOCALE_NAME } from "@/lib/cms/translate"

describe("buildTranslationRequest", () => {
  const src = { title: "Hello", excerpt: "Intro", body: "# Heading\n\n- item\n\n`code`" }
  it("names both languages and asks to preserve Markdown", () => {
    const { system, userText } = buildTranslationRequest(src, "en", "zh")
    expect(system).toContain(LOCALE_NAME.en)
    expect(system).toContain(LOCALE_NAME.zh)
    expect(system.toLowerCase()).toContain("markdown")
    expect(userText).toContain("Hello")
    expect(userText).toContain("# Heading")
  })
})

describe("translationUnavailable", () => {
  const prev = process.env.ANTHROPIC_API_KEY
  afterEach(() => {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prev
  })
  it("is true without a key, false with one", () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(translationUnavailable()).toBe(true)
    process.env.ANTHROPIC_API_KEY = "sk-test"
    expect(translationUnavailable()).toBe(false)
  })
})
