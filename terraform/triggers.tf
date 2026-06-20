# Cloud Build trigger: build the app image on push to main, then Flux rolls out
# the new tag. Requires the 1st-gen "Google Cloud Build" GitHub App connection,
# which flex already linked for subfrost/subfrost.io. (1st-gen github triggers
# are global.) media-server / meet-api triggers intentionally omitted.
resource "google_cloudbuild_trigger" "app" {
  name        = "subfrost-io-app"
  location    = "global"
  description = "Build subfrost.io app image on push to main"
  filename    = "cloudbuild.yaml"

  github {
    owner = "subfrost"
    name  = "subfrost.io"
    push {
      branch = "^main$"
    }
  }

  # Only fire on changes that affect the image (mirrors cloudbuild.yaml's notes).
  included_files = [
    "app/**",
    "components/**",
    "lib/**",
    "actions/**",
    "prisma/**",
    "public/**",
    "Dockerfile",
    "next.config.mjs",
    "package.json",
    "pnpm-lock.yaml",
    "cloudbuild.yaml",
  ]
}
