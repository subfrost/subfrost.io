import type { Metadata } from "next"
import { ArrowDownToLine, ArrowUpRight } from "lucide-react"
import { EditorialShell } from "@/components/articles/EditorialShell"

type Locale = "en" | "zh"

const brandAssetRoot = "/brand/subfrost"
const guidelinePdf = `${brandAssetRoot}/SUBFROST-brand-guidelines.pdf`

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { lang } = await searchParams
  const locale: Locale = lang === "zh" ? "zh" : "en"
  const title = locale === "zh" ? "subfrost 品牌资源" : "subfrost brand kit"
  const description =
    locale === "zh"
      ? "subfrost 的品牌指南、标志、色彩、字体与视觉素材。"
      : "subfrost brand guidelines, logos, color, typography, and visual asset rules."
  const url = locale === "zh" ? "https://subfrost.io/brand?lang=zh" : "https://subfrost.io/brand"

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: "https://subfrost.io/brand",
        zh: "https://subfrost.io/brand?lang=zh",
        "x-default": "https://subfrost.io/brand",
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: "subfrost",
      images: [
        {
          url: "/Logo.png",
          width: 1200,
          height: 630,
          alt: "subfrost",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/Logo.png"],
    },
  }
}

const copy = {
  en: {
    title: "Brand guidelines",
    intro:
      "subfrost is a Bitcoin-native product company. The brand should feel cold, precise, liquid, and trustworthy - never loud, speculative, or generic crypto.",
    download: "Download guidelines",
    contact: "Contact support",
    overview: "Overview",
    overviewBody:
      "Use the approved lowercase logotype and mark, Geist typography, and the subfrost color system. Keep layouts quiet, image-led, and precise. White space is part of the identity.",
    logoTitle: "Logo",
    logoBody:
      "The lowercase subfrost logotype is the primary brand asset. Use it in black on white surfaces and the light wordmark on black or dark surfaces. Keep the snowflake Glacial blue across themes. Do not stretch, outline, recolor, title-case, or add effects.",
    markTitle: "Logomark",
    markBody:
      "The snowflake mark is reserved for compact spaces: favicon, avatar, social, and small navigation. When it appears in color, use Glacial.",
    colorTitle: "Color",
    colorBody:
      "The palette is built from four base colors. Build shade ramps by moving lightness in disciplined steps, not by inventing new hues.",
    typeTitle: "Typography",
    typeBody:
      "Geist is the primary interface and editorial typeface. Geist Mono is reserved for code, addresses, metrics, and technical data.",
    imageTitle: "Imagery",
    imageBody:
      "Visual assets should feel frozen, clear, fluid, and dimensional. Use real texture and restraint. Avoid crypto neon, blobs, bokeh, and decorative gradients.",
    rulesTitle: "Usage rules",
    downloadsTitle: "Downloads",
    downloadsBody: "Use these assets when building pages, decks, previews, or product surfaces.",
    sections: {
      logo: "Logotype",
      mark: "Symbol",
      color: "Color system",
      type: "Typography",
      imagery: "Imagery",
    },
  },
  zh: {
    title: "品牌指南",
    intro:
      "subfrost 是比特币原生产品公司。品牌气质应当冷静、精确、流动、可信，不应喧闹、投机或像通用加密项目。",
    download: "下载指南",
    contact: "联系支持",
    overview: "概览",
    overviewBody:
      "使用批准的小写字标与图标、Geist 字体和 subfrost 色彩系统。版式保持安静、以图像为核心、足够精确。留白也是品牌的一部分。",
    logoTitle: "标志",
    logoBody:
      "小写 subfrost 字标是主要品牌资产。白色界面使用黑色版本，黑色或深色界面使用浅色字标。雪花在不同主题中都保持 Glacial 蓝。不要拉伸、描边、重新上色、改成标题大小写或添加特效。",
    markTitle: "图标",
    markBody:
      "雪花图标用于紧凑场景：favicon、头像、社交图标与小型导航。彩色版本应使用 Glacial。",
    colorTitle: "色彩",
    colorBody:
      "品牌色板由四个基础色组成。色阶应通过有纪律的明度步进生成，而不是发明新的色相。",
    typeTitle: "字体",
    typeBody:
      "Geist 是主要界面与编辑字体。Geist Mono 只用于代码、地址、指标与技术数据。",
    imageTitle: "图像",
    imageBody:
      "视觉素材应体现冰冻、清晰、流动和空间感。使用真实质感与克制表达。避免加密霓虹、光球、散景和装饰性渐变。",
    rulesTitle: "使用规则",
    downloadsTitle: "下载",
    downloadsBody: "构建页面、演示文稿、预览图或产品界面时，请使用这些资产。",
    sections: {
      logo: "字标",
      mark: "符号",
      color: "色彩系统",
      type: "字体",
      imagery: "图像",
    },
  },
} satisfies Record<Locale, Record<string, unknown>>

