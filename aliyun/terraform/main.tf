terraform {
  required_version = ">= 1.6"

  required_providers {
    alicloud = {
      source  = "aliyun/alicloud"
      version = "~> 1.230"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# Auth via env: ALICLOUD_ACCESS_KEY, ALICLOUD_SECRET_KEY
provider "alicloud" {
  region = var.region
}

# Auth via env: CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL
# (sourced from ~/.subfrostcloudflarerc)
provider "cloudflare" {}
