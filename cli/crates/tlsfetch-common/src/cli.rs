//! Shared `tlsfetch` CLI logic. Compiled into both the native bin
//! (`tlsfetch-cli`) and the wasm bin export from `@tlsfetch/ts-sdk`.
//!
//! [`CliArgs`] is the curl-compatible flag set; [`run`] takes a parsed
//! `CliArgs` plus a [`SocketFactory`] and executes the request,
//! writing output to the provided streams.

use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use clap::Parser;
use percent_encoding::{percent_encode, NON_ALPHANUMERIC};

use crate::client::{HttpClient, RequestOptions};
use crate::fingerprint::{Fingerprint, KnownFingerprint};
use crate::http1::{HttpRequest, HttpResponse};
use crate::protocol::Protocol;
use crate::proxy::{HttpConnectProxy, Socks5Proxy, Socks5Resolution};
use crate::socket::SocketFactory;

#[derive(Parser, Debug, Clone, Default)]
#[command(
    name = "tlsfetch",
    version,
    about = "curl-compatible HTTPS client backed by tlsfetch-common (pure-Rust TLS over abstract sockets)",
    long_about = None,
)]
pub struct CliArgs {
    /// One or more URLs to fetch.
    #[arg(value_name = "URL", required = true)]
    pub urls: Vec<String>,

    // ============ Request shape ============
    #[arg(short = 'X', long = "request", value_name = "METHOD")]
    pub method: Option<String>,

    #[arg(short = 'H', long = "header", value_name = "HEADER")]
    pub headers: Vec<String>,

    #[arg(short = 'd', long = "data", value_name = "DATA")]
    pub data: Option<String>,

    #[arg(long = "data-raw", value_name = "DATA")]
    pub data_raw: Option<String>,

    #[arg(long = "data-binary", value_name = "DATA")]
    pub data_binary: Option<String>,

    #[arg(long = "data-urlencode", value_name = "DATA")]
    pub data_urlencode: Vec<String>,

    #[arg(short = 'u', long = "user", value_name = "USER:PASSWORD")]
    pub user: Option<String>,

    #[arg(long = "oauth2-bearer", value_name = "TOKEN")]
    pub bearer: Option<String>,

    #[arg(short = 'A', long = "user-agent", value_name = "STRING")]
    pub user_agent: Option<String>,

    #[arg(short = 'e', long = "referer", value_name = "URL")]
    pub referer: Option<String>,

    #[arg(short = 'b', long = "cookie", value_name = "DATA")]
    pub cookie: Option<String>,

    #[arg(short = 'G', long = "get")]
    pub get: bool,

    // ============ Output ============
    #[arg(short = 'o', long = "output", value_name = "FILE")]
    pub output: Option<PathBuf>,

    #[arg(short = 'O', long = "remote-name")]
    pub remote_name: bool,

    #[arg(short = 'i', long = "include")]
    pub include_headers: bool,

    #[arg(short = 'D', long = "dump-header", value_name = "FILE")]
    pub dump_header: Option<PathBuf>,

    #[arg(short = 'I', long = "head")]
    pub head: bool,

    #[arg(short = 's', long = "silent")]
    pub silent: bool,

    #[arg(short = 'S', long = "show-error")]
    pub show_error: bool,

    #[arg(short = 'v', long = "verbose")]
    pub verbose: bool,

    #[arg(long = "compressed")]
    pub compressed: bool,

    #[arg(short = 'f', long = "fail")]
    pub fail: bool,

    #[arg(long = "fail-with-body")]
    pub fail_with_body: bool,

    // ============ TLS / network ============
    #[arg(short = 'k', long = "insecure")]
    pub insecure: bool,

    #[arg(long = "resolve", value_name = "HOST:PORT:ADDR")]
    pub resolve: Vec<String>,

    #[arg(short = 'm', long = "max-time", value_name = "SECONDS")]
    pub max_time: Option<f64>,

    #[arg(long = "connect-timeout", value_name = "SECONDS")]
    pub connect_timeout: Option<f64>,

