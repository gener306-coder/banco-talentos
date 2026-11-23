terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Estado remoto en el bucket creado por bootstrap/, con bloqueo nativo de S3 (use_lockfile, sin DynamoDB).
  # terraform init -backend-config=backend.hcl (copia backend.hcl.example).
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      App         = "banco-talentos"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
