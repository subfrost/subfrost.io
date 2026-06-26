# PR preview deploys (Cloud Run)

Replaces Netlify deploy previews. Every pull request labeled `preview` is built
and deployed to its own throwaway Cloud Run service so you can review it on a
real URL before merging — same stack as production (Cloud Run + Workload
Identity Federation + Artifact Registry + Cloud SQL + Redis), no Netlify, no
extra bill beyond Cloud Run usage (scales to zero).

| | |
|---|---|
| Trigger | add the **`preview`** label to a PR |
| Service | `subfrost-io-pr-<number>` in `us-central1` |
| URL | posted as a sticky comment on the PR |
| Updates | redeploys on every push while labeled |
| Teardown | automatic on PR close/merge, or when the label is removed |

Workflows: [`.github/workflows/preview.yml`](../.github/workflows/preview.yml) and
[`.github/workflows/preview-teardown.yml`](../.github/workflows/preview-teardown.yml).

## How to use

1. Open or push a PR (forks are fine — see "Why the label gate" below).
2. A maintainer adds the **`preview`** label.
3. CI builds the image, deploys `subfrost-io-pr-<number>`, and comments the URL.
4. Push more commits → the same service redeploys automatically.
5. Close/merge the PR (or remove the label) → the service is deleted.

## Why the label gate (forks)

Most PRs here come from forks (e.g. #132). A normal `pull_request` workflow
gives fork PRs **no secrets and no OIDC token**, so the WIF → Cloud Run auth
can't run. These workflows use `pull_request_target`, which runs with this
repo's secrets — but it builds the PR's own (untrusted) code, so deploys are
gated on the `preview` label that a maintainer adds after a quick look. The
workflow *definition* always comes from `main`, never the PR.

## One-time setup

1. **Create the `preview` label** (once):
   ```bash
   gh label create preview --repo subfrost/subfrost.io \
     --color 1f6feb --description "Deploy a Cloud Run preview for this PR"
   ```

2. **Give the `Preview` GitHub environment the secrets it needs.** Both
   workflows use `environment: Preview`. Copy these from the `Production`
   environment (Settings → Environments → Preview → Add secret):

   | Secret | Purpose |
   |---|---|
   | `GCP_PROJECT_ID` | target GCP project |
   | `WIF_PROVIDER` | Workload Identity provider resource name |
   | `WIF_SERVICE_ACCOUNT` | deploy service account email |
   | `ADMIN_SECRET` | admin/CMS secret (repo-level today; add to env or keep repo-level) |

   The Cloud Run secrets `db-connection-string` and `cms-auth-secret` are read
   from Secret Manager at deploy time — no GitHub secret needed.

3. **WIF service account roles** — already granted by `gcp/setup-github-wif.sh`
   (`roles/run.admin`, `artifactregistry.writer`, `cloudsql.client`,
   `secretmanager.secretAccessor`, `vpcaccess.user`, `iam.serviceAccountUser`).
   No change needed; previews reuse the same SA as the prod deploy.

## Data & cost notes

- **Database:** previews reuse the **production** Cloud SQL + Redis so content is
  real. The `/admin` CMS *can* write to prod data — treat previews as
  read-mostly design review. The workflow never runs `prisma db push`, so a
  preview can't alter the shared prod schema (a PR adding columns may show
  errors on pages using them — expected).
- **Cost:** `--min-instances 0 --max-instances 2`, so idle previews cost ~nothing
  and are deleted on close.
- **Not wired for previews** (prod-only): the prefetch Cloud Scheduler job,
  Cloudflare DNS, and the media-server deploy.
