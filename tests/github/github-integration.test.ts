import { describe, it, expect, beforeEach, afterEach } from "vitest"
import crypto from "crypto"
import { isAllowedRepo, repoLabel, GITHUB_REPOS, githubSyncEnabled } from "@/lib/github/config"
import { verifyWebhookSignature } from "@/lib/github/client"

describe("github repo allow-list", () => {
  it("accepts exactly the three configured repos", () => {
    expect([...GITHUB_REPOS]).toEqual(["subfrost/subfrost-app", "subfrost/subfrost", "subfrost/subfrost.io"])
    expect(isAllowedRepo("subfrost/subfrost-app")).toBe(true)
    expect(isAllowedRepo("subfrost/subfrost.io")).toBe(true)
  })
  it("rejects unknown or empty repos", () => {
    expect(isAllowedRepo("subfrost/evil")).toBe(false)
    expect(isAllowedRepo("attacker/subfrost.io")).toBe(false)
    expect(isAllowedRepo(undefined)).toBe(false)
    expect(isAllowedRepo(null)).toBe(false)
  })
  it("derives a short repo label", () => {
    expect(repoLabel("subfrost/subfrost-app")).toBe("subfrost-app")
    expect(repoLabel("noslash")).toBe("noslash")
  })
})

describe("webhook signature verification (X-Hub-Signature-256)", () => {
  const SECRET = "test-webhook-secret"
  const sign = (body: string, secret = SECRET) =>
    "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")

  beforeEach(() => { process.env.GITHUB_WEBHOOK_SECRET = SECRET })
  afterEach(() => { delete process.env.GITHUB_WEBHOOK_SECRET; delete process.env.GITHUB_PAT })

  it("accepts a correctly-signed body", () => {
    const body = JSON.stringify({ action: "opened", number: 7 })
    expect(verifyWebhookSignature(body, sign(body))).toBe(true)
  })
  it("rejects a tampered body", () => {
    const body = JSON.stringify({ action: "opened", number: 7 })
    const sig = sign(body)
    expect(verifyWebhookSignature(body + " ", sig)).toBe(false)
  })
  it("rejects a signature made with the wrong secret", () => {
    const body = "{}"
    expect(verifyWebhookSignature(body, sign(body, "wrong-secret"))).toBe(false)
  })
  it("rejects a missing signature or unconfigured secret", () => {
    expect(verifyWebhookSignature("{}", null)).toBe(false)
    delete process.env.GITHUB_WEBHOOK_SECRET
    expect(verifyWebhookSignature("{}", sign("{}"))).toBe(false)
  })
})

describe("github sync gating", () => {
  afterEach(() => { delete process.env.GITHUB_PAT })
  it("is disabled without a PAT and enabled with one", () => {
    delete process.env.GITHUB_PAT
    expect(githubSyncEnabled()).toBe(false)
    process.env.GITHUB_PAT = "ghp_xxx"
    expect(githubSyncEnabled()).toBe(true)
  })
})