const palette = [
  { name: "Carbon", value: "#212121", usage: "Text, dark surfaces, high-contrast UI" },
  { name: "Frost", value: "#E9F0F7", usage: "Soft surface, light background, quiet panels" },
  { name: "Glacial", value: "#A7C6DC", usage: "Snowflake mark, cooling accents, image tint" },
  { name: "Flare", value: "#EC4521", usage: "Rare alert or emphasis only" },
]

const rules = [
  { label: "Use approved SVG assets", detail: "Keep logotype proportions unchanged." },
  { label: "Respect clear space", detail: "Do not crowd the snowflake or wordmark." },
  { label: "Keep corners small", detail: "Use 6px media radii, never bubbly cards." },
  { label: "Use real frost texture", detail: "Prefer product-like ice imagery over generic graphics." },
  { label: "Avoid new hues", detail: "Extend the palette through lightness steps only." },
  { label: "Avoid effects", detail: "No glow, shadow logos, outlines, or decorative gradients." },
]

const downloads = [
  {
    title: "Brand guidelines",
    description: "Full PDF with logo, color, typography, and usage notes.",
    href: guidelinePdf,
  },
  {
    title: "Logotype SVG",
    description: "Primary black logotype for light surfaces.",
    href: `${brandAssetRoot}/Logos/svg/logotype/logotype_black.svg`,
  },
  {
    title: "Logomark SVG",
    description: "Standalone snowflake symbol for compact placements.",
    href: `${brandAssetRoot}/Logos/svg/logomark/logomark.svg`,
  },
]

function getLocale(lang?: string): Locale {
  return lang === "zh" ? "zh" : "en"
}

function SectionIntro({
  label,
  title,
  body,
}: {
  label: string
  title: string
  body: string
}) {
  return (
    <div className="mx-auto max-w-[720px] text-center">
      <p className="font-display text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
        {label}
      </p>
      <h2 className="font-display mt-4 text-balance text-[38px] font-normal leading-[1.02] sm:text-[54px]" style={{ color: "var(--ed-ink)" }}>
        {title}
      </h2>
      <p className="font-display mx-auto mt-5 max-w-[620px] text-[17px] leading-[1.55] sm:text-[19px]" style={{ color: "var(--ed-body)" }}>
        {body}
      </p>
    </div>
  )
}

