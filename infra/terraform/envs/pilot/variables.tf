variable "region" {
  type    = string
  default = "us-east-2" # D1 (Ohio)
}

variable "environment" {
  type    = string
  default = "pilot"
}

variable "domain" {
  type        = string
  description = "Subdominio del piloto (D2). Su registro A se crea a mano en Hostinger con la salida domain_a_record."
  validation {
    condition     = can(regex("^([a-z0-9-]+\\.)+[a-z]{2,}$", var.domain))
    error_message = "El dominio debe ser un nombre DNS en minúsculas, sin esquema ni ruta."
  }
}

variable "acme_email" {
  type        = string
  description = "Correo de contacto para Let's Encrypt (avisos de vencimiento)."
}

variable "ami_id" {
  type        = string
  description = "AMI construida por build-ami.yml."
}

variable "instance_type" {
  type    = string
  default = "t4g.small" # D3
}

variable "cpu_credits" {
  type    = string
  default = "standard"
}

variable "mail_from_address" {
  type        = string
  default     = ""
  description = "Vacío usa no-reply@<domain>."
}

variable "mail" {
  type = object({
    host     = string
    port     = number
    scheme   = string
    username = string
  })
  default = {
    host     = "smtp.resend.com" # D5
    port     = 465
    scheme   = "smtps"
    username = "resend"
  }
}

variable "log_level" {
  type    = string
  default = "warning"
}

# Protecciones: en el piloto se relajan solo con una decisión explícita en pilot.tfvars (destruir y recrear).
variable "db_deletion_protection" {
  type    = bool
  default = true
}

variable "db_skip_final_snapshot" {
  type    = bool
  default = false
}

variable "bucket_force_destroy" {
  type    = bool
  default = false
}
