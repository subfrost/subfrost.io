# Live Streaming Setup Guide

Remaining infrastructure setup to get the Guangzhou conference streaming operational. The code is done — this is all ops/config work.

---

## 0. Cloudflare: Set SSL/TLS to Full (Strict)

**Do this first before enabling proxying on any record.**

1. Go to **Cloudflare dashboard > subfrost.io > SSL/TLS > Overview**
2. Set encryption mode to **Full (Strict)**

Without this, proxied records cause an infinite redirect loop — Cloudflare connects to Cloud Run over HTTP, Cloud Run redirects to HTTPS, repeat forever. Cloud Run has a valid Google-issued TLS cert so Full (Strict) works fine.

Once this is set, you can also flip the main `subfrost.io` A record to proxied (orange cloud) for GFW bypass on the main domain. The deploy scripts currently leave it as DNS-only to avoid the loop.

---

## 1. GCP: Create GCS Bucket

```bash
gsutil mb -l us-central1 gs://subfrost-live-streams/
gsutil iam ch allUsers:objectViewer gs://subfrost-live-streams/
```

The media server uploads HLS segments (.ts) and playlists (.m3u8) here. Public read access is needed so Cloudflare can cache and serve them to viewers.

---

## 2. GCP: Enable APIs

Make sure these are enabled on the `subfrost-io-app` project:

```bash
gcloud services enable storage.googleapis.com
gcloud services enable run.googleapis.com
```

The Cloud Run service account (`subfrost-io-app@appspot.gserviceaccount.com` or whatever WIF uses) needs `roles/storage.objectAdmin` on the bucket:

```bash
gsutil iam ch serviceAccount:YOUR_SERVICE_ACCOUNT:objectAdmin gs://subfrost-live-streams/
```

---

## 3. GitHub Secrets & Variables

Add these in **Settings > Secrets and variables > Actions**:

| Type | Name | Value |
|------|------|-------|
| Secret | `STREAM_SECRET` | A random string (e.g. `openssl rand -hex 32`). Shared between media server and broadcast page as a fallback auth method. |
| Secret | `ADMIN_SECRET` | Already exists — used by `/api/stream/start` and `/api/stream/stop` to create/end sessions. |

`ADMIN_SECRET` should already be set from the existing deploy. Verify it's there.

---

## 4. Cloudflare DNS Records

Add two new DNS records in the Cloudflare dashboard for `subfrost.io`:

| Name | Type | Target | Proxied | Notes |
|------|------|--------|---------|-------|
| `stream` | CNAME | `storage.googleapis.com` | Yes (orange cloud) | Serves HLS segments from GCS through CF edge |
| `media` | CNAME | `subfrost-media-server-*.run.app` | Yes (orange cloud) | WebSocket ingest endpoint. The exact Cloud Run URL gets set by CI on first deploy — add a placeholder, or let the deploy job create it. |

**Proxied = Yes is critical.** This is what makes it work through the GFW — traffic looks like normal HTTPS to `subfrost.io` subdomains.

---

## 5. Cloudflare: Transform Rule for GCS

`stream.subfrost.io/live/*` needs to map to the GCS bucket path. Create a **URL Rewrite** rule:

1. Go to **Rules > Transform Rules > Rewrite URL**
2. Create rule:
   - **When**: Hostname equals `stream.subfrost.io`
   - **Rewrite path**: Dynamic — `concat("/subfrost-live-streams", http.request.uri.path)`
   - This maps `stream.subfrost.io/live/{sessionId}/screen/playlist.m3u8` → `storage.googleapis.com/subfrost-live-streams/live/{sessionId}/screen/playlist.m3u8`

---

## 6. Cloudflare: Cache Rules for `stream.subfrost.io`

Create cache rules so segments are cached but playlists refresh quickly:

| Match | Cache-Control | Reason |
|-------|---------------|--------|
| `*.m3u8` | `max-age=2` | Playlists update every 4s as new segments appear |
| `*.ts` | `max-age=86400` | Segments are immutable once written |

You can do this via **Rules > Cache Rules** or a Page Rule on `stream.subfrost.io/*`.

---

## 7. Deploy

Merge `subfrostdev/stream` into `main`. The GitHub Actions workflow will:

1. Build and deploy `subfrost-io` (main site with `/broadcast`, `/live`, `/api/stream/*`)
2. Build and deploy `subfrost-media-server` (ffmpeg ingest server)
3. Update `media.subfrost.io` CNAME to point at the new Cloud Run service
4. Run `prisma db push` to add `StreamSession` and `StreamCaption` tables

If deploying manually first:

```bash
# Main site
bash gcp/deploy.sh

# Media server
cd media-server
docker build -t us-central1-docker.pkg.dev/subfrost-io-app/subfrost-docker/subfrost-media-server:latest .
docker push us-central1-docker.pkg.dev/subfrost-io-app/subfrost-docker/subfrost-media-server:latest
gcloud run deploy subfrost-media-server \
  --image us-central1-docker.pkg.dev/subfrost-io-app/subfrost-docker/subfrost-media-server:latest \
  --platform managed --region us-central1 \
  --allow-unauthenticated \
  --port 8080 --cpu 2 --memory 2Gi \
  --min-instances 0 --max-instances 3 \
  --concurrency 5 --timeout 3600 \
  --session-affinity \
  --set-env-vars "GCS_BUCKET=subfrost-live-streams,MAIN_APP_URL=https://subfrost.io,STREAM_SECRET=YOUR_SECRET"
```

---

## 8. Database Migration

After deploy, the CI runs `prisma db push` automatically. If running manually:

```bash
npx prisma db push
```

This adds two tables: `StreamSession` and `StreamCaption`.

---

## 9. Test It

### Start a stream session

```bash
curl -X POST https://subfrost.io/api/stream/start \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"title": "Guangzhou Conference"}'
```

Save the `streamKey` from the response.

### Open the broadcast page

Go to `https://subfrost.io/broadcast?key=STREAM_KEY` in Chrome. Click "Share Screen", click "Start Camera", click "Go Live".

### Open the viewer page

Go to `https://subfrost.io/live` in another browser/tab. You should see both panels playing after ~12-15 seconds (MediaRecorder buffer + HLS segment duration + upload latency).

### Test from China

Have someone access `https://subfrost.io/live` from inside China without a VPN. The HLS segments come through `stream.subfrost.io` which is proxied through Cloudflare — appears as normal HTTPS.

### End the stream

```bash
curl -X POST https://subfrost.io/api/stream/stop \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "SESSION_ID"}'
```

---

## Phase 5 (Later): Captions / Transcription

Not set up yet. Requires:

1. Enable **Cloud Speech-to-Text** and **Cloud Translation** APIs
2. Grant the media server service account `roles/speech.client` and `roles/cloudtranslate.user`
3. Add `src/transcription.ts`, `src/translation.ts`, `src/caption-push.ts` to media-server
4. Pipeline: ffmpeg audio → 10s WAV chunks → GCP STT → translate CN/EN → POST to `/api/stream/captions` → SSE to viewers

The viewer page caption UI is already built and will work once captions start flowing through the `/api/stream/captions` SSE endpoint.
