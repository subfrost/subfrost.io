output "meet_api_ip" {
  value       = alicloud_eip_address.meet_api.ip_address
  description = "Public IP of the meet-api ECS"
}

output "coturn_ip" {
  value       = alicloud_eip_address.coturn.ip_address
  description = "Public IP of the coturn ECS"
}

output "meet_fqdn" {
  value = local.meet_fqdn
}

output "turn_fqdn" {
  value = local.turn_fqdn
}

output "session_secret" {
  value       = local.session_secret
  sensitive   = true
  description = "MEET_API_SESSION_SECRET — also embedded on the VM. View with: terraform output -raw session_secret"
}

output "turn_secret" {
  value       = local.turn_secret
  sensitive   = true
  description = "Shared secret between meet-api and coturn. View with: terraform output -raw turn_secret"
}

output "ssh_meet_api" {
  value = "ssh root@${alicloud_eip_address.meet_api.ip_address}"
}

output "ssh_coturn" {
  value = "ssh root@${alicloud_eip_address.coturn.ip_address}"
}
