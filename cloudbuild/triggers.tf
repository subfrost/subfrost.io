# Cloud Build trigger for news.subfrost.io. Mirrors subfrost-admin's
# cloudbuild/triggers.tf but points at THIS repo (subfrost/subfrost.io),
# since the news app source lives here.
#
# One-time prerequisite: connect subfrost/subfrost.io under
# Cloud Build → Triggers → Manage repositories (GitHub OAuth). Then
# `terraform apply` here, or create the trigger imperatively:
#
#   gcloud builds triggers create github \
#     --name=news-main \
#     --repo-owner=subfrost --repo-name=subfrost.io \
#     --branch-pattern='^main$' \
#     --build-config=cloudbuild/news.yaml \
#     --included-files='news/**,cloudbuild/news.yaml'

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.40"
    }
  }
}

variable "project_id" {
  type    = string
  default = "night-wolves-jogging"
}

variable "github_owner" {
  type    = string
  default = "subfrost"
}

variable "github_repo" {
  type    = string
  default = "subfrost.io"
}

provider "google" {
  project = var.project_id
}

resource "google_cloudbuild_trigger" "news_main" {
  name        = "news-main"
  description = "Build + push subfrost-news on every push to main"
  filename    = "cloudbuild/news.yaml"
  project     = var.project_id

  github {
    owner = var.github_owner
    name  = var.github_repo
    push {
      branch = "^main$"
    }
  }

  included_files = [
    "news/**",
    "cloudbuild/news.yaml",
  ]
}
