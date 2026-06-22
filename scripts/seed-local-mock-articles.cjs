#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const { PrismaClient } = require("@prisma/client")

function loadEnvFromFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key || process.env[key] != null) continue
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function assertSafeLocalTarget() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed mock articles when NODE_ENV=production")
  }

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error("DATABASE_URL is required. Add it to .env or export it before running this script.")
  }

  let host = ""
  try {
    host = new URL(dbUrl).hostname
  } catch {
    throw new Error("DATABASE_URL is not a valid URL")
  }

  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres", "subfrost-postgres"])
  if (!allowedHosts.has(host)) {
    throw new Error(
      `Refusing to seed mock articles against non-local host \"${host}\". Allowed: ${Array.from(allowedHosts).join(", ")}`,
    )
  }

  if (process.env.VERCEL || process.env.GCP_PROJECT || process.env.K_SERVICE) {
    throw new Error("Refusing to seed mock articles in a cloud runtime environment")
  }
}

const SAMPLE_ARTICLES = [
  {
    slug: "bitcoin-liquidity-weekly-01",
    title: "Bitcoin Liquidity Weekly: Week 01",
    excerpt: "A field briefing on liquidity shifts across wraps, unwraps, and routing demand.",
    body: "# Bitcoin Liquidity Weekly: Week 01\n\nThis is local mock content for development only.\n\n## Highlights\n- Wrap activity accelerated over the last 7 days.\n- Unwrap latency remained within expected ranges.\n- Liquidity concentration rotated toward core pools.",
  },
  {
    slug: "frostwire-product-briefing",
    title: "Frostwire Product Briefing",
    excerpt: "What shipped this cycle, what changed operationally, and what to monitor next.",
    body: "# Frostwire Product Briefing\n\nThis is local mock content for development only.\n\n## What shipped\n- Updated settlement telemetry.\n- Better route failover handling.\n- Additional monitoring hooks.",
  },
  {
    slug: "bitcoin-risk-notes-custody-surfaces",
    title: "Bitcoin Risk Notes: Custody Surfaces",
    excerpt: "A practical view of custody and operational surfaces that matter most this quarter.",
    body: "# Bitcoin Risk Notes: Custody Surfaces\n\nThis is local mock content for development only.\n\n## Focus areas\n1. Key-management boundaries.\n2. Incident escalation speed.\n3. Policy observability and audit depth.",
  },
  {
    slug: "state-of-wrapped-btc-q2",
    title: "State Of Wrapped BTC: Q2 Snapshot",
    excerpt: "Benchmarking flow quality and net issuance posture across major wrapping venues.",
    body: "# State Of Wrapped BTC: Q2 Snapshot\n\nThis is local mock content for development only.\n\n## Snapshot\n- Net issuance expanded.\n- Redemption pressure stayed moderate.\n- Venue dispersion narrowed.",
  },
  {
    slug: "research-desk-alkanes-vs-brc20",
    title: "Research Desk: Alkanes vs BRC20",
    excerpt: "Comparative throughput, reliability, and user-path outcomes from live traffic observations.",
    body: "# Research Desk: Alkanes vs BRC20\n\nThis is local mock content for development only.\n\n## Comparison\n- Throughput profiles differ by market regime.\n- Retry patterns impact user-perceived latency.\n- Instrumentation quality drives decision speed.",
  },
  {
    slug: "operator-playbook-latency-incidents",
    title: "Operator Playbook: Latency Incidents",
    excerpt: "A repeatable response model for diagnosing and resolving latency spikes in production paths.",
    body: "# Operator Playbook: Latency Incidents\n\nThis is local mock content for development only.\n\n## Playbook\n1. Detect and scope blast radius.\n2. Isolate dependency bottlenecks.\n3. Apply rollback or rate controls.\n4. Publish post-incident notes.",
  },
]

const TAGS = [
  { slug: "research", name: "Research" },
  { slug: "product", name: "Product" },
  { slug: "operations", name: "Operations" },
  { slug: "local-mock", name: "Local Mock" },
]

async function main() {
  loadEnvFromFileIfPresent(path.resolve(process.cwd(), ".env"))
  assertSafeLocalTarget()

  const prisma = new PrismaClient()
  try {
    const author = await prisma.user.upsert({
      where: { email: "local.editor@subfrost.io" },
      update: { active: true, role: "EDITOR", name: "Local Editor" },
      create: {
        email: "local.editor@subfrost.io",
        passwordHash: "local-dev-only",
        role: "EDITOR",
        active: true,
        name: "Local Editor",
      },
    })

    for (const tag of TAGS) {
      await prisma.tag.upsert({
        where: { slug: tag.slug },
        update: { name: tag.name },
        create: tag,
      })
    }

    for (let i = 0; i < SAMPLE_ARTICLES.length; i++) {
      const a = SAMPLE_ARTICLES[i]
      const publishedAt = new Date(Date.now() - i * 24 * 60 * 60 * 1000)

      const article = await prisma.article.upsert({
        where: { slug: a.slug },
        update: {
          status: "PUBLISHED",
          primaryLocale: "en",
          featured: i === 0,
          publishedAt,
          authorId: author.id,
          coverImage: null,
          tags: {
            set: [],
            connect: [
              { slug: "research" },
              { slug: i % 2 === 0 ? "product" : "operations" },
              { slug: "local-mock" },
            ],
          },
        },
        create: {
          slug: a.slug,
          status: "PUBLISHED",
          primaryLocale: "en",
          featured: i === 0,
          publishedAt,
          authorId: author.id,
          coverImage: null,
          tags: {
            connect: [
              { slug: "research" },
              { slug: i % 2 === 0 ? "product" : "operations" },
              { slug: "local-mock" },
            ],
          },
        },
      })

      await prisma.articleTranslation.upsert({
        where: { articleId_locale: { articleId: article.id, locale: "en" } },
        update: {
          title: a.title,
          excerpt: a.excerpt,
          body: a.body,
        },
        create: {
          articleId: article.id,
          locale: "en",
          title: a.title,
          excerpt: a.excerpt,
          body: a.body,
        },
      })
    }

    const count = await prisma.article.count({ where: { status: "PUBLISHED" } })
    console.log(`[seed-local-mock-articles] Done. Published articles in DB: ${count}`)
    console.log("[seed-local-mock-articles] Safe target confirmed (local DB host only).")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error("[seed-local-mock-articles] Failed:", err.message)
  process.exit(1)
})
