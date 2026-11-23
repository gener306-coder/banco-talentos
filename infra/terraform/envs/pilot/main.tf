# T-S17-07: entorno piloto (docs/infra/pilot-aws-plan.md, §3). Opción A: EC2 pública + EIP + Caddy, RDS privado,
# bucket privado y configuración en SSM. Sin Route 53: el DNS vive en Hostinger (D2).
data "aws_caller_identity" "current" {}

locals {
  name     = "banco-talentos-${var.environment}"
  ssm_path = "/banco-talentos/${var.environment}"
  app_url  = "https://${var.domain}"
  bucket   = "${local.name}-${data.aws_caller_identity.current.account_id}"
}

module "network" {
  source = "../../modules/network"
  name   = local.name
  region = var.region
}

module "storage" {
  source        = "../../modules/storage"
  bucket_name   = local.bucket
  force_destroy = var.bucket_force_destroy
}

module "compute" {
  source        = "../../modules/compute"
  name          = local.name
  environment   = var.environment
  account_id    = data.aws_caller_identity.current.account_id
  vpc_id        = module.network.vpc_id
  vpc_cidr      = "10.20.0.0/16"
  subnet_id     = module.network.public_subnet_id
  ami_id        = var.ami_id
  instance_type = var.instance_type
  cpu_credits   = var.cpu_credits
  ssm_path      = local.ssm_path
  bucket_arn    = module.storage.bucket_arn
  acme_email    = var.acme_email

  # La instancia lee su configuración al arrancar: los parámetros deben existir antes.
  depends_on = [module.params]
}

module "database" {
  source                = "../../modules/database"
  name                  = local.name
  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.private_subnet_ids
  app_security_group_id = module.compute.security_group_id
  deletion_protection   = var.db_deletion_protection
  skip_final_snapshot   = var.db_skip_final_snapshot
}

# Auditoría QA, sección 3 #1. APP_KEY y MAIL_PASSWORD se cargan a mano (runbook): nunca pasan por el estado.
module "params" {
  source = "../../modules/params"
  path   = local.ssm_path

  values = {
    APP_NAME                 = "Banco de Talentos"
    APP_ENV                  = "production"
    APP_DEBUG                = "false"
    APP_URL                  = local.app_url
    FRONTEND_URL             = local.app_url
    CORS_ALLOWED_ORIGINS     = local.app_url
    APP_LOCALE               = "es"
    APP_FALLBACK_LOCALE      = "en"
    APP_MAINTENANCE_DRIVER   = "file"
    LOG_CHANNEL              = "stderr"
    LOG_LEVEL                = var.log_level
    DB_CONNECTION            = "pgsql"
    DB_HOST                  = module.database.address
    DB_PORT                  = tostring(module.database.port)
    DB_DATABASE              = module.database.db_name
    DB_USERNAME              = module.database.username
    DB_SSLMODE               = "require"
    CACHE_STORE              = "database"
    SESSION_DRIVER           = "database"
    SESSION_LIFETIME         = "120"
    SESSION_SECURE_COOKIE    = "true"
    SESSION_HTTP_ONLY        = "true"
    SESSION_SAME_SITE        = "lax"
    SANCTUM_STATEFUL_DOMAINS = var.domain
    QUEUE_CONNECTION         = "database"
    FILESYSTEM_DISK          = "local"
    MEDIA_DISK               = "s3"
    PRIVATE_DOCUMENTS_DISK   = "s3"
    AWS_DEFAULT_REGION       = var.region
    AWS_BUCKET               = module.storage.bucket
    MAIL_MAILER              = "smtp"
    MAIL_SCHEME              = var.mail.scheme
    MAIL_HOST                = var.mail.host
    MAIL_PORT                = tostring(var.mail.port)
    MAIL_USERNAME            = var.mail.username
    MAIL_TIMEOUT             = "10"
    MAIL_FROM_ADDRESS        = var.mail_from_address != "" ? var.mail_from_address : "no-reply@${var.domain}"
  }

  secure_values = {
    DB_PASSWORD = module.database.password
  }
}
