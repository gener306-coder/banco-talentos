# T-S17-07: EC2 de la aplicación (Opción A, D4): pública, con Elastic IP y Caddy terminando HTTPS. Sin puerto 22:
# la administración es por SSM Session Manager. Una AMI nueva reemplaza la instancia (create_before_destroy).
data "aws_region" "current" {}

data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

# --- Grupo de seguridad -------------------------------------------------------------------------------------------
resource "aws_security_group" "app" {
  name        = "${var.name}-app"
  description = "HTTP y HTTPS publicos; sin SSH (acceso por SSM)"
  vpc_id      = var.vpc_id
  tags        = { Name = "${var.name}-app" }
}

resource "aws_vpc_security_group_ingress_rule" "web" {
  for_each = {
    http-ipv4  = { port = 80, cidr_ipv4 = "0.0.0.0/0", cidr_ipv6 = null }
    https-ipv4 = { port = 443, cidr_ipv4 = "0.0.0.0/0", cidr_ipv6 = null }
    http-ipv6  = { port = 80, cidr_ipv4 = null, cidr_ipv6 = "::/0" }
    https-ipv6 = { port = 443, cidr_ipv4 = null, cidr_ipv6 = "::/0" }
  }

  security_group_id = aws_security_group.app.id
  ip_protocol       = "tcp"
  from_port         = each.value.port
  to_port           = each.value.port
  cidr_ipv4         = each.value.cidr_ipv4
  cidr_ipv6         = each.value.cidr_ipv6
  description       = each.key
}

# Salida: HTTPS (SSM, S3, ACME, parches), HTTP (validación ACME y espejos de Debian), SMTP de envío (AWS bloquea el
# 25) y PostgreSQL dentro de la VPC. El DNS, el reloj y los metadatos de AWS no pasan por los grupos de seguridad.
resource "aws_vpc_security_group_egress_rule" "out" {
  for_each = {
    https      = { port = 443, cidr = "0.0.0.0/0" }
    http       = { port = 80, cidr = "0.0.0.0/0" }
    smtps      = { port = 465, cidr = "0.0.0.0/0" }
    submission = { port = 587, cidr = "0.0.0.0/0" }
    postgres   = { port = 5432, cidr = var.vpc_cidr }
  }

  security_group_id = aws_security_group.app.id
  ip_protocol       = "tcp"
  from_port         = each.value.port
  to_port           = each.value.port
  cidr_ipv4         = each.value.cidr
  description       = each.key
}

# --- Rol de la instancia (mínimo privilegio) ------------------------------------------------------------------------
data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${var.name}-app"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "app" {
  statement {
    sid       = "ReadConfiguration"
    actions   = ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${data.aws_region.current.region}:${var.account_id}:parameter${var.ssm_path}/*", "arn:aws:ssm:${data.aws_region.current.region}:${var.account_id}:parameter${var.ssm_path}"]
  }

  statement {
    sid       = "DecryptConfiguration"
    actions   = ["kms:Decrypt"]
    resources = [data.aws_kms_alias.ssm.target_key_arn]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${data.aws_region.current.region}.amazonaws.com"]
    }
  }

  statement {
    sid       = "ObjectsInBucket"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.bucket_arn}/*"]
  }

  statement {
    sid       = "ListBucket"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arn]
  }
}

resource "aws_iam_role_policy" "app" {
  name   = "${var.name}-app"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_iam_instance_profile" "app" {
  name = "${var.name}-app"
  role = aws_iam_role.app.name
}

# --- Instancia --------------------------------------------------------------------------------------------------
resource "aws_instance" "app" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  # A3: la instancia de reemplazo (create_before_destroy) necesita salida a SSM y S3 antes de recibir la EIP.
  associate_public_ip_address = true

  credit_specification {
    cpu_credits = var.cpu_credits
  }

  # Recuperación automática simplificada de EC2: mueve la instancia a otro host si falla el del proveedor. Reemplaza la
  # alarma de CloudWatch con acción ec2:recover, que exige el rol vinculado AWSServiceRoleForCloudWatchEvents
  # (AccessDenied en el primer despliegue, T-S17-09).
  maintenance_options {
    auto_recovery = "default"
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/user-data.yaml.tftpl", {
    environment = var.environment
    ssm_path    = var.ssm_path
    region      = data.aws_region.current.region
    acme_email  = var.acme_email
  })
  user_data_replace_on_change = true

  # ConfigParameters crea la dependencia con los parámetros de SSM (bt-boot los lee al arrancar); cambiarla solo
  # actualiza la etiqueta, nunca reemplaza la instancia.
  tags = { Name = "${var.name}-app", ConfigParameters = tostring(var.config_parameter_count) }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_eip" "app" {
  domain = "vpc"
  tags   = { Name = "${var.name}-app" }
}

resource "aws_eip_association" "app" {
  allocation_id = aws_eip.app.id
  instance_id   = aws_instance.app.id
}
