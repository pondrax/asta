#!/bin/bash
set -e

# ===== CONFIG =====
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$APP_DIR/deploy.log"
BRANCH="main"

# ===== ENV (cron-safe) =====
export CI=true
export GCP_BUILDPACKS=true
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

# ===== LOG CLEANUP (keep last 5MB) =====
MAX_SIZE=$((5 * 1024 * 1024)) # 5MB

if [ -f "$LOG_FILE" ]; then
  FILE_SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || wc -c < "$LOG_FILE")

  if [ "$FILE_SIZE" -gt "$MAX_SIZE" ]; then
    tail -c "$MAX_SIZE" "$LOG_FILE" > "${LOG_FILE}.tmp"
    mv "${LOG_FILE}.tmp" "$LOG_FILE"
  fi
fi

# ===== LOG FUNCTION =====
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# ===== START =====
log "🔍 Checking for updates..."

git fetch origin

LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/$BRANCH)

if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
  log "🔄 Updates found, deploying..."
  
  git pull origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

  log "📦 Installing dependencies..."
  pnpm install --frozen-lockfile 
  
  log "🔨 Building..."
  pnpm run build

  log "🚀 Restarting app..."
  if pm2 describe asta > /dev/null 2>&1; then
    pm2 restart asta
  else
    pm2 start pnpm --name asta -- run start
  fi 2>&1 | tee -a "$LOG_FILE"


  log "✅ Deploy complete"
else
  log "✅ Already up to date"
fi
