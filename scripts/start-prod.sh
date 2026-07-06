#!/usr/bin/env bash
# Production launcher for the CCM single-application (gateway) deployment.
# The gateway is the public front door on $PORT (set by Replit). It serves the
# three frontend static builds and proxies /api + /uploads to the api-server and
# /portal to the Streamlit candidate-portal, both started here as child
# processes on fixed local ports.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pids=()
cleanup() {
  for p in "${pids[@]:-}"; do
    kill "$p" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

# The gateway is the public front door and binds Replit's $PORT (8080 in
# autoscale/Cloud Run). Every child service it proxies to MUST listen on a
# DIFFERENT internal port, or it would grab $PORT first and the gateway's
# listen() would fail with EADDRINUSE — killing the front door and failing the
# /api/healthz probe. The guards below shift the internal ports if the injected
# public $PORT ever coincides with a default child port.
GATEWAY_PORT="${PORT:-5000}"
API_PORT=3001
PORTAL_PORT=8000
[ "${API_PORT}" = "${GATEWAY_PORT}" ] && API_PORT=3002
[ "${PORTAL_PORT}" = "${GATEWAY_PORT}" ] && PORTAL_PORT=8002

echo "[prod] starting api-server (:${API_PORT})"
PORT="${API_PORT}" NODE_ENV=production node --enable-source-maps artifacts/api-server/dist/index.mjs &
pids+=($!)

echo "[prod] starting candidate-portal Streamlit (:${PORTAL_PORT})"
( cd artifacts/candidate-portal && "$ROOT/.pythonlibs/bin/streamlit" run app.py \
  --server.port "${PORTAL_PORT}" \
  --server.address 0.0.0.0 \
  --server.baseUrlPath portal \
  --server.headless true ) &
pids+=($!)

echo "[prod] starting gateway front door (:${GATEWAY_PORT})"
exec env \
  NODE_ENV=production \
  API_PORT="${API_PORT}" \
  PORTAL_PORT="${PORTAL_PORT}" \
  DEFAULT_TENANT_SLUG=ccm \
  TENANT_SLUGS=ccm \
  node artifacts/gateway/gateway.mjs
