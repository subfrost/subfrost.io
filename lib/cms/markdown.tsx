import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import rehypeHighlight from "rehype-highlight"
import { externalAnchorProps } from "@/lib/link-behavior"
import { SmartPicture } from "@/components/articles/SmartPicture"

// Server-side Markdown renderer. Sanitizes HTML and highlights fenced code.
// `variant` switches between the Medium-style reading prose and the compact
// admin editor preview.
export function Markdown({
  children,
  variant = "article",
}: {
  children: string
  variant?: "article" | "compact"
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
          img: ({ src, alt }) => (
            <SmartPicture src={typeof src === "string" ? src : ""} alt={typeof alt === "string" ? alt : ""} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