    #[arg(short = 'L', long = "location")]
    pub location: bool,

    #[arg(long = "max-redirs", default_value_t = 50)]
    pub max_redirs: u32,

    // ============ TLS fingerprint (tlsfetch additions) ============
    #[arg(long = "ja3", value_name = "JA3")]
    pub ja3: Option<String>,

    #[arg(long = "fingerprint", value_name = "NAME")]
    pub fingerprint: Option<String>,

    // ============ HTTP version selection ============
    #[arg(long = "http1.0")]
    pub http1_0: bool,

    #[arg(long = "http1.1")]
    pub http1_1: bool,

    #[arg(long = "http2")]
    pub http2: bool,

    #[arg(long = "http3")]
    pub http3: bool,

    // ============ Proxy ============
    /// Use proxy for the request. Supports `http://`, `https://`,
    /// `socks5://`, `socks5h://` schemes. The host portion may include
    /// `user:password@` for inline credentials.
    #[arg(short = 'x', long = "proxy", value_name = "[PROTOCOL://]HOST[:PORT]")]
    pub proxy: Option<String>,

    /// Proxy credentials in `user:password` form. Overrides anything
    /// embedded in the `--proxy` URL.
    #[arg(short = 'U', long = "proxy-user", value_name = "USER:PASSWORD")]
    pub proxy_user: Option<String>,

    /// Comma-separated list of hosts that should bypass the proxy.
    /// `*` matches all. Falls back to `$NO_PROXY` / `$no_proxy`.
    #[arg(long = "noproxy", value_name = "HOSTS")]
    pub noproxy: Option<String>,

    /// SOCKS5 proxy. Equivalent to `--proxy socks5://HOST[:PORT]`.
    /// Resolves the destination hostname locally.
    #[arg(long = "socks5", value_name = "HOST[:PORT]")]
    pub socks5: Option<String>,

    /// SOCKS5 proxy that resolves the destination hostname remotely.
    /// Equivalent to `--proxy socks5h://HOST[:PORT]`. Better for
    /// anonymity (no client-side DNS leak).
    #[arg(long = "socks5-hostname", value_name = "HOST[:PORT]")]
    pub socks5_hostname: Option<String>,

    // ============ Auth (curl-compatible) ============
    /// Use NTLM authentication. Combine with `-u user:pass` (or
    /// `domain\user:pass` / `user@domain:pass`) to supply credentials.
    /// Requires the `ntlm` cargo feature.
    #[arg(long = "ntlm")]
    pub ntlm: bool,

    /// Use Negotiate / SPNEGO (Kerberos) authentication. Currently
    /// stubbed — see the `kerberos` cargo feature for the libgssapi
    /// backend.
    #[arg(long = "negotiate")]
    pub negotiate: bool,
}

/// Anything that can write CLI output. Native uses stdout/stderr;
/// wasm uses a JS-supplied callback that pipes back through the
/// browser/Node host.
pub trait CliIo {
    fn stdout_write(&mut self, bytes: &[u8]) -> Result<()>;
    fn stderr_write(&mut self, bytes: &[u8]) -> Result<()>;
}

/// Default `CliIo` over the process's real stdout/stderr.
pub struct StdIo;

impl CliIo for StdIo {
    fn stdout_write(&mut self, bytes: &[u8]) -> Result<()> {
        std::io::stdout().write_all(bytes)?;
        Ok(())
    }
    fn stderr_write(&mut self, bytes: &[u8]) -> Result<()> {
        std::io::stderr().write_all(bytes)?;
        Ok(())
    }
}

/// Curl-style exit codes for the most common failure classes.
pub fn classify_exit_code(err: &anyhow::Error) -> i32 {
    let s = err.to_string().to_lowercase();
    if s.contains("resolve") || s.contains("dns") {
        6
    } else if s.contains("connection refused") || s.contains("connect ") {
        7
    } else if s.contains("timeout") || s.contains("timed out") {
        28
    } else if s.contains("certificate") || s.contains("verify") {
        60
    } else if s.contains("tls") || s.contains("handshake") {
        35
    } else if s.contains("http_error") {
        22
    } else {
        1
    }
}

