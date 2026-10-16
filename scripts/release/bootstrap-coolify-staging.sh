#!/usr/bin/env bash
set -Eeuo pipefail

required=(
  COOLIFY_API_URL
  COOLIFY_TOKEN
  COOLIFY_PROJECT_UUID
  COOLIFY_SERVER_UUID
)

fail() {
  echo "error: $*" >&2
  exit 1
}

for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || fail "$name is required"
done

for command in curl jq; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

[[ "$COOLIFY_API_URL" == https://* ]] || fail "COOLIFY_API_URL must use HTTPS"

COOLIFY_ENVIRONMENT_NAME="${COOLIFY_ENVIRONMENT_NAME:-staging}"
COOLIFY_APPLICATION_NAME="${COOLIFY_APPLICATION_NAME:-valoo-staging}"
GIT_REPOSITORY="${GIT_REPOSITORY:-https://github.com/kaanb-wiascode/beauty}"
GIT_BRANCH="${GIT_BRANCH:-feature/core-commerce-foundation}"
COMPOSE_LOCATION="${COMPOSE_LOCATION:-/infrastructure/docker-compose.coolify.staging.yml}"

api_base="${COOLIFY_API_URL%/}"

payload="$(
  jq -nc     --arg project_uuid "$COOLIFY_PROJECT_UUID"     --arg server_uuid "$COOLIFY_SERVER_UUID"     --arg environment_name "$COOLIFY_ENVIRONMENT_NAME"     --arg git_repository "$GIT_REPOSITORY"     --arg git_branch "$GIT_BRANCH"     --arg name "$COOLIFY_APPLICATION_NAME"     --arg docker_compose_location "$COMPOSE_LOCATION"     '{
      project_uuid:$project_uuid,
      server_uuid:$server_uuid,
      environment_name:$environment_name,
      git_repository:$git_repository,
      git_branch:$git_branch,
      build_pack:"dockercompose",
      name:$name,
      docker_compose_location:$docker_compose_location,
      is_auto_deploy_enabled:false,
      is_force_https_enabled:true,
      is_preview_deployments_enabled:false,
      autogenerate_domain:true,
      instant_deploy:false,
      connect_to_docker_network:true,
      is_raw_compose_deployment_enabled:true,
      tags:["valoo","staging"]
    }'
)"

response="$(
  curl --fail --silent --show-error     --request POST     --header "Authorization: Bearer $COOLIFY_TOKEN"     --header "Content-Type: application/json"     --data "$payload"     "$api_base/applications/public"
)" || fail "Coolify staging application creation failed"

application_uuid="$(jq -r '.uuid // empty' <<<"$response")"
[[ -n "$application_uuid" ]] || {
  echo "$response" >&2
  fail "Coolify did not return an application UUID"
}

echo "COOLIFY_STAGING_APPLICATION_UUID=$application_uuid"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "application_uuid=$application_uuid" >> "$GITHUB_OUTPUT"
fi

echo "Coolify staging application created: $application_uuid"
