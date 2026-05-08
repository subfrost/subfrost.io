data "alicloud_zones" "default" {
  available_resource_creation = "VSwitch"
  available_instance_type     = var.meet_api_instance_type
}

locals {
  zone_id = coalesce(var.zone_id, data.alicloud_zones.default.zones[0].id)
}

resource "alicloud_vpc" "main" {
  vpc_name   = "subfrost-meet-hk"
  cidr_block = "10.0.0.0/16"
}

resource "alicloud_vswitch" "main" {
  vpc_id       = alicloud_vpc.main.id
  cidr_block   = "10.0.1.0/24"
  zone_id      = local.zone_id
  vswitch_name = "subfrost-meet-hk-a"
}

# meet-api: 443 (HTTPS signaling) + 80 (LE ACME challenge) + SSH
resource "alicloud_security_group" "meet_api" {
  security_group_name = "subfrost-meet-api"
  vpc_id              = alicloud_vpc.main.id
}

resource "alicloud_security_group_rule" "meet_api_https" {
  type              = "ingress"
  ip_protocol       = "tcp"
  policy            = "accept"
  port_range        = "443/443"
  security_group_id = alicloud_security_group.meet_api.id
  cidr_ip           = "0.0.0.0/0"
}

resource "alicloud_security_group_rule" "meet_api_http" {
  type              = "ingress"
  ip_protocol       = "tcp"
  policy            = "accept"
  port_range        = "80/80"
  security_group_id = alicloud_security_group.meet_api.id
  cidr_ip           = "0.0.0.0/0"
}

resource "alicloud_security_group_rule" "meet_api_ssh" {
  type              = "ingress"
  ip_protocol       = "tcp"
  policy            = "accept"
  port_range        = "22/22"
  security_group_id = alicloud_security_group.meet_api.id
  cidr_ip           = "0.0.0.0/0"
}

# coturn: 443/tcp+udp (TLS), 3478/tcp+udp (standard), 49152-65535/udp (relay), SSH
resource "alicloud_security_group" "coturn" {
  security_group_name = "subfrost-coturn"
  vpc_id              = alicloud_vpc.main.id
}

resource "alicloud_security_group_rule" "coturn_443_tcp" {
  type              = "ingress"
  ip_protocol       = "tcp"
  policy            = "accept"
  port_range        = "443/443"
  security_group_id = alicloud_security_group.coturn.id
  cidr_ip           = "0.0.0.0/0"
}

resource "alicloud_security_group_rule" "coturn_443_udp" {
  type              = "ingress"
  ip_protocol       = "udp"
  policy            = "accept"
  port_range        = "443/443"
  security_group_id = alicloud_security_group.coturn.id
  cidr_ip           = "0.0.0.0/0"
}

resource "alicloud_security_group_rule" "coturn_3478_tcp" {
  type              = "ingress"
  ip_protocol       = "tcp"
  policy            = "accept"
  port_range        = "3478/3478"
  security_group_id = alicloud_security_group.coturn.id
  cidr_ip           = "0.0.0.0/0"
}

resource "alicloud_security_group_rule" "coturn_3478_udp" {
  type              = "ingress"
  ip_protocol       = "udp"
  policy            = "accept"
  port_range        = "3478/3478"
  security_group_id = alicloud_security_group.coturn.id
  cidr_ip           = "0.0.0.0/0"
}

# coturn allocates relay ports in this range; must be reachable.
resource "alicloud_security_group_rule" "coturn_relay_udp" {
  type              = "ingress"
  ip_protocol       = "udp"
  policy            = "accept"
  port_range        = "49152/65535"
  security_group_id = alicloud_security_group.coturn.id
  cidr_ip           = "0.0.0.0/0"
}

# Port 80 for LE ACME http-01 challenge during cert issuance.
resource "alicloud_security_group_rule" "coturn_acme" {
  type              = "ingress"
  ip_protocol       = "tcp"
  policy            = "accept"
  port_range        = "80/80"
  security_group_id = alicloud_security_group.coturn.id
  cidr_ip           = "0.0.0.0/0"
}

resource "alicloud_security_group_rule" "coturn_ssh" {
  type              = "ingress"
  ip_protocol       = "tcp"
  policy            = "accept"
  port_range        = "22/22"
  security_group_id = alicloud_security_group.coturn.id
  cidr_ip           = "0.0.0.0/0"
}
