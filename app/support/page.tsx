import type { Metadata } from "next"
import { StaticPage } from "@/components/articles/StaticPage"

export const metadata: Metadata = {
  title: "Support | SUBFROST",
  description: "Get help with SUBFROST. Contact our support team at support@subfrost.io.",
  alternates: {
    canonical: "https://subfrost.io/support",
  },
  openGraph: {
    title: "Support | SUBFROST",
    description: "Get help with SUBFROST. Contact our support team at support@subfrost.io.",
    type: "website",
    url: "https://subfrost.io/support",
    siteName: "SUBFROST",
  },
}

export default function SupportPage() {
  return (
    <StaticPage
      title="Support"
      description="Get help with wallet access, product questions, payments, and developer resources."
    >
      <section>
        <h2>Contact</h2>
        <p>
          Need help with SUBFROST? Reach out to our team and we&apos;ll get back to you.
        </p>
        <p>
          <a href="mailto:support@subfrost.io">support@subfrost.io</a>
        </p>
      </section>

      <section>
        <h2>Helpful links</h2>
        <ul>
          <li>
            <a href="https://docs.subfrost.io/">Docs</a>
          </li>
          <li>
            <a href="https://docs.subfrost.io/introduction/technical-overview">Technical overview</a>
          </li>
          <li>
            <a href="https://app.subfrost.io/">Launch App</a>
          </li>
        </ul>
      </section>
    </StaticPage>
  )
}
