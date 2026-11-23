variable "bucket_name" {
  type = string
}

variable "force_destroy" {
  type        = bool
  default     = false
  description = "true permite que terraform destroy borre el bucket con sus archivos (solo en el piloto)."
}

variable "noncurrent_version_days" {
  type    = number
  default = 30
}
