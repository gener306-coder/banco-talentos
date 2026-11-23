output "public_ip" {
  value = module.compute.public_ip
}

output "domain_a_record" {
  description = "Registro que se crea a mano en Hostinger (D2)."
  value       = "A  ${var.domain}  ${module.compute.public_ip}  (TTL 300)"
}

output "instance_id" {
  value = module.compute.instance_id
}

output "bucket" {
  value = module.storage.bucket
}

output "db_endpoint" {
  value = module.database.address
}

output "ssm_path" {
  value = local.ssm_path
}

output "app_url" {
  value = local.app_url
}