/// What kind of proxy `cli::run` should wrap the inner factory in.
enum ProxySpec {
    None,
    HttpConnect {
        host: String,
        port: u16,
        auth: Option<(String, String)>,
    },
    Socks5 {
        host: String,
        port: u16,
        auth: Option<(String, String)>,
        resolution: Socks5Resolution,
    },
}

/// Run the CLI loop. Generic over the SocketFactory so the same code
/// path works on native and wasm. If proxy flags or `HTTPS_PROXY` env
/// are set, the inner factory is wrapped in an [`HttpConnectProxy`]
/// or [`Socks5Proxy`] before being handed to the request loop.
pub fn run<F, IO>(args: CliArgs, factory: F, io: &mut IO) -> Result<()>
where
    F: SocketFactory + 'static,
    F::Socket: crate::socket::IntoStdTcpStream,
    IO: CliIo,
{
    let proxy = pick_proxy(&args)?;
    match proxy {
        ProxySpec::None => run_inner(args, factory, io),
        ProxySpec::HttpConnect { host, port, auth } => {
            let mut wrapper = HttpConnectProxy::new(factory, host, port);
            if let Some((u, p)) = auth {
                wrapper = wrapper.with_auth(u, p);
            }
            run_inner(args, wrapper, io)
        }
        ProxySpec::Socks5 {
            host,
            port,
            auth,
            resolution,
        } => {
            let mut wrapper = Socks5Proxy::new(factory, host, port, resolution);
            if let Some((u, p)) = auth {
                wrapper = wrapper.with_auth(u, p);
            }
            run_inner(args, wrapper, io)
        }
    }
}

fn run_inner<F, IO>(args: CliArgs, factory: F, io: &mut IO) -> Result<()>
where
    F: SocketFactory,
    F::Socket: crate::socket::IntoStdTcpStream,
    IO: CliIo,
{
    let client = HttpClient::new(factory);
    for url_str in &args.urls {
        fetch_one(&args, &client, io, url_str)?;
    }
    Ok(())
}

/// Resolve the proxy configuration from CLI flags + env vars.
/// Precedence: `--socks5-hostname` > `--socks5` > `--proxy` > env.
/// Returns `None` if `NO_PROXY` matches every URL we'll fetch.
fn pick_proxy(args: &CliArgs) -> Result<ProxySpec> {
    // 1. CLI flags first.
    if let Some(host) = &args.socks5_hostname {
        let (h, p) = parse_proxy_host(host, 1080)?;
        return Ok(ProxySpec::Socks5 {
            host: h,
            port: p,
            auth: parse_user_pass(&args.proxy_user),
            resolution: Socks5Resolution::RemoteDns,
        });
    }
    if let Some(host) = &args.socks5 {
        let (h, p) = parse_proxy_host(host, 1080)?;
        return Ok(ProxySpec::Socks5 {
            host: h,
            port: p,
            auth: parse_user_pass(&args.proxy_user),
            resolution: Socks5Resolution::LocalDns,
        });
    }
    if let Some(proxy) = &args.proxy {
        return parse_proxy_url(proxy, args.proxy_user.as_deref());
    }
    // 2. Env var fallback. curl checks both lowercase and
    //    uppercase; we follow that.
    for var in ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"] {
        if let Ok(val) = std::env::var(var) {
            if !val.is_empty() {
                return parse_proxy_url(&val, args.proxy_user.as_deref());
            }
        }
    }
    Ok(ProxySpec::None)
}

fn parse_user_pass(s: &Option<String>) -> Option<(String, String)> {
    let s = s.as_ref()?;
    let (u, p) = s.split_once(':')?;
    Some((u.to_string(), p.to_string()))
}

fn parse_proxy_host(s: &str, default_port: u16) -> Result<(String, u16)> {
    if let Some((h, p)) = s.rsplit_once(':') {
        // Bracketed IPv6: [::1]:8080
        let h = h.trim_start_matches('[').trim_end_matches(']');
        let port: u16 = p
            .parse()
            .with_context(|| format!("bad proxy port: {p:?}"))?;
        Ok((h.to_string(), port))
    } else {
        Ok((s.to_string(), default_port))
    }
}

