import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import rehypeHighlight from "rehype-highlight"
import { externalAnchorProps } from "@/lib/link-behavior"
import { SmartPicture } from "@/components/articles/SmartPicture"
import { isChartSvg } from "@/lib/cms/image-srcset"
import { InlineFigure } from "@/components/articles/InlineFigure"
import { ZoomableFigure } from "@/components/articles/ZoomableFigure"

// Server-side Markdown renderer. Sanitizes HTML and highlights fenced code.
// `variant` switches between the Medium-style reading prose and the compact
// admin editor preview.
export function Markdown({
  children,
  variant = "article",
  inlinedSvgs,
}: {
  children: string
  variant?: "article" | "compact"
  inlinedSvgs?: ReadonlyMap<string, string>
}) {
  const cls =
    variant === "article"
      ? "ed-article-prose max-w-none"
      : "prose prose-invert max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-zinc-800"
  return (
    <div className={cls}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, rehypeHighlight]}
        components={{
          a: ({ href, children, node: _node, ...props }) => {
            void _node
            return (
              <a href={href} {...props} {...externalAnchorProps(href)}>
                {children}
              </a>
            )
          },
          img: ({ src, alt }) => {
            const s = typeof src === "string" ? src : ""
            const a = typeof alt === "string" ? alt : ""
            const inlined = isChartSvg(s) ? inlinedSvgs?.get(s) : undefined
            const figure = inlined ? (
              <InlineFigure svg={inlined} alt={a} />
            ) : isChartSvg(s) ? (
              // chart svg with no pre-fetched entry (client preview / fetch miss) → plain image
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s} alt={a} loading="lazy" decoding="async" />
            ) : (
              <SmartPicture src={s} alt={a} />
            )
            // Reading view: click to enlarge in an overlay. The compact editor
            // preview keeps figures inline (no zoom while editing).
            return variant === "article" ? <ZoomableFigure alt={a}>{figure}</ZoomableFigure> : figure
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
