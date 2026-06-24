//! Markdown -> styled HTML for `/docs/*.md` when a browser asks for it
//! (Go server's `renderMarkdown` + `templates/markdown.html`). Uses
//! pure-Rust pulldown-cmark with GFM extensions (tables, strikethrough,
//! task lists, footnotes), so the output tracks goldmark's GFM closely.

use pulldown_cmark::{html, Options, Parser};

/// Render `md` bytes to a full styled HTML document. `title` is the doc
/// title, `raw_url` links to the raw object, `path` is the display path.
pub fn render(md: &str, title: &str, raw_url: &str, path: &str) -> String {
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TASKLISTS);
    opts.insert(Options::ENABLE_FOOTNOTES);
    opts.insert(Options::ENABLE_SMART_PUNCTUATION); // ~ goldmark Typographer

    let parser = Parser::new_ext(md, opts);
    let mut body = String::new();
    html::push_html(&mut body, parser);

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ max-width: 820px; margin: 0 auto; padding: 2.5rem 1.25rem 5rem;
    font: 16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color: #e6e6e6; background: #0d1117; }}
  a {{ color: #58a6ff; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  h1,h2,h3,h4 {{ line-height: 1.25; margin-top: 2rem; }}
  h1 {{ border-bottom: 1px solid #30363d; padding-bottom: .3rem; }}
  h2 {{ border-bottom: 1px solid #21262d; padding-bottom: .3rem; }}
  code {{ background: #161b22; padding: .15em .4em; border-radius: 6px;
    font: .9em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }}
  pre {{ background: #161b22; padding: 1rem; border-radius: 8px; overflow: auto; }}
  pre code {{ background: none; padding: 0; }}
  blockquote {{ border-left: 3px solid #30363d; margin: 0; padding: 0 1rem; color: #9da7b1; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th,td {{ border: 1px solid #30363d; padding: .4rem .7rem; }}
  th {{ background: #161b22; }}
  img {{ max-width: 100%; }}
  .topbar {{ display: flex; justify-content: space-between; align-items: center;
    font-size: .85rem; color: #8b949e; border-bottom: 1px solid #21262d;
    padding-bottom: .75rem; margin-bottom: 1.5rem; }}
  .topbar .path {{ font-family: ui-monospace,monospace; }}
</style>
</head>
<body>
  <div class="topbar">
    <span class="path">{path}</span>
    <a href="{raw_url}">view raw</a>
  </div>
  {body}
</body>
</html>"#
    )
}
