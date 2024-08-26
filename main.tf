# Copyright 2024 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "google" {
  user_project_override = true
}

# Value obtained from the TF_VAR_project environment variable
variable "project" {
  type = string
}

# For project ID <-> project number conversion
data "google_project" "project" {
  project_id = var.project
}

resource "google_project_service" "services" {
  for_each = toset([
    "serviceusage.googleapis.com",
    "generativelanguage.googleapis.com",
    "apikeys.googleapis.com",
    "firestore.googleapis.com",
    "firebaserules.googleapis.com",
  ])
  project = var.project
  service = each.value

  disable_on_destroy = false
}

# generativelanguage.googleapis.com is designed for experimentation only. A low initial quota
# is set to protect the project. To use Gemini AI in a production environment, migrate to Vertex AI in
# Firebase. See prod.tf for more details.
resource "google_service_usage_consumer_quota_override" "generativelanguage" {
  project        = var.project
  service        = "generativelanguage.googleapis.com"
  metric         = urlencode("generativelanguage.googleapis.com/generate_requests_per_model")
  limit          = urlencode("/min/model/project")
  override_value = "10"
  force          = true

  depends_on = [google_project_service.services["generativelanguage.googleapis.com"]]
}

resource "google_apikeys_key" "generativelanguage" {
  project = var.project

  name         = "gemini-api-key"
  display_name = "Gemini API Key"

  restrictions {
    api_targets {
      service = "generativelanguage.googleapis.com"
    }

    browser_key_restrictions {
      allowed_referrers = ["*"]
    }
  }

  depends_on = [google_project_service.services["apikeys.googleapis.com"]]
}

resource "google_firestore_database" "database" {
  project     = var.project
  name        = "(default)"
  location_id = "nam5"
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.services]
}

resource "google_firebaserules_ruleset" "firestore" {
  project = var.project

  source {
    files {
      content = local_file.firestore_rules.content
      name    = "firestore.rules"
    }
  }

  depends_on = [google_firestore_database.database]
}

resource "google_firebaserules_release" "firestore" {
  project = var.project

  name         = "cloud.firestore"
  ruleset_name = google_firebaserules_ruleset.firestore.name
}

resource "google_firebase_web_app" "example" {
  project = var.project

  display_name = "Make It So AI!"
}

data "google_firebase_web_app_config" "example" {
  project    = var.project
  web_app_id = google_firebase_web_app.example.app_id
}

resource "local_file" "firestore_rules" {
  content = templatefile("${path.module}/firestore.rules.tmpl", {
    # Access to Firestore expires in 30 days
    expiry = formatdate("YYYY, M, D", timeadd(plantimestamp(), "720h"))
  })
  filename = "${path.module}/firestore.rules"
}

resource "local_file" "firebaserc" {
  content = jsonencode({
    projects = {
      default = var.project
    }
  })
  filename = "${path.module}/.firebaserc"
}

resource "local_file" "environment_ts" {
  content = templatefile("${path.module}/src/environments/environments.ts.tmpl", merge(
    data.google_firebase_web_app_config.example,
    {
      project_id     = data.google_project.project.project_id,
      gemini_api_key = google_apikeys_key.generativelanguage.key_string,
      debug_token    = "" # Use local.uuid4 in when using Vertex AI in Firebase
    }
  ))
  filename = "${path.module}/src/environments/environments.ts"
}