fn parse_proxy_url(s: &str, override_user: Option<&str>) -> Result<ProxySpec> {
    // Accept bare "host:port" too — curl assumes http.
    let with_scheme = if s.contains("://") {
        s.to_string()
    } else {
        format!("http://{s}")
    };
    let url = url::Url::parse(&with_scheme)
        .with_context(|| format!("bad proxy URL: {s:?}"))?;
    let host = url
        .host_str()
        .ok_or_else(|| anyhow!("proxy URL has no host: {s:?}"))?
        .to_string();
    // URL crate's user/pass; override with --proxy-user if set.
    let auth = if let Some(up) = override_user {
        up.split_once(':').map(|(u, p)| (u.to_string(), p.to_string()))
    } else if !url.username().is_empty() {
        Some((
            percent_encoding::percent_decode_str(url.username())
                .decode_utf8_lossy()
                .into_owned(),
            url.password()
                .map(|p| {
                    percent_encoding::percent_decode_str(p)
                        .decode_utf8_lossy()
                        .into_owned()
                })
                .unwrap_or_default(),
        ))
    } else {
        None
    };
    let scheme = url.scheme();
    match scheme {
        "http" | "https" => {
            let port = url.port().unwrap_or(if scheme == "https" { 443 } else { 8080 });
            Ok(ProxySpec::HttpConnect { host, port, auth })
        }
        "socks5" => Ok(ProxySpec::Socks5 {
            host,
            port: url.port().unwrap_or(1080),
            auth,
            resolution: Socks5Resolution::LocalDns,
        }),
        "socks5h" => Ok(ProxySpec::Socks5 {
            host,
            port: url.port().unwrap_or(1080),
            auth,
            resolution: Socks5Resolution::RemoteDns,
        }),
        other => bail!("unsupported proxy scheme: {other:?}"),
    }
}