function BrandImage({
  src,
  alt,
  className = "",
}: {
  src: string
  alt: string
  className?: string
}) {
  return (
    <div className={`overflow-hidden rounded-[6px] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="block h-full w-full object-cover object-left"
      />
    </div>
  )
}

export default async function BrandPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const { lang } = await searchParams
  const locale = getLocale(lang)
  const t = copy[locale]
  const languageSuffix = locale === "zh" ? "?lang=zh" : ""

  return (
    <EditorialShell>
      <main className="overflow-hidden">
        <section>
          <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-14 sm:px-8 sm:pb-20 sm:pt-[92px]">
            <div className="mx-auto max-w-[900px] text-center">
              <h1 className="font-display text-balance text-[52px] font-normal leading-none sm:text-[82px]" style={{ color: "var(--ed-ink)" }}>
                {String(t.title)}
              </h1>
              <p className="font-display mx-auto mt-7 max-w-[760px] text-[18px] leading-[1.55] sm:text-[22px]" style={{ color: "var(--ed-body)" }}>
                {String(t.intro)}
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-5">
                <a
                  href={guidelinePdf}
                  className="font-display inline-flex items-center gap-2 text-[15px] font-medium"
                  style={{ color: "var(--ed-ink)" }}
                >
                  {String(t.download)}
                  <ArrowDownToLine className="h-4 w-4" strokeWidth={1.9} />
                </a>
                <a
                  href={`/support${languageSuffix}`}
                  className="font-display inline-flex items-center gap-1.5 text-[15px] font-medium"
                  style={{ color: "var(--ed-ink)" }}
                >
                  {String(t.contact)}
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.9} />
                </a>
              </div>
            </div>

            <div className="mt-14 overflow-hidden rounded-[6px]" style={{ background: "var(--ed-surface)" }}>
              <BrandImage
                src={`${brandAssetRoot}/Graphics/jpeg/banner_light.jpg`}
                alt="subfrost light brand banner"
                className="aspect-[1794/598]"
              />
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <SectionIntro
            label={String(t.overview)}
            title={String(t.sections.logo)}
            body={String(t.logoBody)}
          />
          <div className="mx-auto mt-14 grid max-w-[1180px] gap-5 px-5 sm:px-8 md:grid-cols-2">
            <div className="flex min-h-[280px] items-center justify-center rounded-[6px] p-10" style={{ background: "#ffffff" }}>
              <img
                src={`${brandAssetRoot}/Logos/svg/logotype/logotype_black.svg`}
                alt="subfrost black logotype"
                className="h-auto w-full max-w-[420px]"
              />
            </div>
            <div className="flex min-h-[280px] items-center justify-center rounded-[6px] p-10" style={{ background: "#000000" }}>
              <img
                src={`${brandAssetRoot}/Logos/svg/logotype/logotype_light.svg`}
                alt="subfrost light logotype"
                className="h-auto w-full max-w-[420px]"
              />
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <SectionIntro
            label={String(t.logoTitle)}
            title={String(t.sections.mark)}
            body={String(t.markBody)}
          />
          <div className="mx-auto mt-14 grid max-w-[1180px] gap-5 px-5 sm:px-8 lg:grid-cols-[1fr_1.15fr]">
            <div className="flex min-h-[340px] items-center justify-center rounded-[6px]" style={{ background: "var(--ed-surface)" }}>
              <img
                src={`${brandAssetRoot}/Logos/svg/logomark/logomark.svg`}
                alt="subfrost snowflake symbol"
                className="h-auto w-28 sm:w-36"
              />
            </div>
            <div className="rounded-[6px]">
              <BrandImage src={`${brandAssetRoot}/Graphics/jpeg/graphic_light.jpg`} alt="subfrost frost visual system" className="aspect-[1920/599]" />
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <SectionIntro
            label={String(t.markTitle)}
            title={String(t.sections.color)}
            body={String(t.colorBody)}
          />
          <div className="mx-auto mt-14 grid max-w-[1180px] gap-5 px-5 sm:px-8 md:grid-cols-2 lg:grid-cols-4">
            {palette.map((color) => (
              <div key={color.name} className="font-display">
                <div className="aspect-[4/3] rounded-[6px]" style={{ background: color.value }} />
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[19px] font-medium" style={{ color: "var(--ed-ink)" }}>
                      {color.name}
                    </h3>
                    <p className="mt-2 text-[14px] leading-[1.45]" style={{ color: "var(--ed-muted)" }}>
                      {color.usage}
                    </p>
                  </div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--ed-muted)" }}>
                    {color.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <SectionIntro
            label={String(t.colorTitle)}
            title={String(t.sections.type)}
            body={String(t.typeBody)}
          />
          <div className="mx-auto mt-14 grid max-w-[1180px] gap-5 px-5 sm:px-8 md:grid-cols-2">
            <div className="rounded-[6px] p-8 sm:p-10" style={{ background: "var(--ed-surface)" }}>
              <p className="font-display text-[16px] font-medium" style={{ color: "var(--ed-muted)" }}>
                Geist
              </p>
              <p className="font-display mt-8 text-[64px] font-normal leading-none sm:text-[104px]" style={{ color: "var(--ed-ink)" }}>
                Aa
              </p>
              <p className="font-display mt-7 max-w-[420px] text-[18px] leading-[1.45]" style={{ color: "var(--ed-body)" }}>
                Quiet, neutral, legible interface typography for editorial pages and product surfaces.
              </p>
            </div>
            <div className="rounded-[6px] p-8 sm:p-10" style={{ background: "var(--ed-surface)" }}>
              <p className="font-display text-[16px] font-medium" style={{ color: "var(--ed-muted)" }}>
                Geist Mono
              </p>
              <p className="mt-8 font-mono text-[50px] font-normal leading-none sm:text-[78px]" style={{ color: "var(--ed-ink)" }}>
                0123
              </p>
              <p className="font-display mt-7 max-w-[420px] text-[18px] leading-[1.45]" style={{ color: "var(--ed-body)" }}>
                Reserved for code, balances, technical identifiers, addresses, and protocol data.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <SectionIntro
            label={String(t.typeTitle)}
            title={String(t.sections.imagery)}
            body={String(t.imageBody)}
          />
          <div className="mx-auto mt-14 grid max-w-[1180px] gap-5 px-5 sm:px-8 md:grid-cols-2">
            <BrandImage src={`${brandAssetRoot}/Graphics/jpeg/banner_light.jpg`} alt="subfrost branded frost banner" className="aspect-[1794/598]" />
            <BrandImage src={`${brandAssetRoot}/Graphics/jpeg/ice_bg.jpg`} alt="subfrost abstract frost texture" className="aspect-[1794/598]" />
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <SectionIntro
            label={String(t.imageTitle)}
            title={String(t.rulesTitle)}
            body={String(t.overviewBody)}
          />
          <div className="mx-auto mt-14 grid max-w-[1180px] gap-x-5 gap-y-10 px-5 sm:px-8 md:grid-cols-2 lg:grid-cols-3">
            {rules.map((rule) => (
              <div key={rule.label} className="font-display">
                <h3 className="text-[22px] font-normal leading-[1.25]" style={{ color: "var(--ed-ink)" }}>
                  {rule.label}
                </h3>
                <p className="mt-3 text-[16px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                  {rule.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 sm:px-8 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div>
              <h2 className="font-display text-[34px] font-normal leading-[1.05] sm:text-[46px]" style={{ color: "var(--ed-ink)" }}>
                {String(t.downloadsTitle)}
              </h2>
              <p className="font-display mt-5 text-[17px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                {String(t.downloadsBody)}
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {downloads.map((item) => (
                <a key={item.href} href={item.href} className="font-display block">
                  <h3 className="text-[21px] font-normal leading-[1.25]" style={{ color: "var(--ed-ink)" }}>
                    {item.title}
                    <ArrowUpRight className="ml-1 inline-block h-3.5 w-3.5 align-baseline" strokeWidth={2} aria-hidden="true" />
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                    {item.description}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
    </EditorialShell>
  )
}
