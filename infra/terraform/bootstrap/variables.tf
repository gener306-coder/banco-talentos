variable "region" {
  type    = string
  default = "us-east-2" # D1 (Ohio)
}

variable "github_repository" {
  type        = string
  description = "owner/repo de GitHub autorizado a asumir los roles (p. ej. mi-org/banco-talentos)."
}

variable "github_environment" {
  type        = string
  default     = "pilot"
  description = "Entorno de GitHub (con aprobación manual) que pueden usar build-ami.yml y deploy-pilot.yml."
}

variable "environment" {
  type    = string
  default = "pilot"
}