fn fetch_one<F, IO>(
    args: &CliArgs,
    client: &HttpClient<F>,
    io: &mut IO,
    url_str: &str,
) -> Result<()>
where
    F: SocketFactory,
    F::Socket: crate::socket::IntoStdTcpStream,
    IO: CliIo,
{
    let mut current_url = url::Url::parse(url_str).context("invalid URL")?;
    let mut redirects_left = if args.location { args.max_redirs } else { 0 };

    loop {
        let scheme = current_url.scheme();
        let plaintext = match scheme {
            "https" => false,
            "http" => true,
            other => bail!("unsupported URL scheme: {} (only http:// and https:// are supported)", other),
        };
        let host = current_url
            .host_str()
            .ok_or_else(|| anyhow!("URL has no host"))?
            .to_string();
        let default_port = if plaintext { 80 } else { 443 };
        let port = current_url.port().unwrap_or(default_port);
        let path = if let Some(q) = current_url.query() {
            format!("{}?{}", current_url.path(), q)
        } else if current_url.path().is_empty() {
            "/".to_string()
        } else {
            current_url.path().to_string()
        };

        let resolve_to = resolve_override(args, &host, port);
        if args.verbose {
            let dial = resolve_to.clone().unwrap_or_else(|| (host.clone(), port));
            io.stderr_write(format!("* tlsfetch: dialing {}:{}\n", dial.0, dial.1).as_bytes())?;
        }

        let mut opts = RequestOptions::default();
        opts.insecure = args.insecure;
        opts.plaintext = plaintext;
        opts.resolve_to = resolve_to;
        opts.connect_timeout = args
            .connect_timeout
            .or(args.max_time)
            .map(Duration::from_secs_f64);
        opts.force_protocol = pick_protocol(args)?;

        // Resolve --fingerprint or --ja3 into a Fingerprint.
        opts.fingerprint = pick_fingerprint(args)?;

        // NTLM auth (curl --ntlm). The credentials come from the
        // existing -u/--user flag, exactly like curl.
        #[cfg(feature = "ntlm")]
        if args.ntlm {
            let user = args.user.as_deref().ok_or_else(|| {
                anyhow!("--ntlm requires -u/--user user:pass (optionally domain\\user)")
            })?;
            // Workstation name: use the system hostname if available,
            // else "tlsfetch". Servers usually ignore it.
            let ws = std::env::var("HOSTNAME")
                .ok()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "tlsfetch".to_string());
            opts.ntlm = Some(crate::ntlm::parse_user_string(user, &ws));
        }
        if args.negotiate {
            return Err(crate::kerberos::unsupported_error().into());
        }

        // Pick the ALPN list. If a fingerprint specifies its own,
        // honor that; otherwise pick from the forced protocol.
        opts.alpn = if let Some(fp) = &opts.fingerprint {
            Some(fp.alpn.clone())
        } else {
            Some(alpn_for(opts.force_protocol.unwrap_or(Protocol::Http1)))
        };

        let req = build_request(args, &host, &path, port, plaintext)?;
        if args.verbose {
            io.stderr_write(format!("> {} {} HTTP/1.1\n", req.method, req.path).as_bytes())?;
            for (k, v) in &req.headers {
                io.stderr_write(format!("> {}: {}\n", k, v).as_bytes())?;
            }
            io.stderr_write(b">\n")?;
            if !req.body.is_empty() {
                io.stderr_write(format!("> [{} body bytes]\n", req.body.len()).as_bytes())?;
            }
        }

        let resp = client.send(&host, port, &req, &opts)?;

        if args.verbose {
            io.stderr_write(
                format!("< HTTP/1.1 {} {}\n", resp.status, resp.status_text).as_bytes(),
            )?;
            for (k, v) in &resp.headers {
                io.stderr_write(format!("< {}: {}\n", k, v).as_bytes())?;
            }
            io.stderr_write(b"<\n")?;
        }

        if args.location && (300..400).contains(&resp.status) {
            if let Some(loc) = resp.headers.get("location") {
                if redirects_left == 0 {
                    bail!("too many redirects");
                }
                redirects_left -= 1;
                let next = current_url
                    .join(loc)
                    .with_context(|| format!("invalid redirect target: {}", loc))?;
                if args.verbose {
                    io.stderr_write(format!("* tlsfetch: → {}\n", next).as_bytes())?;
                }
                current_url = next;
                continue;
            }
        }

        emit_response(args, io, &resp, &current_url)?;
        return Ok(());
    }
}

fn pick_fingerprint(args: &CliArgs) -> Result<Option<Fingerprint>> {
    if let Some(name) = &args.fingerprint {
        let known = KnownFingerprint::from_name(name).ok_or_else(|| {
            anyhow!(
                "unknown --fingerprint {:?}; valid: okhttp5, chrome120, firefox120, safari_ios17",
                name
            )
        })?;
        return Ok(Some(known.into_fingerprint()));
    }
    if let Some(ja3) = &args.ja3 {
        return Ok(Some(Fingerprint {
            name: "custom-ja3".to_string(),
            ja3: Some(ja3.clone()),
            ja4r: None,
            alpn: vec![b"http/1.1".to_vec()],
        }));
    }
    Ok(None)
}

fn pick_protocol(args: &CliArgs) -> Result<Option<Protocol>> {
    if args.http3 {
        return Ok(Some(Protocol::Http3));
    }
    if args.http2 {
        return Ok(Some(Protocol::Http2));
    }
    if args.http1_0 || args.http1_1 {
        return Ok(Some(Protocol::Http1));
    }
    Ok(None)
}

fn alpn_for(p: Protocol) -> Vec<Vec<u8>> {
    match p {
        Protocol::Http1 => vec![b"http/1.1".to_vec()],
        Protocol::Http2 => vec![b"h2".to_vec(), b"http/1.1".to_vec()],
        Protocol::Http3 => vec![b"h3".to_vec()],
    }
}

