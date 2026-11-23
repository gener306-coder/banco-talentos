# T-S17-06: AMI inmutable de Banco de Talentos (docs/infra/pilot-aws-plan.md, §2).
# Debian 13 arm64 + PHP 8.4 FPM + ffmpeg + Caddy, con la versión de la aplicación horneada y sin secretos.
# Packer entra por SSM Session Manager: no se abre el puerto 22 ni durante la construcción.

packer {
  required_version = ">= 1.11.0"
  required_plugins {
    amazon = {
      version = ">= 1.3.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "region" {
  type    = string
  default = "us-east-2" # D1 (Ohio)
}

variable "arch" {
  type        = string
  default     = "arm64"
  description = "arm64 (t4g, D3) o x86_64 (t3)."
  validation {
    condition     = contains(["arm64", "x86_64"], var.arch)
    error_message = "La arquitectura debe ser arm64 o x86_64."
  }
}

variable "instance_type" {
  type    = string
  default = "t4g.small"
}

variable "release_sha" {
  type        = string
  description = "SHA del commit construido; etiqueta la AMI y nombra la carpeta de la versión."
  validation {
    condition     = can(regex("^[0-9a-f]{7,40}$", var.release_sha))
    error_message = "El valor de release_sha debe ser un SHA de git."
  }
}

variable "artifact_path" {
  type        = string
  description = "release-<sha>.tar.gz armado por build-ami.yml (backend con vendor sin dev, frontend compilado)."
}

variable "build_instance_profile" {
  type        = string
  default     = "banco-talentos-packer-build"
  description = "Perfil de instancia con AmazonSSMManagedInstanceCore, sin acceso a SSM Parameter Store (bootstrap)."
}

variable "build_security_group_id" {
  type        = string
  description = "Grupo de seguridad sin entradas creado por bootstrap: la construcción no abre el puerto 22."
}

variable "subnet_id" {
  type        = string
  default     = ""
  description = "Subred pública con salida a internet; vacía usa la VPC por defecto."
}

locals {
  debian_arch = var.arch == "arm64" ? "arm64" : "amd64"
  timestamp   = formatdate("YYYYMMDDhhmmss", timestamp())
}

source "amazon-ebs" "app" {
  region        = var.region
  instance_type = var.instance_type

  source_ami_filter {
    filters = {
      name                = "debian-13-${local.debian_arch}-*"
      architecture        = var.arch
      virtualization-type = "hvm"
      root-device-type    = "ebs"
    }
    owners      = ["136693071363"] # Debian (cuenta oficial de las AMI de Debian en AWS)
    most_recent = true
  }

  # A1: Debian no trae amazon-ssm-agent. El user_data lo instala y arranca antes de que Packer se conecte por SSM.
  user_data_file = "${path.root}/files/ssm-agent-userdata.sh"

  communicator                = "ssh"
  ssh_username                = "admin"
  ssh_interface               = "session_manager"
  ssh_clear_authorized_keys   = true
  temporary_key_pair_type     = "ed25519"
  iam_instance_profile        = var.build_instance_profile
  security_group_id           = var.build_security_group_id
  subnet_id                   = var.subnet_id == "" ? null : var.subnet_id
  associate_public_ip_address = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  launch_block_device_mappings {
    device_name           = "/dev/xvda"
    volume_size           = 30
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  ami_name        = "banco-talentos-${var.release_sha}-${local.timestamp}"
  ami_description = "Banco de Talentos ${var.release_sha} (Debian 13 ${local.debian_arch})"

  tags = {
    App     = "banco-talentos"
    Release = var.release_sha
    Base    = "debian-13"
    Arch    = var.arch
  }
  snapshot_tags = {
    App     = "banco-talentos"
    Release = var.release_sha
  }
  run_tags = {
    Name = "packer-banco-talentos-${var.release_sha}"
    App  = "banco-talentos"
  }
}

build {
  sources = ["source.amazon-ebs.app"]

  provisioner "shell" {
    inline = ["sudo cloud-init status --wait || true"]
  }

  provisioner "file" {
    source      = var.artifact_path
    destination = "/tmp/release.tar.gz"
  }

  provisioner "file" {
    source      = "${path.root}/files/"
    destination = "/tmp/bt-files"
  }

  provisioner "shell" {
    environment_vars = [
      "RELEASE_SHA=${var.release_sha}",
      "DEBIAN_FRONTEND=noninteractive",
    ]
    execute_command = "chmod +x {{ .Path }}; sudo -E env {{ .Vars }} bash '{{ .Path }}'"
    scripts = [
      "${path.root}/scripts/01-base.sh",
      "${path.root}/scripts/02-app.sh",
      "${path.root}/scripts/99-verify.sh",
    ]
  }

  post-processor "manifest" {
    output     = "packer-manifest.json"
    strip_path = true
    custom_data = {
      release_sha = var.release_sha
    }
  }
}
