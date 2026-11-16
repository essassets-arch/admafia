#!/usr/bin/env bash
# ==============================================================================
# Ad Mafia CRM — Official Pure-Docker Deployment & Rollback CLI (`deploy.sh`)
# ==============================================================================
# Architecture: 100% Docker Compose (`mongo` rs0, `redis`, `backend`, `frontend`,
#               `mongo-express`). Zero host npm/PM2 pollution. Never overwrites
#               Host Nginx (`/etc/nginx/sites-available/*`) or `.env` secrets.
#
# Usage (on VPS `/home/ubuntu/admafia` or Local Staging):
#   ./deploy.sh                     # Standard VPS deploy (snapshot + pull + build + verify)
#   ./deploy.sh --fast              # Skip pre-deploy MongoDB snapshot
#   ./deploy.sh --no-cache          # Full clean Docker image rebuild (--no-cache)
#   ./deploy.sh --branch <name>     # Deploy a specific Git branch (default: main)
#   ./deploy.sh --rollback [ref]    # Roll back code to previous SHA (default: HEAD~1)
#   ./deploy.sh --local             # Build & verify isolated local stack (docker-compose.local.yml)
#   ./deploy.sh --status            # Inspect running containers, Git SHA & live /api/health
# ==============================================================================
set -euo pipefail