fn resolve_override(args: &CliArgs, host: &str, port: u16) -> Option<(String, u16)> {
    for line in &args.resolve {
        let parts: Vec<&str> = line.splitn(3, ':').collect();
        if parts.len() != 3 {
            continue;
        }
        let h = parts[0];
        let p: u16 = parts[1].parse().ok()?;
        let addr = parts[2];
        if h == host && p == port {
            return Some((addr.to_string(), port));
        }
    }
    None
}

fn build_request(args: &CliArgs, host: &str, path: &str, port: u16, plaintext: bool) -> Result<HttpRequest> {
    let mut req = HttpRequest::get(host, path);

    let method = if let Some(m) = &args.method {
        m.to_uppercase()
    } else if args.head {
        "HEAD".to_string()
    } else if args.data.is_some()
        || args.data_raw.is_some()
        || args.data_binary.is_some()
        || !args.data_urlencode.is_empty()
    {
        if args.get { "GET".to_string() } else { "POST".to_string() }
    } else {
        "GET".to_string()
    };
    req.method = method;

    let body_bytes = collect_body(args)?;
    if args.get && !body_bytes.is_empty() {
        let body_str = String::from_utf8_lossy(&body_bytes).to_string();
        if path.contains('?') {
            req.path = format!("{}&{}", path, body_str);
        } else {
            req.path = format!("{}?{}", path, body_str);
        }
    } else {
        req.body = body_bytes;
    }

    if let Some(ua) = &args.user_agent {
        req.headers.retain(|(k, _)| !k.eq_ignore_ascii_case("user-agent"));
        req.headers.push(("User-Agent".to_string(), ua.clone()));
    }
    if let Some(referer) = &args.referer {
        req.headers.push(("Referer".to_string(), referer.clone()));
    }
    if let Some(cookie) = &args.cookie {
        let value = if let Some(file) = cookie.strip_prefix('@') {
            fs::read_to_string(file).with_context(|| format!("read cookie file {}", file))?
        } else {
            cookie.clone()
        };
        req.headers.push(("Cookie".to_string(), value));
    }
    if let Some(user) = &args.user {
        let encoded = base64::engine::general_purpose::STANDARD.encode(user.as_bytes());
        req.headers
            .push(("Authorization".to_string(), format!("Basic {}", encoded)));
    }
    if let Some(token) = &args.bearer {
        req.headers
            .push(("Authorization".to_string(), format!("Bearer {}", token)));
    }
    if args.compressed {
        req.headers
            .push(("Accept-Encoding".to_string(), "gzip, deflate".to_string()));
    }

    let has_ct = req
        .headers
        .iter()
        .any(|(k, _)| k.eq_ignore_ascii_case("content-type"));
    if !has_ct && (args.data.is_some() || !args.data_urlencode.is_empty()) {
        req.headers.push((
            "Content-Type".to_string(),
            "application/x-www-form-urlencoded".to_string(),
        ));
    }

    for h in &args.headers {
        let (k, v) = h
            .split_once(':')
            .ok_or_else(|| anyhow!("--header must be 'Name: value', got {:?}", h))?;
        req.headers.push((k.trim().to_string(), v.trim().to_string()));
    }

    let default_port = if plaintext { 80 } else { 443 };
    let host_header = if port == default_port {
        host.to_string()
    } else {
        format!("{}:{}", host, port)
    };
    req.headers
        .retain(|(k, _)| !k.eq_ignore_ascii_case("host"));
    req.headers.insert(0, ("Host".to_string(), host_header));

    Ok(req)
}

