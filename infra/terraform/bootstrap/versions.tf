# T-S17-07: recursos de una sola vez por cuenta (estado local; ver README del runbook, paso 1):
# bucket del estado remoto, proveedor OIDC de GitHub, roles de GitHub Actions y prerrequisitos de Packer.
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      App       = "banco-talentos"
      ManagedBy = "terraform-bootstrap"
    }
  }
}
