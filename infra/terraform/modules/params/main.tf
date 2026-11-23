# T-S17-07: parámetros de SSM que Terraform conoce (/banco-talentos/<entorno>/*). bt-boot los lee al arrancar.
# APP_KEY y MAIL_PASSWORD no pasan por Terraform (nunca quedan en su estado): se cargan a mano (runbook, paso 2).
resource "aws_ssm_parameter" "plain" {
  for_each = var.values

  name  = "${var.path}/${each.key}"
  type  = "String"
  value = each.value
  tier  = "Standard"
}

resource "aws_ssm_parameter" "secure" {
  for_each = nonsensitive(toset(keys(var.secure_values)))

  name  = "${var.path}/${each.key}"
  type  = "SecureString"
  value = var.secure_values[each.key]
  tier  = "Standard"
}
