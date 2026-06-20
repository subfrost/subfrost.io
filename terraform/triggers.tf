# Cloud Build — 2nd-gen trigger: build the app image on push to main, then Flux
# rolls out the new tag.
#
# Uses the Developer Connect / Cloud Build v2 host connection "subfrost-github"
# (region us-central1), which flex authorized via OAuth (installationState =
# COMPLETE; GitHub app installation 99747193, user subfrostdev). The connection
# itself was created out-of-band (REST) and is intentionally NOT managed here —
# we only attach the repo and the trigger.
#
# This replaces the old 1st-gen `github{}` trigger, which 400'd because no real
# host connection existed. 2nd-gen triggers reference the repo via
# repository_event_config instead of an inline github{} block.

locals {
  cb_connection = "projects/${var.project_id}/locations/${var.region}/connections/subfrost-github"

  # 2nd-gen triggers require an explicit build service account — this project has
  # no legacy <projnum>@cloudbuild.gserviceaccount.com SA, so omitting it 400s.
  # The default compute SA has roles/editor (logging.logWriter + AR writer), so
  # the build can write logs (CLOUD_LOGGING_ONLY) and push to subfrost-docker.
  build_service_account = "projects/${var.project_id}/serviceAccounts/560256025842-compute@developer.gserviceaccount.com"
}

# Attach subfrost/subfrost.io to the host connection.
resource "google_cloudbuildv2_repository" "app" {
  name              = "subfrost-io"
  location          = var.region
  parent_connection = local.cb_connection
  remote_uri        = "https://github.com/subfrost/subfrost.io.git"
}

# Build subfrost.io on push to main. 2nd-gen triggers are regional (must match
# the connection's region), not global.
resource "google_cloudbuild_trigger" "app" {
  name        = "subfrost-io-app"
  location    = var.region
  description = "Build subfrost.io app image on push to main (2nd gen)"
  filename    = "cloudbuild.yaml"

  service_account = local.build_service_account

  repository_event_config {
    repository = google_cloudbuildv2_repository.app.id
    push {
      branch = "^main$"
    }
  }

  included_files = [
    "app/**", "components/**", "lib/**", "actions/**", "prisma/**",
    "public/**", "Dockerfile", "next.config.mjs", "package.json",
    "pnpm-lock.yaml", "cloudbuild.yaml",
  ]
}
