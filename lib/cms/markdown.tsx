import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import rehypeHighlight from "rehype-highlight"

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
      ? "prose prose-lg prose-zinc max-w-none prose-headings:font-bold prose-a:text-[#1a4d8f] prose-img:rounded-lg prose-pre:bg-zinc-900 prose-pre:text-zinc-100"
      : "prose prose-invert max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-zinc-800"
  return (
    <div className={cls}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, rehypeHighlight]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