# Wrapped in `main()` so `git reset --hard` updating `deploy.sh` on disk mid-run
# never affects the currently executing Bash parse buffer.
main() {
  local APP_DIR
  APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "${APP_DIR}"

  local MODE="prod"
  local BRANCH="main"
  local SKIP_BACKUP=0
  local NO_CACHE=0
  local ROLLBACK_REF=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fast|--skip-backup)
        SKIP_BACKUP=1
        shift
        ;;
      --no-cache|--rebuild)
        NO_CACHE=1
        shift
        ;;
      --local)
        MODE="local"
        shift
        ;;
      --status)
        MODE="status"
        shift
        ;;
      --branch)
        BRANCH="${2:-main}"
        shift 2
        ;;
      --rollback)
        MODE="rollback"
        if [[ $# -ge 2 && ! "$2" =~ ^-- ]]; then
          ROLLBACK_REF="$2"
          shift 2
        else
          ROLLBACK_REF="HEAD~1"
          shift
        fi
        ;;
      -h|--help)
        sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
        return 0
        ;;
      *)
        echo "❌ Unknown option: $1 (run ./deploy.sh --help)"
        return 1
        ;;
    esac
  done

  # Verify Docker & Docker Compose plugin
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "❌ Error: Docker Engine and 'docker compose' plugin are required."
    return 1
  fi

  local COMPOSE_FILE="docker-compose.yml"
  local API_HEALTH_URL="http://127.0.0.1:5000/api/health"
  local WEB_URL="http://127.0.0.1:5050/"
  local BACKEND_CONTAINER="admafia-backend"
  local MONGO_CONTAINER="admafia-mongo"

  if [[ "${MODE}" == "local" ]]; then
    COMPOSE_FILE="docker-compose.local.yml"
    API_HEALTH_URL="http://127.0.0.1:5001/api/health"
    WEB_URL="http://127.0.0.1:5051/"
    BACKEND_CONTAINER="admafia-backend-local"
    MONGO_CONTAINER="admafia-mongo-local"
  fi

  # ----------------------------------------------------------------------------
  # STATUS MODE (`./deploy.sh --status`)
  # ----------------------------------------------------------------------------
  if [[ "${MODE}" == "status" ]]; then
    echo "======================================================================"
    echo "📊 Ad Mafia CRM — Live Stack Status (${APP_DIR})"
    echo "======================================================================"
    echo "🔖 Git Commit : $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown') — $(git log -1 --pretty=%s 2>/dev/null || echo '')"
    echo "🌿 Git Branch : $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
    echo ""
    docker compose -f "${COMPOSE_FILE}" ps
    echo ""
    echo "🩺 API Health (${API_HEALTH_URL}):"
    curl -fsS "${API_HEALTH_URL}" && echo "" || echo "⚠️  API health endpoint unreachable"
    return 0
  fi

  # ----------------------------------------------------------------------------
  # LOCAL STAGING MODE (`./deploy.sh --local`)
  # ----------------------------------------------------------------------------
  if [[ "${MODE}" == "local" ]]; then
    echo "======================================================================"
    echo "🧪 Deploying Isolated Local Docker Stack (${COMPOSE_FILE})"
    echo "======================================================================"
    if [[ "${NO_CACHE}" -eq 1 ]]; then
      docker compose -f "${COMPOSE_FILE}" build --no-cache
    fi
    docker compose -f "${COMPOSE_FILE}" up -d --build --remove-orphans
    wait_for_health "${API_HEALTH_URL}" "${WEB_URL}" "${BACKEND_CONTAINER}"
    docker compose -f "${COMPOSE_FILE}" ps
    echo ""
    echo "✅ Local Staging Ready:"
    echo "   • Frontend SPA : http://127.0.0.1:5051"
    echo "   • Backend API  : http://127.0.0.1:5001/api/health"
    echo "   • Mongo Express: http://127.0.0.1:8081"
    echo "   • Compass URI  : mongodb://127.0.0.1:27018/admafia_crm?directConnection=true"
    return 0
  fi

  # ----------------------------------------------------------------------------
  # PRODUCTION DEPLOY / ROLLBACK MODE (`docker-compose.yml`)
  # ----------------------------------------------------------------------------
  local PREV_SHA
  PREV_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'none')"

  echo "======================================================================"
  if [[ "${MODE}" == "rollback" ]]; then
    echo "⏪ Ad Mafia CRM — Rolling Back Production Stack to '${ROLLBACK_REF}'"
  else
    echo "🚀 Ad Mafia CRM — Deploying Production Stack (branch: ${BRANCH})"
  fi
  echo "📂 Directory    : ${APP_DIR}"
  echo "🔖 Previous SHA : ${PREV_SHA}"
  echo "======================================================================"

  # 1. Pre-Deploy Atomic Point-in-Time MongoDB Snapshot (`--oplog` + AES-256)
  if [[ "${SKIP_BACKUP}" -eq 0 ]] && docker ps --format '{{.Names}}' | grep -q "^${MONGO_CONTAINER}$"; then
    if [[ -f "${APP_DIR}/backend/scripts/snapshot-backup.sh" ]]; then
      echo "🛡️  [1/5] Taking pre-deploy point-in-time MongoDB --oplog snapshot..."
      local SNAP_PASS=""
      local SNAP_RCLONE=""
      for ef in "${APP_DIR}/.env" "${APP_DIR}/backend/.env" "${APP_DIR}/backend/.env.local"; do
        if [[ -f "${ef}" ]]; then
          local p r
          p="$(grep -E '^BACKUP_PASSPHRASE=' "${ef}" | tail -n 1 | cut -d'=' -f2- | tr -d '\r"' || true)"
          r="$(grep -E '^RCLONE_REMOTE=' "${ef}" | tail -n 1 | cut -d'=' -f2- | tr -d '\r"' || true)"
          [[ -n "${p}" ]] && SNAP_PASS="${p}"
          [[ -n "${r}" ]] && SNAP_RCLONE="${r}"
        fi
      done
      BACKUP_DIR="${APP_DIR}/backups" \
      MONGO_CONTAINER="${MONGO_CONTAINER}" \
      BACKUP_PASSPHRASE="${SNAP_PASS}" \
      RCLONE_REMOTE="${SNAP_RCLONE}" \
        bash "${APP_DIR}/backend/scripts/snapshot-backup.sh"
    fi
  else
    echo "⏭️  [1/5] Skipping pre-deploy snapshot ($([[ "${SKIP_BACKUP}" -eq 1 ]] && echo '--fast flag set' || echo 'mongo container not yet running'))."
  fi

  # 2. Safeguard all private git-ignored secret files across Git operations
  echo "🔐 [2/5] Safeguarding private environment & credential files..."
  local SECRET_BACKUP_DIR
  SECRET_BACKUP_DIR="$(mktemp -d)"
  trap 'rm -rf "${SECRET_BACKUP_DIR}"' EXIT

  local SECRET_FILES=(
    ".env"
    "backend/.env"
    "backend/.env.local"
    "backend/firebase-service-account.json"
    "frontend/.env.local"
  )
  for sf in "${SECRET_FILES[@]}"; do
    if [[ -f "${APP_DIR}/${sf}" ]]; then
      mkdir -p "${SECRET_BACKUP_DIR}/$(dirname "${sf}")"
      cp -p "${APP_DIR}/${sf}" "${SECRET_BACKUP_DIR}/${sf}"
    fi
  done

  # 3. Sync Git repository cleanly to target commit
  if [[ "${MODE}" == "rollback" ]]; then
    echo "📥 [3/5] Resetting repository to rollback target (${ROLLBACK_REF})..."
    git reset --hard "${ROLLBACK_REF}"
  else
    echo "📥 [3/5] Fetching latest commits from origin/${BRANCH}..."
    git fetch origin "${BRANCH}"
    git checkout -B "${BRANCH}" "origin/${BRANCH}"
    git reset --hard "origin/${BRANCH}"
  fi

  # Restore private secret files with strict 600 permissions
  for sf in "${SECRET_FILES[@]}"; do
    if [[ -f "${SECRET_BACKUP_DIR}/${sf}" ]]; then
      mkdir -p "${APP_DIR}/$(dirname "${sf}")"
      cp -p "${SECRET_BACKUP_DIR}/${sf}" "${APP_DIR}/${sf}"
      chmod 600 "${APP_DIR}/${sf}" || true
    fi
  done

  local NEW_SHA
  NEW_SHA="$(git rev-parse --short HEAD)"
  echo "✓ Repository now at ${NEW_SHA}: $(git log -1 --pretty=%s)"

  # Detect whether backend npm dependencies changed so anonymous `/app/node_modules` refreshes cleanly
  local RENEW_BACKEND_DEPS=0
  if [[ "${PREV_SHA}" != "none" && "${PREV_SHA}" != "${NEW_SHA}" ]]; then
    if ! git diff --quiet "${PREV_SHA}" "${NEW_SHA}" -- backend/package.json backend/package-lock.json 2>/dev/null; then
      RENEW_BACKEND_DEPS=1
    fi
  fi

  # 4. Build & Launch Pure Docker Compose Stack
  echo "🐳 [4/5] Building & updating Docker Compose services..."
  docker compose -f "${COMPOSE_FILE}" up -d mongo redis

  if [[ "${NO_CACHE}" -eq 1 ]]; then
    docker compose -f "${COMPOSE_FILE}" build --no-cache backend frontend
    RENEW_BACKEND_DEPS=1
  else
    docker compose -f "${COMPOSE_FILE}" build backend frontend
  fi

  if [[ "${RENEW_BACKEND_DEPS}" -eq 1 ]]; then
    echo "📦 Backend dependencies updated — refreshing backend anonymous node_modules volume..."
    docker compose -f "${COMPOSE_FILE}" up -d --renew-anon-volumes backend
  fi

  docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

  # 5. Live Readiness & Health Verification + Image Cleanup
  echo "🩺 [5/5] Verifying live API, MongoDB rs0 & Nginx SPA health..."
  if ! wait_for_health "${API_HEALTH_URL}" "${WEB_URL}" "${BACKEND_CONTAINER}"; then
    echo ""
    echo "❌ DEPLOYMENT HEALTH CHECK FAILED!"
    echo "   To roll back immediately to ${PREV_SHA}, run:"
    echo "     ./deploy.sh --rollback ${PREV_SHA} --fast"
    return 1
  fi

  # Prune dangling `<none>` build layers to keep VPS disk healthy
  docker image prune -f >/dev/null 2>&1 || true

  echo ""
  echo "📋 Active Docker Containers:"
  docker compose -f "${COMPOSE_FILE}" ps
  echo ""
  echo "======================================================================"
  echo "✅ DEPLOYMENT COMPLETE — https://admafia.marketing IS 100% LIVE!"
  echo "🔖 Deployed Commit : ${NEW_SHA} (previous: ${PREV_SHA})"
  echo "⏪ Quick Rollback  : ./deploy.sh --rollback ${PREV_SHA} --fast"
  echo "======================================================================"
}

wait_for_health() {
  local api_url="$1"
  local web_url="$2"
  local backend_container="$3"
  local max_attempts=30
  local attempt=1

  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    local health_json=""
    health_json="$(curl -fsS --max-time 3 "${api_url}" 2>/dev/null || true)"
    if [[ "${health_json}" == *'"ok":true'* && "${health_json}" == *'"connected":true'* ]]; then
      local web_code=""
      web_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${web_url}" 2>/dev/null || echo '000')"
      if [[ "${web_code}" == "200" ]]; then
        echo "✓ Backend API + MongoDB rs0 healthy & Frontend Nginx serving HTTP 200 (attempt ${attempt}/${max_attempts})."
        return 0
      fi
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  echo "⚠️  Timed out waiting for healthy stack. Recent ${backend_container} logs:"
  docker logs --tail 40 "${backend_container}" 2>&1 || true
  return 1
}

main "$@"
exit 0
