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

## Setup

**Nothing to do — it's wired.** The `preview` label already exists, and the
workflows carry the GCP identifiers inline (project `night-wolves-jogging`, the
`github-pool/github-provider` WIF provider, and the `dark-coyote-running@…`
service account — the same ones the prod Deploy workflow uses). These are
non-secret identifiers; auth still requires this repo's GitHub OIDC token, so
they're safe to commit. The only real secret, `ADMIN_SECRET`, is already a
repo-level secret available to these jobs, and the Cloud Run secrets
`db-connection-string` / `cms-auth-secret` are read from Secret Manager at
deploy time.

The WIF service account (`dark-coyote-running`) already holds the roles the
deploy needs (`run.admin`, `artifactregistry.writer`, `cloudsql.client`,
`secretmanager.secretAccessor`, `vpcaccess.user`, `iam.serviceAccountUser`),
so no IAM change is required — previews reuse the same SA as the prod deploy.

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
