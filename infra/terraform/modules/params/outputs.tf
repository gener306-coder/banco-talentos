output "path" {
  value = var.path
}

# Depende de los recursos: quien lo use espera a que existan los parámetros, sin el depends_on de módulo que aplaza
# todos los data sources del módulo dependiente (y reemplazaba la EC2 en cada plan, T-S17-09).
output "parameter_count" {
  value = length(aws_ssm_parameter.plain) + length(aws_ssm_parameter.secure)
}
