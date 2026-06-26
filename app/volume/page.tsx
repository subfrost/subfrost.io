import type { Metadata } from "next"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { absoluteUrl, sharedUnfurlImageHeight, sharedUnfurlImageUrl, sharedUnfurlImageWidth } from "@/lib/seo"
import { VolumeChartRoute } from "./VolumeChartRoute"

export const metadata: Metadata = {
  title: "Volume charts | subfrost",
  description: "subfrost protocol volume charts for wrap and unwrap activity across Both, Alkanes, and BRC2.0 sources.",
  alternates: {
    canonical: absoluteUrl("/volume"),
    languages: {
      en: absoluteUrl("/volume"),
      zh: absoluteUrl("/volume?lang=zh"),
      "x-default": absoluteUrl("/volume"),
    },
  },
  openGraph: {
    title: "Volume charts | subfrost",
    description: "subfrost protocol volume charts for wrap and unwrap activity across Both, Alkanes, and BRC2.0 sources.",
    type: "website",
    url: absoluteUrl("/volume"),
    siteName: "subfrost",
    images: [{ url: sharedUnfurlImageUrl, width: sharedUnfurlImageWidth, height: sharedUnfurlImageHeight, alt: "subfrost" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Volume charts | subfrost",
    description: "subfrost protocol volume charts for wrap and unwrap activity across Both, Alkanes, and BRC2.0 sources.",
    images: [{ url: sharedUnfurlImageUrl, alt: "subfrost" }],
  },
}

export default async function VolumePage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>
}) {
  const params = searchParams ? await searchParams : {}
  const closeHref = params.lang === "zh" ? "/?lang=zh" : "/"
  const volumeJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "subfrost volume charts",
    description: metadata.description,
    url: absoluteUrl("/volume"),
    isPartOf: {
      "@type": "WebSite",
      name: "SUBFROST",
      url: absoluteUrl("/"),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(volumeJsonLd) }}
      />
      <EditorialShell>
        <main className="min-h-[calc(100vh-4rem)]" style={{ background: "var(--ed-canvas)" }}>
          <VolumeChartRoute closeHref={closeHref} />
        </main>
      </EditorialShell>
    </>
  )
}
