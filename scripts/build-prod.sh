#!/usr/bin/env bash
# Production build for the CCM api-server artifact.
# Builds composite libs and the api-server bundle, plus the Python deps used by
# the candidate-portal Streamlit app.
#
# The three Vite frontends (ccm-website, ccm-admin, saas-admin) are each built
# by their own artifact's [services.production.build] command, which supplies
# the correct BASE_PATH and NODE_ENV via [services.production.build.env].
# Do NOT add frontend builds here — that would create a second build pass that
# could overwrite the per-artifact builds with wrong env vars.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[build] composite libs"
pnpm run typecheck:libs

echo "[build] api-server bundle"
NODE_ENV=production pnpm --filter @workspace/api-server run build

echo "[build] done"
