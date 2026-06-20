# Cloud Build trigger: build the app image on push to main, then Flux rolls out
# the new tag.
#
# DISABLED for now. Creating it fails with "Error 400: invalid argument" because
# the GitHub App connection for subfrost/subfrost.io isn't actually established
# in this project — probed 2026-06-19: no 1st-gen installation usable by a
# trigger and no 2nd-gen connection exist. flex's "repo connected" didn't take.
#
# To enable: finish connecting the repo to Cloud Build (install the "Google
# Cloud Build" GitHub app on subfrost/subfrost.io in project night-wolves-jogging
# — easiest check: console → Cloud Build → Triggers → Create, see if the repo is
# selectable). Then uncomment and `terraform apply`, or create it in the console.
#
# resource "google_cloudbuild_trigger" "app" {
#   name        = "subfrost-io-app"
#   location    = "global"
#   description = "Build subfrost.io app image on push to main"
#   filename    = "cloudbuild.yaml"
#   github {
#     owner = "subfrost"
#     name  = "subfrost.io"
#     push {
#       branch = "^main$"
#     }
#   }
#   included_files = [
#     "app/**", "components/**", "lib/**", "actions/**", "prisma/**",
#     "public/**", "Dockerfile", "next.config.mjs", "package.json",
#     "pnpm-lock.yaml", "cloudbuild.yaml",
#   ]
# }
