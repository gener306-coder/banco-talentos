variable "path" {
  type        = string
  description = "Prefijo sin barra final, p. ej. /banco-talentos/pilot."
}

variable "values" {
  type = map(string)
}

variable "secure_values" {
  type      = map(string)
  sensitive = true
}
