//! Server-rendered HTML: markdown docs and the subfrost-themed autoindex
//! navigator. Both share one dark "frost" stylesheet built from the app's
//! brand tokens (`app/globals.css` `--sf-*`): deep navy gradient, ice-blue
//! accents. Markdown render ports `rust/services/cdn/src/markdown.rs`; the
//! autoindex is new (the Go/axum CDN never had directory listing).

use pulldown_cmark::{html, Options, Parser};

use crate::gcs::{ListItem, Listing};

/// Shared frost theme. Kept as one string so docs + index look like one system.
const THEME: &str = r#"
  :root { color-scheme: dark;
    --sf-bg-start:#0a1628; --sf-bg-end:#0d1f35; --sf-surface:#152238;
    --sf-text:#e8f0ff; --sf-muted:#7a8ba8; --sf-primary:#5b9cff;
    --sf-primary-pressed:#4080e6; --sf-hair:#22314d; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; color: var(--sf-text);
    background: linear-gradient(160deg, var(--sf-bg-start), var(--sf-bg-end));
    font: 15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 2.25rem 1.25rem 5rem; }
  a { color: var(--sf-primary); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .brand { display:flex; align-items:center; gap:.55rem; font-weight:600;
    letter-spacing:.02em; margin-bottom: 1.5rem; }
  .brand .mark { width:.7rem; height:.7rem; border-radius:2px;
    background: var(--sf-primary); box-shadow:0 0 12px var(--sf-primary); }
  .crumbs { font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    font-size:.85rem; color: var(--sf-muted); margin-bottom: 1.25rem; word-break: break-all; }
  .crumbs a { color: var(--sf-muted); }
  .crumbs a:hover { color: var(--sf-primary); }
  table.idx { width:100%; border-collapse: collapse; background: var(--sf-surface);
    border:1px solid var(--sf-hair); border-radius:12px; overflow:hidden; }
  table.idx td, table.idx th { padding:.6rem .85rem; border-bottom:1px solid var(--sf-hair);
    text-align:left; }
  table.idx th { color: var(--sf-muted); font-weight:500; font-size:.78rem;
    text-transform:uppercase; letter-spacing:.04em; }
  table.idx tr:last-child td { border-bottom:none; }
  table.idx td.meta { color: var(--sf-muted); font-variant-numeric: tabular-nums;
    white-space:nowrap; text-align:right; font-size:.85rem; }
  .name .ic { color: var(--sf-muted); margin-right:.5rem; }
  .empty { color: var(--sf-muted); padding:1.5rem; text-align:center; }
  /* markdown body */
  .md h1,.md h2,.md h3,.md h4 { line-height:1.25; margin-top:2rem; }
  .md h1 { border-bottom:1px solid var(--sf-hair); padding-bottom:.3rem; }
  .md h2 { border-bottom:1px solid var(--sf-hair); padding-bottom:.3rem; }
  .md code { background: var(--sf-surface); padding:.15em .4em; border-radius:6px;
    font:.9em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  .md pre { background: var(--sf-surface); padding:1rem; border-radius:10px; overflow:auto;
    border:1px solid var(--sf-hair); }
  .md pre code { background:none; padding:0; }
  .md blockquote { border-left:3px solid var(--sf-primary); margin:0; padding:0 1rem;
    color: var(--sf-muted); }
  .md table { border-collapse:collapse; width:100%; }
  .md th,.md td { border:1px solid var(--sf-hair); padding:.4rem .7rem; }
  .md img { max-width:100%; }
  .topbar { display:flex; justify-content:space-between; align-items:center;
    font-size:.85rem; color: var(--sf-muted); border-bottom:1px solid var(--sf-hair);
    padding-bottom:.75rem; margin-bottom:1.5rem; }
"#;

/// Escape text for safe interpolation into HTML.
fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

fn page(title: &str, body: &str) -> String {
    format!(
        "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">\
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\
<title>{title}</title><style>{THEME}</style></head>\
<body><div class=\"wrap\"><div class=\"brand\"><span class=\"mark\"></span>subfrost</div>{body}</div></body></html>",
        title = esc(title),
    )
}

/// Render markdown bytes to a full frost-themed HTML document.
pub fn markdown(md: &str, title: &str, raw_url: &str, path: &str) -> String {
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TASKLISTS);
    opts.insert(Options::ENABLE_FOOTNOTES);
    opts.insert(Options::ENABLE_SMART_PUNCTUATION);
    let parser = Parser::new_ext(md, opts);
    let mut rendered = String::new();
    html::push_html(&mut rendered, parser);

    let body = format!(
        "<div class=\"topbar\"><span>{path}</span><a href=\"{raw}\">view raw</a></div>\
<div class=\"md\">{rendered}</div>",
        path = esc(path),
        raw = esc(raw_url),
    );
    page(title, &body)
}

/// Build the clickable breadcrumb for a `/`-terminated display path like
/// `alkanes/mainnet/`.
fn breadcrumbs(prefix: &str) -> String {
    let mut html = String::from("<div class=\"crumbs\"><a href=\"/\">/</a>");
    let mut acc = String::new();
    for seg in prefix.split('/').filter(|s| !s.is_empty()) {
        acc.push_str(seg);
        acc.push('/');
        html.push_str(&format!(
            "<a href=\"/{acc}\">{seg}</a>/",
            acc = esc(&acc),
            seg = esc(seg)
        ));
    }
    html.push_str("</div>");
    html
}

fn human_size(bytes: &str) -> String {
    let n: u64 = bytes.parse().unwrap_or(0);
    const U: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut v = n as f64;
    let mut i = 0;
    while v >= 1024.0 && i < U.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    if i == 0 {
        format!("{n} B")
    } else {
        format!("{v:.1} {}", U[i])
    }
}

/// Render a subfrost-themed directory listing. `prefix` is the `/`-terminated
/// object prefix being browsed; `listing.prefixes` are subdirs, `.items` files.
/// Every object key is served at `/{key}`, so links are `/{name}`.
pub fn autoindex(prefix: &str, listing: &Listing) -> String {
    let mut rows = String::new();

    // Parent directory link (unless at a top-level route root).
    let trimmed = prefix.trim_end_matches('/');
    if trimmed.contains('/') {
        let parent = &trimmed[..trimmed.rfind('/').unwrap() + 1];
        rows.push_str(&format!(
            "<tr><td class=\"name\"><span class=\"ic\">&#8617;</span><a href=\"/{p}\">../</a></td><td class=\"meta\"></td><td class=\"meta\"></td></tr>",
            p = esc(parent)
        ));
    }

    for dir in &listing.prefixes {
        let label = dir
            .strip_prefix(prefix)
            .unwrap_or(dir)
            .trim_end_matches('/');
        rows.push_str(&format!(
            "<tr><td class=\"name\"><span class=\"ic\">&#128193;</span><a href=\"/{href}\">{label}/</a></td><td class=\"meta\">&#8212;</td><td class=\"meta\"></td></tr>",
            href = esc(dir),
            label = esc(label)
        ));
    }

    for ListItem { name, size, updated } in &listing.items {
        // GCS returns the prefix marker object itself; skip it.
        if name == prefix {
            continue;
        }
        let label = name.strip_prefix(prefix).unwrap_or(name);
        let when = updated.split('T').next().unwrap_or("");
        rows.push_str(&format!(
            "<tr><td class=\"name\"><span class=\"ic\">&#128196;</span><a href=\"/{href}\">{label}</a></td><td class=\"meta\">{size}</td><td class=\"meta\">{when}</td></tr>",
            href = esc(name),
            label = esc(label),
            size = esc(&human_size(size)),
            when = esc(when)
        ));
    }

    let table = if rows.is_empty() {
        "<div class=\"empty\">empty</div>".to_string()
    } else {
        format!(
            "<table class=\"idx\"><thead><tr><th>Name</th><th class=\"meta\">Size</th><th class=\"meta\">Modified</th></tr></thead><tbody>{rows}</tbody></table>"
        )
    };

    let body = format!("{}{}", breadcrumbs(prefix), table);
    page(&format!("/{prefix}"), &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn human_size_scales() {
        assert_eq!(human_size("0"), "0 B");
        assert_eq!(human_size("512"), "512 B");
        assert_eq!(human_size("2048"), "2.0 KB");
        assert_eq!(human_size("1572864"), "1.5 MB");
    }

    #[test]
    fn breadcrumbs_link_each_segment() {
        let c = breadcrumbs("alkanes/mainnet/");
        assert!(c.contains("href=\"/alkanes/\""));
        assert!(c.contains("href=\"/alkanes/mainnet/\""));
    }

    #[test]
    fn autoindex_lists_dirs_and_files() {
        let listing = Listing {
            prefixes: vec!["docs/guide/".into()],
            items: vec![ListItem {
                name: "docs/readme.md".into(),
                size: "2048".into(),
                updated: "2026-07-20T10:00:00Z".into(),
            }],
        };
        let html = autoindex("docs/", &listing);
        assert!(html.contains("href=\"/docs/guide/\""));
        assert!(html.contains("href=\"/docs/readme.md\""));
        assert!(html.contains("2.0 KB"));
        assert!(html.contains("2026-07-20"));
    }
}
