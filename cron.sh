#!/bin/bash
set -e

# ===== CONFIG =====
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$APP_DIR/deploy.log"
BRANCH="main"

# ===== ENV (cron-safe) =====
export CI=true
export PATH="/usr/bin:/bin:/usr/local/bin:$HOME/.local/bin"

# Ensure HOME exists
if [ -z "$HOME" ]; then
  HOME="$(cd ~ 2>/dev/null && pwd)"
  export HOME
fi
# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"


# ===== LOCK (no flock) =====
LOCKDIR="/tmp/deploy-asta.lock"

if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - ⏳ Deploy already running. Exit."
  exit 0
fi

# Remove lock on exit (even if error)
trap 'rmdir "$LOCKDIR"' EXIT

cd "$APP_DIR"

# ===== LOG FUNCTION =====
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# ===== START =====
log "🔍 Checking for updates..."

git fetch origin

LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/$BRANCH)

# if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
  log "🔄 Updates found, deploying..."

  git pull origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

  log "📦 Installing dependencies..."
  pnpm install --frozen-lockfile --reporter=append-only \
    2>&1 | tee -a "$LOG_FILE"

  log "🔨 Building..."
  pnpm run build 2>&1 | tee -a "$LOG_FILE"

  log "🚀 Restarting app..."
    #   pm2 restart asta 2>&1 | tee -a "$LOG_FILE"
  if pm2 describe asta > /dev/null 2>&1; then
    pm2 restart asta
  else
    pm2 start pnpm --name asta -- run start
  fi 2>&1 | tee -a "$LOG_FILE"


  log "✅ Deploy complete"
# else
#   log "✅ Already up to date"
# fi
