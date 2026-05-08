variable "region" {
  type        = string
  default     = "cn-hongkong"
  description = "Aliyun region. cn-hongkong has no ICP requirement and ~30-60ms RTT to mainland CN."
}

variable "zone_id" {
  type        = string
  default     = null
  description = "Specific availability zone. If null, picks the first zone with the desired instance type."
}

variable "domain" {
  type    = string
  default = "subfrost.io"
}

variable "meet_subdomain" {
  type    = string
  default = "meet-hk"
}

variable "turn_subdomain" {
  type    = string
  default = "turn-hk"
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone ID for subfrost.io. Source ~/.subfrostcloudflarerc and pass via -var or TF_VAR_cloudflare_zone_id."
}

variable "meet_api_image" {
  type    = string
  default = "ghcr.io/subfrostdev/meet-api:latest"
}

variable "meet_api_instance_type" {
  type    = string
  default = "ecs.g7.large" # 2 vCPU / 8 GB
}

variable "coturn_instance_type" {
  type        = string
  default     = "ecs.g7.large"
  description = "coturn benefits from network-optimized instances when scaling — bump to g7ne when you outgrow this."
}

variable "internet_charge_type" {
  type        = string
  default     = "PayByTraffic"
  description = "PayByTraffic is right for low/spiky usage. Switch to PayByBandwidth for steady-state when traffic justifies."
}

variable "meet_api_bandwidth_mbps" {
  type    = number
  default = 100
}

variable "coturn_bandwidth_mbps" {
  type        = number
  default     = 200
  description = "TURN-relayed media is the fat pipe. Bump as concurrency grows."
}

variable "ssh_pubkey_path" {
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
  description = "Public key uploaded to ECS for SSH access. Must exist."
}

variable "session_secret_override" {
  type        = string
  default     = ""
  description = "Override the auto-generated MEET_API_SESSION_SECRET. Leave blank to let Terraform mint one (stored in tfstate)."
  sensitive   = true
}

variable "turn_secret_override" {
  type        = string
  default     = ""
  description = "Override the auto-generated MEET_API_TURN_SECRET (shared with coturn use-auth-secret)."
  sensitive   = true
}
