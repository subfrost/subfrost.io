# DNS-only (proxied=false) on both records:
# - meet-api: caddy on the ECS terminates TLS itself with LE; proxying through
#   Cloudflare would break the LE http-01 challenge unless we use DNS-01.
# - coturn: TURN-TLS is raw TLS, not HTTPS. Cloudflare proxy can't pass it.

resource "cloudflare_record" "meet_hk" {
  zone_id = var.cloudflare_zone_id
  name    = var.meet_subdomain
  content = alicloud_eip_address.meet_api.ip_address
  type    = "A"
  ttl     = 300
  proxied = false

  depends_on = [alicloud_eip_association.meet_api]
}

resource "cloudflare_record" "turn_hk" {
  zone_id = var.cloudflare_zone_id
  name    = var.turn_subdomain
  content = alicloud_eip_address.coturn.ip_address
  type    = "A"
  ttl     = 300
  proxied = false

  depends_on = [alicloud_eip_association.coturn]
}
