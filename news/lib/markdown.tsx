import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import rehypeHighlight from "rehype-highlight"

// Server-side Markdown renderer. Sanitizes HTML (no raw HTML injection) and
// syntax-highlights fenced code blocks. Wrap output in a `prose` container.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-invert max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-zinc-800 prose-img:rounded-lg prose-a:no-underline hover:prose-a:underline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, rehypeHighlight]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
