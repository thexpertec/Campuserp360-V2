#!/usr/bin/env bash
# Dev front door for the CCM multi-tenant stack.
#
# Every app now runs as its own Replit artifact workflow on a fixed port:
#   api-server        :8080   (/api, /uploads)
#   candidate-portal  :8000   (/portal, Streamlit)
#   ccm-admin         :25521  (/admin/)
#   saas-admin        :9000   (/saas/)
#   ccm-website       :21792  (/)
#   mockup-sandbox    :8081   (/__mockup)
#
# This script only launches the gateway, which PROXIES to those ports (it never
# binds them itself), giving a single unified preview URL on port 5000. Replit's
# own path router also serves each artifact directly at its previewPath.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[dev-all] starting gateway front door (:5000) -> managed artifact services"
exec env \
  NODE_ENV=development \
  PORT=5000 \
  API_PORT=8080 \
  PORTAL_PORT=8000 \
  ADMIN_PORT=25521 \
  SAAS_PORT=9000 \
  WEBSITE_PORT=21792 \
  MOCKUP_PORT=8081 \
  DEFAULT_TENANT_SLUG=ccm \
  TENANT_SLUGS=ccm \
  node artifacts/gateway/gateway.mjs
