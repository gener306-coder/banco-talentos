data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  name       = "banco-talentos-${var.environment}"
  # Solo los jobs de entornos de GitHub obtienen credenciales (sin llaves estáticas): `pilot` exige aprobación manual;
  # `pilot-plan` solo ejecuta terraform plan en deploy-pilot.yml. Ambos se limitan a la rama main en GitHub.
  oidc_subject      = "repo:${var.github_repository}:environment:${var.github_environment}"
  oidc_plan_subject = "repo:${var.github_repository}:environment:${var.github_environment}-plan"
}

# --- Estado remoto --------------------------------------------------------------------------------------------------
resource "aws_s3_bucket" "state" {
  bucket = "banco-talentos-tfstate-${local.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "state_tls" {
  statement {
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket     = aws_s3_bucket.state.id
  policy     = data.aws_iam_policy_document.state_tls.json
  depends_on = [aws_s3_bucket_public_access_block.state]
}

# --- OIDC de GitHub -------------------------------------------------------------------------------------------------
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.oidc_subject]
    }
  }
}

data "aws_iam_policy_document" "github_assume_deploy" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.oidc_subject, local.oidc_plan_subject]
    }
  }
}

# --- Packer: rol de la instancia temporal y grupo de seguridad sin entradas ----------------------------------------
data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# Solo Session Manager: la instancia de construcción no puede leer SSM Parameter Store ni el bucket (cero secretos).
resource "aws_iam_role" "packer_build" {
  name               = "banco-talentos-packer-build"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
}

resource "aws_iam_role_policy_attachment" "packer_build_ssm" {
  role       = aws_iam_role.packer_build.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "packer_build" {
  name = "banco-talentos-packer-build"
  role = aws_iam_role.packer_build.name
}

data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "packer_build" {
  name        = "banco-talentos-packer-build"
  description = "Construccion de AMI: sin entradas (Packer entra por SSM)"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_egress_rule" "packer_build" {
  security_group_id = aws_security_group.packer_build.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
  description       = "Paquetes de Debian, Caddy, AWS CLI y SSM"
}

# --- Rol de build-ami.yml -------------------------------------------------------------------------------------------
resource "aws_iam_role" "build_ami" {
  name               = "banco-talentos-gha-build-ami"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

data "aws_iam_policy_document" "build_ami" {
  # Permisos mínimos documentados por el plugin amazon de Packer (EC2 no admite acotar casi ninguna acción por ARN).
  statement {
    sid = "PackerEc2"
    actions = [
      "ec2:AttachVolume", "ec2:CopyImage", "ec2:CreateImage", "ec2:CreateKeyPair", "ec2:CreateSnapshot",
      "ec2:CreateTags", "ec2:CreateVolume", "ec2:DeleteKeyPair", "ec2:DeleteSnapshot", "ec2:DeleteVolume",
      "ec2:DeregisterImage", "ec2:DescribeImageAttribute", "ec2:DescribeImages", "ec2:DescribeInstances",
      "ec2:DescribeInstanceStatus", "ec2:DescribeRegions", "ec2:DescribeSecurityGroups", "ec2:DescribeSnapshots",
      "ec2:DescribeSubnets", "ec2:DescribeTags", "ec2:DescribeVolumes", "ec2:DescribeVpcs", "ec2:DetachVolume",
      "ec2:ModifyImageAttribute", "ec2:ModifyInstanceAttribute", "ec2:ModifySnapshotAttribute", "ec2:RegisterImage",
      "ec2:RunInstances", "ec2:StopInstances", "ec2:TerminateInstances", "ec2:DescribeKeyPairs",
      "ec2:DescribeInstanceTypeOfferings", "ec2:DescribeInstanceTypes",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "PassPackerBuildRole"
    actions   = ["iam:PassRole", "iam:GetInstanceProfile"]
    resources = [aws_iam_role.packer_build.arn, aws_iam_instance_profile.packer_build.arn]
  }

  # Packer abre un túnel de Session Manager hacia la instancia temporal.
  statement {
    sid       = "PackerSessionManager"
    actions   = ["ssm:StartSession", "ssm:TerminateSession", "ssm:ResumeSession", "ssm:DescribeSessions", "ssm:DescribeInstanceInformation", "ssm:GetConnectionStatus"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "build_ami" {
  name   = "packer"
  role   = aws_iam_role.build_ami.id
  policy = data.aws_iam_policy_document.build_ami.json
}

# --- Rol de deploy-pilot.yml ----------------------------------------------------------------------------------------
resource "aws_iam_role" "deploy" {
  name               = "banco-talentos-gha-deploy-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.github_assume_deploy.json
}

data "aws_iam_policy_document" "deploy" {
  # Terraform administra la red, la EC2, la EIP, RDS y la alarma del piloto.
  statement {
    sid       = "ManagePilotInfrastructure"
    actions   = ["ec2:*", "rds:*", "cloudwatch:*Alarm*", "cloudwatch:ListTagsForResource", "cloudwatch:TagResource"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [local.region]
    }
  }

  statement {
    sid       = "TerraformState"
    actions   = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
  }

  statement {
    sid       = "PilotBucket"
    actions   = ["s3:*"]
    resources = ["arn:aws:s3:::${local.name}-${local.account_id}", "arn:aws:s3:::${local.name}-${local.account_id}/*"]
  }

  statement {
    sid       = "PilotParameters"
    actions   = ["ssm:PutParameter", "ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath", "ssm:DeleteParameter", "ssm:AddTagsToResource", "ssm:ListTagsForResource", "ssm:RemoveTagsFromResource"]
    resources = ["arn:aws:ssm:${local.region}:${local.account_id}:parameter/banco-talentos/${var.environment}/*"]
  }

  statement {
    sid       = "DescribeParameters"
    actions   = ["ssm:DescribeParameters"]
    resources = ["*"]
  }

  # Migraciones, artisan up, drenado de colas y smoke por SSM Run Command, solo en instancias del proyecto.
  statement {
    sid       = "RunCommandOnPilot"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ec2:${local.region}:${local.account_id}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/App"
      values   = ["banco-talentos"]
    }
  }

  statement {
    sid       = "RunShellScriptDocument"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ssm:${local.region}::document/AWS-RunShellScript"]
  }

  statement {
    sid       = "ReadCommandResults"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations", "ssm:DescribeInstanceInformation"]
    resources = ["*"]
  }

  # Roles e instance profile de la aplicación (solo los del proyecto).
  statement {
    sid = "PilotIam"
    actions = [
      "iam:GetRole", "iam:CreateRole", "iam:DeleteRole", "iam:TagRole", "iam:UntagRole", "iam:UpdateAssumeRolePolicy",
      "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:GetRolePolicy", "iam:PutRolePolicy",
      "iam:DeleteRolePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListInstanceProfilesForRole",
      "iam:GetInstanceProfile", "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
      "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile", "iam:TagInstanceProfile", "iam:PassRole",
    ]
    resources = [
      "arn:aws:iam::${local.account_id}:role/${local.name}-*",
      "arn:aws:iam::${local.account_id}:instance-profile/${local.name}-*",
    ]
  }

  statement {
    sid       = "ReadKmsAliasForSsm"
    actions   = ["kms:DescribeKey", "kms:ListAliases"]
    resources = ["*"]
  }

  statement {
    sid       = "RdsServiceLinkedRole"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/aws-service-role/rds.amazonaws.com/*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "terraform-${var.environment}"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
