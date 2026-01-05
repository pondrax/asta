#!/bin/bash
set -e

# ===== CONFIG =====
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$APP_DIR/deploy.log"
BRANCH="main"

# Cron-safe PATH
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$APP_DIR"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log "🔍 Checking for updates..."

git fetch origin

LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/$BRANCH)

if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
    log "🔄 Updates found, deploying..."

    git pull origin "$BRANCH"

    log "📦 Installing dependencies..."
    pnpm install --frozen-lockfile || pnpm install

    log "🔨 Building..."
    pnpm run build

    log "🚀 Restarting app..."
    pm2 restart asta

    log "✅ Deploy complete"
else
    log "✅ Already up to date"
fi
