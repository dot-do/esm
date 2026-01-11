# GCP Cloud Run Module Outputs

output "service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_v2_service.esm.name
}

output "service_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.esm.uri
}

output "service_id" {
  description = "Fully qualified service ID"
  value       = google_cloud_run_v2_service.esm.id
}

output "latest_revision" {
  description = "Name of the latest revision"
  value       = google_cloud_run_v2_service.esm.latest_ready_revision
}

output "service_account_email" {
  description = "Email of the service account"
  value       = google_service_account.cloud_run.email
}

output "service_account_id" {
  description = "ID of the service account"
  value       = google_service_account.cloud_run.id
}

output "location" {
  description = "Location of the Cloud Run service"
  value       = google_cloud_run_v2_service.esm.location
}

output "observed_generation" {
  description = "Observed generation of the service"
  value       = google_cloud_run_v2_service.esm.observed_generation
}

output "custom_domain_status" {
  description = "Status of custom domain mapping"
  value       = var.custom_domain != null ? google_cloud_run_domain_mapping.esm[0].status : null
}
