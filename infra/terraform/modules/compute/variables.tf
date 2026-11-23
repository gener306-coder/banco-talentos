variable "name" {
  type = string
}

variable "environment" {
  type = string
}

variable "account_id" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "ami_id" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t4g.small"
}

variable "cpu_credits" {
  type        = string
  default     = "standard"
  description = "standard evita cargos por ráfagas largas; unlimited si los videos se procesan lento."
}

variable "root_volume_size" {
  type    = number
  default = 30
}

variable "ssm_path" {
  type = string
}

variable "bucket_arn" {
  type = string
}

variable "acme_email" {
  type = string
}
