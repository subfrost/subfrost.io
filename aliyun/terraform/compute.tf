data "alicloud_images" "ubuntu" {
  owners      = "system"
  name_regex  = "^ubuntu_22_04_x64_20G_alibase"
  most_recent = true
}

resource "alicloud_ecs_key_pair" "default" {
  key_pair_name = "subfrost-meet-hk"
  public_key    = trimspace(file(pathexpand(var.ssh_pubkey_path)))
}

resource "random_password" "session_secret" {
  length  = 64
  special = false
}

resource "random_password" "turn_secret" {
  length  = 48
  special = false
}

locals {
  session_secret = var.session_secret_override != "" ? var.session_secret_override : random_password.session_secret.result
  turn_secret    = var.turn_secret_override != "" ? var.turn_secret_override : random_password.turn_secret.result

  meet_fqdn = "${var.meet_subdomain}.${var.domain}"
  turn_fqdn = "${var.turn_subdomain}.${var.domain}"
}

# ---------------------------------------------------------------------------
# meet-api ECS
# ---------------------------------------------------------------------------

resource "alicloud_eip_address" "meet_api" {
  address_name         = "subfrost-meet-api"
  bandwidth            = tostring(var.meet_api_bandwidth_mbps)
  internet_charge_type = var.internet_charge_type
}

resource "alicloud_instance" "meet_api" {
  instance_name              = "subfrost-meet-api"
  host_name                  = "meet-api"
  image_id                   = data.alicloud_images.ubuntu.images[0].id
  instance_type              = var.meet_api_instance_type
  vswitch_id                 = alicloud_vswitch.main.id
  security_groups            = [alicloud_security_group.meet_api.id]
  key_name                   = alicloud_ecs_key_pair.default.key_pair_name
  internet_max_bandwidth_out = 0 # use the EIP, not the instance's auto-allocated public IP
  system_disk_category       = "cloud_essd"
  system_disk_size           = 40

  user_data = base64encode(templatefile("${path.module}/cloud-init/meet-api.yaml.tpl", {
    image          = var.meet_api_image
    session_secret = local.session_secret
    turn_secret    = local.turn_secret
    turn_fqdn      = local.turn_fqdn
    meet_fqdn      = local.meet_fqdn
  }))
}

resource "alicloud_eip_association" "meet_api" {
  allocation_id = alicloud_eip_address.meet_api.id
  instance_id   = alicloud_instance.meet_api.id
}

# ---------------------------------------------------------------------------
# coturn ECS
# ---------------------------------------------------------------------------

resource "alicloud_eip_address" "coturn" {
  address_name         = "subfrost-coturn"
  bandwidth            = tostring(var.coturn_bandwidth_mbps)
  internet_charge_type = var.internet_charge_type
}

resource "alicloud_instance" "coturn" {
  instance_name              = "subfrost-coturn"
  host_name                  = "coturn"
  image_id                   = data.alicloud_images.ubuntu.images[0].id
  instance_type              = var.coturn_instance_type
  vswitch_id                 = alicloud_vswitch.main.id
  security_groups            = [alicloud_security_group.coturn.id]
  key_name                   = alicloud_ecs_key_pair.default.key_pair_name
  internet_max_bandwidth_out = 0
  system_disk_category       = "cloud_essd"
  system_disk_size           = 40

  user_data = base64encode(templatefile("${path.module}/cloud-init/coturn.yaml.tpl", {
    turn_secret = local.turn_secret
    turn_fqdn   = local.turn_fqdn
  }))
}

resource "alicloud_eip_association" "coturn" {
  allocation_id = alicloud_eip_address.coturn.id
  instance_id   = alicloud_instance.coturn.id
}
