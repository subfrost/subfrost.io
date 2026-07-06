#!/usr/bin/env node
/**
 * `tlsfetch` CLI bin entry. Mirrors the Rust tlsfetch-cli flag set;
 * the underlying TLS engine is the wasm-bindgen build of
 * tlsfetch-web-sys, driven over a Node `node:net` socket.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { tlsfetch } from "./index.js";
function parseArgs(argv) {
    const out = {
        urls: [],
        headers: [],
        remoteName: false,
        includeHeaders: false,
        head: false,
        silent: false,
        showError: false,
        verbose: false,
        fail: false,
        insecure: false,
        location: false,
        maxRedirs: 50,
        resolve: [],
    };
    let i = 0;
    const need = (flag) => {
        i++;
        if (i >= argv.length) {
            console.error(`tlsfetch: ${flag} requires an argument`);
            process.exit(2);
        }
        return argv[i];
    };
    while (i < argv.length) {
        const a = argv[i];
        switch (a) {
            case "-X":
            case "--request":
                out.method = need(a);
                break;
            case "-H":
            case "--header":
                out.headers.push(need(a));
                break;
            case "-d":
            case "--data":
                out.data = need(a);
                break;
            case "--data-raw":
                out.dataRaw = need(a);
                break;
            case "--data-binary":
                out.dataBinary = need(a);
                break;
            case "-u":
            case "--user":
                out.user = need(a);
                break;
            case "--oauth2-bearer":
                out.bearer = need(a);
                break;
            case "-A":
            case "--user-agent":
                out.userAgent = need(a);
                break;
            case "-e":
            case "--referer":
                out.referer = need(a);
                break;
            case "-b":
            case "--cookie":
                out.cookie = need(a);
                break;
            case "-o":
            case "--output":
                out.output = need(a);
                break;
            case "-O":
            case "--remote-name":
                out.remoteName = true;
                break;
            case "-i":
            case "--include":
                out.includeHeaders = true;
                break;
            case "-I":
            case "--head":
                out.head = true;
                break;
            case "-s":
            case "--silent":
                out.silent = true;
                break;
            case "-S":
            case "--show-error":
                out.showError = true;
                break;
            case "-v":
            case "--verbose":
                out.verbose = true;
                break;
            case "-f":
            case "--fail":
                out.fail = true;
                break;
            case "-k":
            case "--insecure":
                out.insecure = true;
                break;
            case "-L":
            case "--location":
                out.location = true;
                break;
            case "--max-redirs":
                out.maxRedirs = parseInt(need(a), 10);
                break;
            case "--connect-timeout":
                out.connectTimeout = parseFloat(need(a));
                break;
            case "-m":
            case "--max-time":
                out.maxTime = parseFloat(need(a));
                break;
            case "--resolve":
                out.resolve.push(need(a));
                break;
            case "--help":
            case "-h":
                printHelp();
                process.exit(0);
                break;
            case "--version":
            case "-V":
                console.log("tlsfetch (ts-sdk) 0.1.0");
                process.exit(0);
                break;
            default:
                if (a.startsWith("-")) {
                    console.error(`tlsfetch: unknown option ${a}`);
                    process.exit(2);
                }
                out.urls.push(a);
                break;
        }
        i++;
    }
    if (out.urls.length === 0) {
        console.error("tlsfetch: no URL given");
        process.exit(2);
    }
    return out;
}
function printHelp() {
    console.log(`Usage: tlsfetch [OPTIONS] URL...

Pure-Wasm TLS+HTTP client. Curl-compatible CLI on top of the
tlsfetch-web-sys wasm engine.

Common options (curl-compatible):
  -X, --request METHOD         HTTP method
  -H, --header HEADER          Add a request header (repeatable)
  -d, --data DATA              POST data (string or @file)
      --data-raw DATA          POST raw bytes
      --data-binary DATA       POST binary bytes (or @file)
  -u, --user USER:PASSWORD     HTTP basic auth
      --oauth2-bearer TOKEN    Bearer token Authorization
  -A, --user-agent STRING      User-Agent header
  -e, --referer URL            Referer header
  -b, --cookie DATA            Cookie header (or @file)
  -o, --output FILE            Write body to file
  -O, --remote-name            Use URL basename as filename
  -i, --include                Include response headers in output
  -I, --head                   HEAD request, headers only
  -s, --silent                 Quiet mode
  -S, --show-error             Show errors even with --silent
  -v, --verbose                Verbose: log handshake + headers
  -f, --fail                   Exit non-zero on HTTP >= 400
  -k, --insecure               Skip TLS certificate verification
      --resolve HOST:PORT:ADDR Override DNS for HOST:PORT to ADDR
  -m, --max-time SECONDS       Total max time
      --connect-timeout SECS   Connect-only timeout
  -L, --location               Follow redirects
      --max-redirs N           Max redirects to follow
  -h, --help                   This help
  -V, --version                Version
`);
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    let exitCode = 0;
    try {
        for (const url of args.urls) {
            await fetchOne(args, url);
        }
    }
    catch (e) {
        if (!args.silent || args.showError) {
            console.error(`tlsfetch: ${e?.message ?? e}`);
        }
        exitCode = classifyExit(e);
    }
    process.exit(exitCode);
}
function classifyExit(e) {
    const s = String(e?.message ?? e).toLowerCase();
    if (s.includes("resolve") || s.includes("dns"))
        return 6;
    if (s.includes("connection refused") || s.includes("connect "))
        return 7;
    if (s.includes("timeout") || s.includes("timed out"))
        return 28;
    if (s.includes("certificate") || s.includes("verify"))
        return 60;
    if (s.includes("tls") || s.includes("handshake"))
        return 35;
    if (s.includes("http_error"))
        return 22;
    return 1;
}
async function fetchOne(args, urlStr) {
    let currentUrl = urlStr;
    let redirectsLeft = args.location ? args.maxRedirs : 0;
    while (true) {
        const headers = {};
        for (const h of args.headers) {
            const idx = h.indexOf(":");
            if (idx < 0)
                throw new Error(`--header must be 'Name: value', got ${JSON.stringify(h)}`);
            headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
        }
        if (args.userAgent)
            headers["User-Agent"] = args.userAgent;
        if (args.referer)
            headers["Referer"] = args.referer;
        if (args.cookie) {
            const value = args.cookie.startsWith("@")
                ? fs.readFileSync(args.cookie.slice(1), "utf-8")
                : args.cookie;
            headers["Cookie"] = value;
        }
        if (args.user) {
            headers["Authorization"] = `Basic ${Buffer.from(args.user).toString("base64")}`;
        }
        if (args.bearer) {
            headers["Authorization"] = `Bearer ${args.bearer}`;
        }
        let body;
        let method = args.method?.toUpperCase();
        if (args.dataBinary !== undefined) {
            const v = args.dataBinary;
            body = v.startsWith("@") ? new Uint8Array(fs.readFileSync(v.slice(1))) : new TextEncoder().encode(v);
            method ??= "POST";
            headers["Content-Type"] ??= "application/x-www-form-urlencoded";
        }
        else if (args.dataRaw !== undefined) {
            body = new TextEncoder().encode(args.dataRaw);
            method ??= "POST";
        }
        else if (args.data !== undefined) {
            const v = args.data;
            const raw = v.startsWith("@") ? fs.readFileSync(v.slice(1), "utf-8").replace(/[\r\n]/g, "") : v;
            body = new TextEncoder().encode(raw);
            method ??= "POST";
            headers["Content-Type"] ??= "application/x-www-form-urlencoded";
        }
        if (args.head)
            method ??= "HEAD";
        method ??= "GET";
        if (args.verbose) {
            console.error(`* tlsfetch: ${method} ${currentUrl}`);
        }
        const resp = await tlsfetch(currentUrl, {
            method,
            headers,
            body,
            connectTimeoutMs: (args.connectTimeout ?? args.maxTime) ? (args.connectTimeout ?? args.maxTime) * 1000 : undefined,
            insecure: args.insecure,
            resolve: parseResolve(args.resolve, currentUrl),
        });
        if (args.verbose) {
            console.error(`< HTTP/1.1 ${resp.status} ${resp.statusText}`);
            for (const [k, v] of Object.entries(resp.headers))
                console.error(`< ${k}: ${v}`);
            console.error("<");
        }
        if (args.location && resp.status >= 300 && resp.status < 400 && resp.headers["location"]) {
            if (redirectsLeft <= 0)
                throw new Error("too many redirects");
            redirectsLeft--;
            const next = new URL(resp.headers["location"], currentUrl);
            currentUrl = next.toString();
            continue;
        }
        if (args.fail && resp.status >= 400) {
            throw new Error(`HTTP_ERROR ${resp.status} ${resp.statusText}`);
        }
        if (args.head || args.includeHeaders) {
            process.stdout.write(`HTTP/1.1 ${resp.status} ${resp.statusText}\r\n`);
            for (const [k, v] of Object.entries(resp.headers))
                process.stdout.write(`${k}: ${v}\r\n`);
            process.stdout.write("\r\n");
        }
        if (!args.head) {
            if (args.remoteName) {
                const u = new URL(currentUrl);
                const name = path.basename(u.pathname) || "index.html";
                fs.writeFileSync(name, Buffer.from(resp.body));
            }
            else if (args.output && args.output !== "-") {
                fs.writeFileSync(args.output, Buffer.from(resp.body));
            }
            else {
                process.stdout.write(Buffer.from(resp.body));
            }
        }
        return;
    }
}
function parseResolve(entries, urlStr) {
    const u = new URL(urlStr);
    const port = parseInt(u.port || "443", 10);
    for (const e of entries) {
        const parts = e.split(":");
        if (parts.length !== 3)
            continue;
        const [h, p, addr] = parts;
        if (h === u.hostname && parseInt(p, 10) === port) {
            return { host: h, port, addr };
        }
    }
    return undefined;
}
main();
//# sourceMappingURL=cli.js.map