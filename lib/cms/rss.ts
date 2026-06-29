export interface RssChannel {
  title: string
  link: string
  description: string
  selfUrl: string
}

export interface RssItem {
  title: string
  link: string
  guid: string
  pubDate: Date
  description: string
  contentHtml?: string | null
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function itemXml(it: RssItem): string {
  const parts = [
    "    <item>",
    `      <title>${esc(it.title)}</title>`,
    `      <link>${esc(it.link)}</link>`,
    `      <guid isPermaLink="false">${esc(it.guid)}</guid>`,
    `      <pubDate>${it.pubDate.toUTCString()}</pubDate>`,
    `      <description>${esc(it.description)}</description>`,
  ]
  if (it.contentHtml) parts.push(`      <content:encoded><![CDATA[${it.contentHtml}]]></content:encoded>`)
  parts.push("    </item>")
  return parts.join("\n")
}

export function buildRssXml(channel: RssChannel, items: RssItem[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${esc(channel.title)}</title>`,
    `    <link>${esc(channel.link)}</link>`,
    `    <description>${esc(channel.description)}</description>`,
    `    <atom:link href="${esc(channel.selfUrl)}" rel="self" type="application/rss+xml" />`,
    ...items.map(itemXml),
    "  </channel>",
    "</rss>",
  ].join("\n")
}
