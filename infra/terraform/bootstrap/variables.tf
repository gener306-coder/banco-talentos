variable "region" {
  type    = string
  default = "us-east-2" # D1 (Ohio)
}

variable "github_repository" {
  type        = string
  description = "owner/repo de GitHub autorizado a asumir los roles (p. ej. mi-org/banco-talentos)."
}

variable "github_oidc_sub_prefix" {
  type        = string
  default     = ""
  description = <<-EOT
    Prefijo del claim sub que emite GitHub para el repositorio. Si el repositorio usa sujetos inmutables
    (gh api repos/<owner>/<repo>/actions/oidc/customization/sub → use_immutable_subject: true), es
    repo:<owner>@<owner_id>/<repo>@<repo_id>. Vacío usa el formato clásico repo:<owner>/<repo>.
  EOT
  validation {
    condition     = var.github_oidc_sub_prefix == "" || can(regex("^repo:[^:]+$", var.github_oidc_sub_prefix))
    error_message = "El prefijo debe tener la forma repo:<owner>[@id]/<repo>[@id], sin dos puntos al final."
  }
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