fn collect_body(args: &CliArgs) -> Result<Vec<u8>> {
    if let Some(d) = &args.data_binary {
        if let Some(file) = d.strip_prefix('@') {
            return Ok(fs::read(file).with_context(|| format!("read body file {}", file))?);
        }
        return Ok(d.as_bytes().to_vec());
    }
    if let Some(d) = &args.data_raw {
        return Ok(d.as_bytes().to_vec());
    }
    if let Some(d) = &args.data {
        if let Some(file) = d.strip_prefix('@') {
            let raw = fs::read(file).with_context(|| format!("read body file {}", file))?;
            let stripped: Vec<u8> = raw.into_iter().filter(|b| *b != b'\n' && *b != b'\r').collect();
            return Ok(stripped);
        }
        return Ok(d.as_bytes().to_vec());
    }
    if !args.data_urlencode.is_empty() {
        let mut parts: Vec<String> = Vec::new();
        for entry in &args.data_urlencode {
            if let Some(eq) = entry.find('=') {
                let (name, value) = entry.split_at(eq);
                let value = &value[1..];
                let real = if let Some(file) = value.strip_prefix('@') {
                    fs::read_to_string(file).with_context(|| format!("read {}", file))?
                } else {
                    value.to_string()
                };
                let encoded = percent_encode(real.as_bytes(), NON_ALPHANUMERIC).to_string();
                parts.push(format!("{}={}", name, encoded));
            } else {
                let encoded = percent_encode(entry.as_bytes(), NON_ALPHANUMERIC).to_string();
                parts.push(encoded);
            }
        }
        return Ok(parts.join("&").into_bytes());
    }
    Ok(Vec::new())
}

fn emit_response<IO: CliIo>(
    args: &CliArgs,
    io: &mut IO,
    resp: &HttpResponse,
    url: &url::Url,
) -> Result<()> {
    let body: Vec<u8> = if args.compressed {
        decompress(&resp.body, resp.headers.get("content-encoding").map(String::as_str))?
    } else {
        resp.body.clone()
    };

    if (args.fail || args.fail_with_body) && resp.status >= 400 {
        if args.fail_with_body {
            write_body(args, io, url, &body)?;
        }
        bail!("HTTP_ERROR {} {}", resp.status, resp.status_text);
    }

    if let Some(path) = &args.dump_header {
        let mut out = String::new();
        out.push_str(&format!("HTTP/1.1 {} {}\n", resp.status, resp.status_text));
        for (k, v) in &resp.headers {
            out.push_str(&format!("{}: {}\n", k, v));
        }
        fs::write(path, out)?;
    }

    let need_headers = args.head || args.include_headers;
    if need_headers {
        io.stdout_write(
            format!("HTTP/1.1 {} {}\r\n", resp.status, resp.status_text).as_bytes(),
        )?;
        for (k, v) in &resp.headers {
            io.stdout_write(format!("{}: {}\r\n", k, v).as_bytes())?;
        }
        io.stdout_write(b"\r\n")?;
    }

    if !args.head {
        write_body(args, io, url, &body)?;
    }

    Ok(())
}

fn write_body<IO: CliIo>(
    args: &CliArgs,
    io: &mut IO,
    url: &url::Url,
    body: &[u8],
) -> Result<()> {
    if args.remote_name {
        let name = url
            .path_segments()
            .and_then(|mut s| s.next_back())
            .filter(|s| !s.is_empty())
            .unwrap_or("index.html")
            .to_string();
        fs::write(&name, body).with_context(|| format!("write {}", name))?;
        return Ok(());
    }
    if let Some(path) = &args.output {
        if path.to_string_lossy() == "-" {
            io.stdout_write(body)?;
        } else {
            fs::write(path, body).with_context(|| format!("write {}", path.display()))?;
        }
        return Ok(());
    }
    io.stdout_write(body)?;
    Ok(())
}

fn decompress(body: &[u8], encoding: Option<&str>) -> Result<Vec<u8>> {
    let Some(enc) = encoding else { return Ok(body.to_vec()) };
    let enc = enc.to_ascii_lowercase();
    if enc.contains("gzip") {
        use flate2::read::GzDecoder;
        let mut d = GzDecoder::new(body);
        let mut out = Vec::with_capacity(body.len() * 2);
        d.read_to_end(&mut out)?;
        return Ok(out);
    }
    if enc.contains("deflate") {
        use flate2::read::ZlibDecoder;
        let mut d = ZlibDecoder::new(body);
        let mut out = Vec::with_capacity(body.len() * 2);
        d.read_to_end(&mut out)?;
        return Ok(out);
    }
    Ok(body.to_vec())
}
