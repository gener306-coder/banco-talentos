output "state_bucket" {
  value = aws_s3_bucket.state.id
}

output "build_ami_role_arn" {
  description = "Variable de GitHub AWS_BUILD_AMI_ROLE_ARN."
  value       = aws_iam_role.build_ami.arn
}

output "deploy_role_arn" {
  description = "Variable de GitHub AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}

output "packer_build_instance_profile" {
  value = aws_iam_instance_profile.packer_build.name
}

output "packer_build_security_group_id" {
  description = "Variable de GitHub PACKER_SECURITY_GROUP_ID."
  value       = aws_security_group.packer_build.id
}
