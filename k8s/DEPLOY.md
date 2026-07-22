# Production Deploy Runbook

This app deploys to Kubernetes by pinning the image tag in `k8s/kustomization.yaml`
and letting Flux reconcile the cluster.

> **This is now automatic.** On every push to `main`, the `Deploy to GCP` workflow
> (`.github/workflows/deploy.yml`) builds + pushes the app image tagged with the
> commit SHA, then the `bump-flux-tag` job commits the matching `newTag` bump back
> to `main` — so Flux rolls the new image with no manual step. (It commits with the
> default `GITHUB_TOKEN`, whose pushes don't re-trigger workflows, so there's no
> loop.) The steps below are the **manual fallback** — for rollbacks, or if you
> need to pin a specific/older commit.

Use this when shipping a merged PR to `subfrost.io`.

## Preconditions

- The PR is merged to `main`.
- The target app image exists in Artifact Registry:
  `us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/subfrost-io:<short-sha>`.
- You have `kubectl` context for the production cluster.
- You have `flux` installed and authenticated for the cluster.

## Ship A Specific Commit

1. Choose the exact commit to ship.

   Prefer the merge commit on `main` that contains the PR. If `main` has newer
   unrelated commits and you do not want to ship them, pin the image tag for the
   specific PR commit instead.

   ```bash
   git fetch origin
   git log --oneline origin/main -10
   ```

2. Confirm the image exists.

   ```bash
   IMAGE_TAG="<short-sha>"
   gcloud artifacts docker images list \
     us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/subfrost-io \
     --include-tags \
     --filter="tags:${IMAGE_TAG}"
   ```

3. Update `k8s/kustomization.yaml`.

   Keep the tag quoted. A bare SHA-like value can be parsed incorrectly by YAML
   and cause `Init:InvalidImageName`.

   ```yaml
   images:
     - name: us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/subfrost-io
       newTag: "<short-sha>"
   ```

4. Commit and push the tag bump to `main`.

   ```bash
   git checkout main
   git pull --ff-only origin main
   git add k8s/kustomization.yaml
   git commit -m "deploy(io): bump subfrost-io newTag to <short-sha>"
   git push origin main
   ```

5. Reconcile Flux.

   Source first, then kustomization.

   ```bash
   flux reconcile source git subfrost-io
   flux reconcile kustomization subfrost-io -n flux-system
   ```

6. Watch rollout.

   ```bash
   kubectl rollout status deploy/subfrost-io -n subfrost
   kubectl get pods -n subfrost -l app=subfrost-io
   ```

7. Verify production.

   ```bash
   curl -I https://subfrost.io/
   curl -I https://subfrost.io/articles
   curl -I https://subfrost.io/volume
   ```

## Rollback

Set `newTag` back to the previous known-good image tag, commit to `main`, push,
then run the same Flux reconcile and rollout-status commands.

## Notes

- The running image is the pinned `newTag`, not automatically the latest `main`
  commit.
- Do not use `latest`; Flux cannot reliably detect moving tags.
- Schema changes require separate migration review before deploy. If no Prisma
  schema changed, the deployment init `prisma db push` should be a no-op.
